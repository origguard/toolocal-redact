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
 * Initialise l'environnement PDF.js en mode 100% hors-ligne (fake-worker local).
 */
function getPdfJs() {
  const lib = window.pdfjsLib
  if (!lib) {
    throw new Error('PDF.js engine is not initialized')
  }
  if (lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = ''
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
 * Caviarde un PDF en détruisant de manière irréversible les données confidentielles.
 *
 * @param {Uint8Array} bytes Fichier source
 * @param {Object} options Options de caviardage
 * @param {string[]|string} [options.terms] Termes ou expressions à masquer
 * @param {boolean} [options.matchCase=false] Sensibilité à la casse
 * @param {number} [options.scale=2] Échelle de rendu (2 = ~150-200 DPI)
 * @param {Array<{page: number, x: number, y: number, width: number, height: number, normalized?: boolean}>} [options.manualBoxes]
 * @returns {Promise<Uint8Array>} Nouveau PDF caviardé à révision unique sans texte résiduel
 */
export async function redactPdf(bytes, options = {}) {
  const pdfjs = getPdfJs()

  // Normalisation des options
  let terms = []
  if (Array.isArray(options.terms)) {
    terms = options.terms
  } else if (typeof options.terms === 'string') {
    terms = options.terms.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (Array.isArray(options)) {
    terms = options
  }

  const matchCase = Boolean(options.matchCase)
  const scale = typeof options.scale === 'number' && options.scale > 0 ? options.scale : 2
  const manualBoxes = Array.isArray(options.manualBoxes) ? options.manualBoxes : []

  const norm = (s) => (matchCase ? s : String(s).toLowerCase())
  const needles = terms.map(norm).filter(Boolean)

  // Chargement du PDF source dans PDF.js local
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const srcDoc = await loadingTask.promise

  // Création du nouveau document PDF de destination (100% vierge)
  const outDoc = await PDFDocument.create()

  let totalHits = 0

  for (let pageNum = 1; pageNum <= srcDoc.numPages; pageNum++) {
    const page = await srcDoc.getPage(pageNum)
    const vp1 = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale })

    // Rendu sur canvas local
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width)
    canvas.height = Math.round(vp.height)
    const ctx = canvas.getContext('2d')

    await page.render({ canvasContext: ctx, viewport: vp }).promise

    // Récupération des positions du texte
    const textContent = await page.getTextContent()
    ctx.fillStyle = '#000000'

    // 1. Caviardage des termes recherchés
    if (needles.length > 0 && textContent && textContent.items) {
      textContent.items.forEach((it) => {
        if (!it.str) return
        const normalizedStr = norm(it.str)
        const hasMatch = needles.some((needle) => normalizedStr.includes(needle))
        if (!hasMatch) return

        totalHits++
        const tx = pdfjs.Util.transform(vp.transform, it.transform)
        const h = Math.hypot(tx[2], tx[3]) || (12 * scale)
        const w = (it.width || 0) * scale
        const x = tx[4]
        const y = tx[5]

        // Rectangle noir recouvrant exactement le mot ou fragment
        ctx.fillRect(x - 1, y - h, Math.max(w, 4) + 2, h + 3)
      })
    }

    // 2. Caviardage des zones manuelles dessinées sur cette page
    const pageBoxes = manualBoxes.filter((b) => b.page === pageNum)
    pageBoxes.forEach((b) => {
      const bx = b.normalized ? b.x * vp.width : b.x * (scale / (b.renderScale || 1))
      const by = b.normalized ? b.y * vp.height : b.y * (scale / (b.renderScale || 1))
      const bw = b.normalized ? b.width * vp.width : b.width * (scale / (b.renderScale || 1))
      const bh = b.normalized ? b.height * vp.height : b.height * (scale / (b.renderScale || 1))
      ctx.fillRect(bx, by, bw, bh)
      totalHits++
    })

    // Rasterisation destructive en image PNG
    const pngDataUrl = canvas.toDataURL('image/png')
    const pngBytes = dataUrlToBytes(pngDataUrl)

    // Intégration de la page rasterisée dans le document cible
    const embeddedImg = await outDoc.embedPng(pngBytes)
    const newPage = outDoc.addPage([vp1.width, vp1.height])
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: vp1.width,
      height: vp1.height,
    })
  }

  // Élimination totale de toute métadonnée résiduelle
  outDoc.setTitle('')
  outDoc.setAuthor('')
  outDoc.setSubject('')
  outDoc.setKeywords([])
  outDoc.setProducer('')
  outDoc.setCreator('')

  // Sauvegarde à révision unique
  const finalBytes = await outDoc.save()
  return finalBytes
}
