/**
 * Moteur de Caviardage Local & Souverain — 100% exécuté dans le navigateur.
 *
 * RÈGLE D'OR : Aucun octet n'est envoyé à un tiers. Aucun sous-traitant. Aucun DPA.
 * Le caviardage opère par destruction définitive du texte sur canvas haute résolution,
 * ré-encapsulation dans un nouveau conteneur PDF vierge via pdf-lib, et purge complète
 * des métadonnées.
 */
import { PDFDocument } from 'pdf-lib'

// Inclusion du moteur PDF.js autonome
import '../vendor/pdf.min.js'

/**
 * Motifs réglementaires et RGPD prédéfinis.
 */
export const PRESET_PATTERNS = {
  gdpr: [
    // Emails
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    // Téléphones (formats FR, INT, US)
    /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?0\d\)?[\s.-]?)?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/g,
    // IBAN
    /[A-Z]{2}\d{2}[\s-]?[A-Z0-9]{4}[\s-]?[A-Z0-9]{4}[\s-]?[A-Z0-9]{4}[\s-]?[A-Z0-9]{4}[\s-]?[A-Z0-9]{0,4}/gi,
    // Cartes bancaires (Visa, Mastercard, etc.)
    /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
    // Numéro de sécurité sociale / NIR (France: 13 ou 15 chiffres)
    /\b[12][\s.-]?\d{2}[\s.-]?(?:0[1-9]|1[0-2])[\s.-]?(?:2[AB]|\d{2})[\s.-]?\d{3}[\s.-]?\d{3}(?:[\s.-]?\d{2})?\b/g,
  ],
  sensitiveIdentifiers: [
    'Creditor',
    'Statutory Work',
    'Statutory',
    'Redacted',
    'Forbidden',
    'Confidential',
    'Secret',
    'Strictly Confidential',
    'Internal Only',
    'Do Not Distribute',
    'Privileged',
    'Non divulgable',
    'Confidentiel',
    'Confidentielle',
    'Secret Médical',
    'Secret Professionnel',
    'Diffusion Restreinte',
    'Usage Interne',
    'Strictement Confidentiel',
  ],
}

/**
 * Échappe les caractères réservés regex.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Émis par webpack comme fichier séparé, servi depuis le même dossier js/.
const workerUrl = new URL('../vendor/pdf.worker.min.js', import.meta.url)

/**
 * Initialise l'environnement PDF.js en mode 100% hors-ligne (fake-worker local).
 */
export function getPdfJs() {
  const lib = typeof window !== 'undefined' ? window.pdfjsLib : (globalThis.pdfjsLib || null)
  if (!lib) {
    throw new Error('PDF.js engine is not initialized')
  }
  if (lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = workerUrl.toString()
  }
  return lib
}

/**
 * Inspection synchrone de la structure PDF.
 * @param {Uint8Array} bytes Octets du fichier PDF
 * @returns {{ encrypted: boolean, incrementalRevisions: number, pageCount: number }}
 */
export function inspectPdf(bytes) {
  if (!bytes || !(bytes instanceof Uint8Array)) {
    return { encrypted: false, incrementalRevisions: 1, pageCount: 0 }
  }

  // Décodage rapide en chaîne binaire (latin1) pour analyse structurelle
  const decoder = new TextDecoder('latin1')
  const str = decoder.decode(bytes)

  // 1. Détection de protection par mot de passe ou chiffrement (/Encrypt)
  const encrypted = /\/Encrypt\s+(\d+\s+\d+\s+R|<<)/.test(str)

  // 2. Comptage des révisions incrémentales (marqueurs %%EOF)
  const eofMatches = str.match(/%%EOF/g)
  const incrementalRevisions = eofMatches ? eofMatches.length : 1

  // 3. Estimation du nombre de pages (/Type /Page)
  const pageMatches = str.match(/\/Type\s*\/Page\b/g)
  const pageCount = pageMatches ? pageMatches.length : 1

  return {
    encrypted,
    incrementalRevisions,
    pageCount,
  }
}

/**
 * Convertit un DataURL PNG en Uint8Array d'octets bruts.
 * @param {string} dataUrl
 * @returns {Uint8Array}
 */
function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1]
  const bin = atob(b64)
  const len = bin.length
  const arr = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    arr[i] = bin.charCodeAt(i)
  }
  return arr
}

/**
 * Extrait le flux textuel complet d'une page PDF avec cartographie exacte
 * caractère par caractère vers les TextItems d'origine.
 *
 * @param {Object} page Objet page PDF.js
 * @returns {Promise<{ fullText: string, charMap: Array<{itemIndex: number, charOffset: number, item: Object}>, items: Array<Object> }>}
 */
export async function extractPageTextMap(page) {
  const textContent = await page.getTextContent()
  const items = textContent.items || []

  let fullText = ''
  const charMap = []

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it.str) continue

    // Insertion d'un espace virtuel si nécessaire entre deux items distincts
    if (fullText.length > 0 && !fullText.endsWith(' ') && !fullText.endsWith('\n')) {
      fullText += ' '
      charMap.push({ itemIndex: -1, charOffset: 0, item: null })
    }

    for (let c = 0; c < it.str.length; c++) {
      charMap.push({
        itemIndex: i,
        charOffset: c,
        item: it,
      })
    }
    fullText += it.str
  }

  return { fullText, charMap, items }
}

/* Largeur relative d'un caractère dans une police à chasse variable de type
   Helvetica / Arial (millièmes de cadratin). PDF.js donne la largeur d'un
   morceau de texte entier, pas celle de chaque lettre : il faut l'estimer. */
function chasse(car) {
  if (" .,:;!|'ijl".includes(car)) return 250
  if ('ftIr()[]-/"'.includes(car)) return 310
  if ('mMW@%'.includes(car)) return 880
  if (car === 'w') return 720
  if (car >= '0' && car <= '9') return 556
  if (car >= 'A' && car <= 'Z') return 690
  if (car.toLowerCase() !== car) return 690 // capitales accentuées
  return 530
}

/**
 * Étendue horizontale, dans un morceau de texte de largeur connue, des
 * caractères `debut` à `fin` inclus.
 *
 * Deux estimations sont faites — chasse fixe (exacte pour une police à chasse
 * fixe) et chasse variable (proche pour Helvetica, Arial et voisines) — et
 * c'est leur réunion, élargie d'une marge, qui est rendue. Supposer une chasse
 * fixe partout laissait dépasser la première ou la dernière lettre d'un mot
 * caviardé. Noircir un peu trop est sans conséquence ; laisser lire une lettre
 * ne l'est pas.
 *
 * @param {string} texte Le morceau de texte entier
 * @param {number} largeur Sa largeur, en unités de page
 * @param {number} debut Indice du premier caractère à couvrir
 * @param {number} fin Indice du dernier caractère à couvrir
 * @returns {{ de: number, a: number }} Décalages depuis le début du morceau
 */
export function etendueHorizontale(texte, largeur, debut, fin) {
  if (typeof texte !== 'string' || texte.length === 0) throw new TypeError('Texte attendu, non vide.')
  if (!Number.isFinite(largeur) || largeur < 0) throw new RangeError('Largeur invalide.')
  if (!Number.isInteger(debut) || !Number.isInteger(fin) || debut < 0 || fin < debut || fin >= texte.length) {
    throw new RangeError('Indices hors du texte.')
  }
  const fixe = largeur / texte.length
  let total = 0
  let avant = 0
  let jusqua = 0
  for (let i = 0; i < texte.length; i++) {
    if (i === debut) avant = total
    total += chasse(texte[i])
    if (i === fin) jusqua = total
  }
  const marge = fixe * 0.6
  return {
    de: Math.min(debut * fixe, largeur * avant / total) - marge,
    a: Math.max((fin + 1) * fixe, largeur * jusqua / total) + marge,
  }
}

/**
 * Calcule l'ensemble des boîtes de caviardage pour une page donnée
 * en fonction des termes recherchés et des profils activés.
 *
 * @param {Object} page Objet page PDF.js
 * @param {Object} vp Viewport PDF.js
 * @param {Object} textMap Résultat de extractPageTextMap
 * @param {Object} options Options de détection
 * @returns {Array<{ page: number, x: number, y: number, width: number, height: number, normX: number, normY: number, normWidth: number, normHeight: number, term: string, matchText: string }>}
 */
export function calculateTextMatchBoxes(page, vp, textMap, options = {}) {
  const pdfjs = getPdfJs()
  const { fullText, charMap } = textMap
  if (!fullText) return []

  const matchCase = Boolean(options.matchCase)
  const flags = matchCase ? 'g' : 'gi'

  // Normalisation des termes de recherche
  const patternsToSearch = []

  // 1. Termes personnalisés
  let userTerms = []
  if (Array.isArray(options.terms)) {
    userTerms = options.terms
  } else if (typeof options.terms === 'string') {
    userTerms = options.terms.split(/[,\r\n]+/).map((s) => s.trim()).filter(Boolean)
  }

  for (const t of userTerms) {
    if (!t) continue
    if (t.startsWith('/') && t.lastIndexOf('/') > 0) {
      try {
        const lastSlash = t.lastIndexOf('/')
        const pat = t.slice(1, lastSlash)
        const f = t.slice(lastSlash + 1) || flags
        patternsToSearch.push({ re: new RegExp(pat, f.includes('g') ? f : f + 'g'), label: t })
        continue
      } catch (e) {
        // Fallback standard
      }
    }
    // Tolérance aux espaces multiples et sauts de ligne
    const escaped = escapeRegExp(t).replace(/\s+/g, '\\s+')
    patternsToSearch.push({
      re: new RegExp(escaped, flags),
      label: t,
    })
  }

  // 2. Identifiants sensibles pré-configurés
  if (options.detectSensitiveIdentifiers) {
    for (const term of PRESET_PATTERNS.sensitiveIdentifiers) {
      const escaped = escapeRegExp(term).replace(/\s+/g, '\\s+')
      patternsToSearch.push({
        re: new RegExp(`\\b${escaped}\\b|${escaped}`, 'gi'),
        label: term,
      })
    }
  }

  // 3. Motifs RGPD / PII
  if (options.detectGdpr) {
    for (const regex of PRESET_PATTERNS.gdpr) {
      patternsToSearch.push({
        re: new RegExp(regex.source, regex.flags),
        label: 'GDPR / PII',
      })
    }
  }

  const boxes = []
  const pageNum = page.pageNumber

  for (const { re, label } of patternsToSearch) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(fullText)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex++
        continue
      }

      const matchStart = match.index
      const matchEnd = match.index + match[0].length

      // Trouver tous les textItems impliqués dans cette correspondance
      const matchedItems = new Map()
      for (let c = matchStart; c < matchEnd; c++) {
        const entry = charMap[c]
        if (entry && entry.itemIndex >= 0 && entry.item) {
          if (!matchedItems.has(entry.itemIndex)) {
            matchedItems.set(entry.itemIndex, { item: entry.item, offsets: [] })
          }
          matchedItems.get(entry.itemIndex).offsets.push(entry.charOffset)
        }
      }

      // Convertir chaque morceau de texte en boîte sur le viewport
      for (const [idx, data] of matchedItems) {
        const it = data.item
        const offsets = data.offsets
        if (!it.str || !it.str.length) continue

        const minOffset = Math.min(...offsets)
        const maxOffset = Math.max(...offsets)

        const etendue = etendueHorizontale(it.str, it.width || 0, minOffset, maxOffset)
        const x1 = it.transform[4] + etendue.de
        const x2 = it.transform[4] + etendue.a

        const fontSize = Math.hypot(it.transform[2], it.transform[3]) || it.height || 12
        const yBase = it.transform[5]
        const y1 = yBase - fontSize * 0.28 // descente (g, y, p...)
        const y2 = yBase + fontSize * 0.92 // montée (h, t, majuscules...)

        // Projection directe dans le système de coordonnées du Viewport (gère la rotation à 100%)
        const vpRect = vp.convertToViewportRectangle([x1, y1, x2, y2])
        const norm = pdfjs.Util.normalizeRect(vpRect)

        const boxX = Math.max(0, norm[0] - 2)
        const boxY = Math.max(0, norm[1] - 2)
        const boxW = Math.min(vp.width, (norm[2] - norm[0]) + 4)
        const boxH = Math.min(vp.height, (norm[3] - norm[1]) + 4)

        boxes.push({
          page: pageNum,
          x: boxX,
          y: boxY,
          width: boxW,
          height: boxH,
          normX: boxX / vp.width,
          normY: boxY / vp.height,
          normWidth: boxW / vp.width,
          normHeight: boxH / vp.height,
          term: label,
          matchText: match[0],
        })
      }
    }
  }

  return boxes
}

/**
 * Caviarde un PDF en détruisant de manière irréversible les données confidentielles.
 *
 * @param {Uint8Array} bytes Fichier source
 * @param {Object} options Options de caviardage
 * @param {string[]|string} [options.terms] Termes ou expressions à masquer
 * @param {boolean} [options.matchCase=false] Sensibilité à la casse
 * @param {boolean} [options.detectGdpr=false] Caviarder les emails, téléphones, IBANs, etc.
 * @param {boolean} [options.detectSensitiveIdentifiers=false] Identifiants sensibles (Statutory, Creditor...)
 * @param {number} [options.scale=2] Échelle de rendu (2 = ~150-200 DPI, 3 = 300 DPI)
 * @param {Array<{page: number, normX?: number, normY?: number, normWidth?: number, normHeight?: number, x?: number, y?: number, width?: number, height?: number, normalized?: boolean}>} [options.manualBoxes]
 * @returns {Promise<Uint8Array>} Nouveau PDF caviardé à révision unique sans texte résiduel
 */
export async function redactPdf(bytes, options = {}) {
  const pdfjs = getPdfJs()
  const scale = typeof options.scale === 'number' && options.scale > 0 ? options.scale : 2
  const manualBoxes = Array.isArray(options.manualBoxes) ? options.manualBoxes : []

  // Chargement du PDF source dans PDF.js local (copie défensive des octets pour éviter le détachement)
  const inputData = bytes instanceof Uint8Array ? bytes.slice() : bytes
  const loadingTask = pdfjs.getDocument({
    data: inputData,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const srcDoc = await loadingTask.promise

  // Création du nouveau document PDF de destination (100% vierge)
  //
  // updateMetadata: false — sans lui, pdf-lib inscrit la date et l'heure
  // exactes du traitement (CreationDate, ModDate) et son propre nom comme
  // producteur. Le document produit ne doit rien porter : ni de l'original,
  // ni du traitement. Contrôlé par scripts/verifier-sortie.mjs.
  const outDoc = await PDFDocument.create({ updateMetadata: false })

  for (let pageNum = 1; pageNum <= srcDoc.numPages; pageNum++) {
    const page = await srcDoc.getPage(pageNum)
    const vp1 = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale })

    // Rendu sur canvas local haute résolution
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width)
    canvas.height = Math.round(vp.height)
    const ctx = canvas.getContext('2d')

    await page.render({ canvasContext: ctx, viewport: vp }).promise

    // 1. Détection intelligente des termes et motifs textuels
    const textMap = await extractPageTextMap(page)
    const textMatchBoxes = calculateTextMatchBoxes(page, vp, textMap, options)

    // Application destructive : rectangles noirs opaques sur le canvas
    ctx.fillStyle = '#000000'

    for (const b of textMatchBoxes) {
      ctx.fillRect(b.x, b.y, b.width, b.height)
    }

    // 2. Application des zones manuelles dessinées sur cette page
    const pageBoxes = manualBoxes.filter((b) => b.page === pageNum)
    for (const b of pageBoxes) {
      const bx = typeof b.normX === 'number' ? b.normX * vp.width : (b.normalized ? b.x * vp.width : b.x * (scale / (b.renderScale || 1)))
      const by = typeof b.normY === 'number' ? b.normY * vp.height : (b.normalized ? b.y * vp.height : b.y * (scale / (b.renderScale || 1)))
      const bw = typeof b.normWidth === 'number' ? b.normWidth * vp.width : (b.normalized ? b.width * vp.width : b.width * (scale / (b.renderScale || 1)))
      const bh = typeof b.normHeight === 'number' ? b.normHeight * vp.height : (b.normalized ? b.height * vp.height : b.height * (scale / (b.renderScale || 1)))
      ctx.fillRect(bx, by, bw, bh)
    }

    // Rasterisation destructive en image PNG (détruit définitivement les calques vectoriels et texte)
    const pngDataUrl = canvas.toDataURL('image/png')
    const pngBytes = dataUrlToBytes(pngDataUrl)

    // Intégration de la page rasterisée dans le conteneur vierge
    const embeddedImg = await outDoc.embedPng(pngBytes)
    const newPage = outDoc.addPage([vp1.width, vp1.height])
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: vp1.width,
      height: vp1.height,
    })
  }

  // Aucune métadonnée à effacer : le document est neuf, rien n'est recopié
  // de l'original, et updateMetadata: false empêche pdf-lib d'en créer.
  // Appeler setTitle('') ici RECRÉERAIT un dictionnaire de métadonnées,
  // vide mais présent — d'où leur suppression.

  // Sauvegarde à révision unique
  const finalBytes = await outDoc.save()
  return finalBytes
}
