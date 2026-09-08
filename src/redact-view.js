/**
 * La frontière d'isolation du produit Toolocal Redact.
 *
 * TOUT ce que fait ce module se passe dans le navigateur de l'utilisateur.
 * Les seules requêtes autorisées sont les appels WebDAV vers l'instance Nextcloud
 * de l'utilisateur : lire le fichier original, réécrire la version caviardée.
 *
 * ZÉRO TIERS · AUCUN SOUS-TRAITANT · AUCUN DPA REQUIS.
 */
import { generateRemoteUrl } from '@nextcloud/router'
import { translate as t } from '@nextcloud/l10n'

// Moteur de caviardage local souverain
import {
  redactPdf,
  inspectPdf,
  getPdfJs,
  extractPageTextMap,
  calculateTextMatchBoxes,
  PRESET_PATTERNS,
} from './engine/redact.js'

/**
 * Récupère le jeton CSRF de Nextcloud pour autoriser les requêtes WebDAV d'écriture.
 */
function getRequestToken() {
  if (typeof window !== 'undefined') {
    if (window.OC && window.OC.requestToken) return window.OC.requestToken
    const meta = document.querySelector('meta[name="csrf-token"]')
    if (meta && meta.content) return meta.content
    const bodyAttr = document.body && document.body.getAttribute('data-requesttoken')
    if (bodyAttr) return bodyAttr
  }
  return ''
}

/**
 * Détermine les URLs WebDAV absolues pour la lecture et l'écriture du fichier
 * de manière 100% compatible avec Nextcloud Hub 30 à 38.
 */
function resolveWebDavUrls(file, suffix = '-redacted') {
  const origName = file.basename || file.name || 'document.pdf'
  const targetName = origName.replace(/(\.pdf)$/i, `${suffix}$1`)

  // 1. Si le Node fournit déjà une URL WebDAV encodée (cas standard @nextcloud/files)
  if (file.encodedSource) {
    const readUrl = file.encodedSource
    const saveUrl = file.encodedSource.replace(/(\.pdf)$/i, `${suffix}$1`)
    return { readUrl, saveUrl, targetName }
  }

  if (file.source) {
    const readUrl = encodeURI(file.source)
    const saveUrl = encodeURI(file.source.replace(/(\.pdf)$/i, `${suffix}$1`))
    return { readUrl, saveUrl, targetName }
  }

  // 2. Fallback via generateRemoteUrl
  let davBase = ''
  try {
    davBase = generateRemoteUrl('dav/files')
  } catch (e) {
    davBase = '/remote.php/dav/files'
  }

  const userId = (window.OC && window.OC.getCurrentUser && window.OC.getCurrentUser()?.uid)
    || (window.OC && window.OC.currentUser)
    || file.owner
    || ''

  const filePath = file.path
    || (file.dir ? `${file.dir.replace(/\/+$/, '')}/${origName}` : `/${origName}`)

  const cleanDavBase = davBase.replace(/\/+$/, '')
  const cleanUser = encodeURIComponent(userId)
  const cleanPath = filePath.replace(/^\/+/, '')

  const readUrl = `${cleanDavBase}/${cleanUser}/${encodeURI(cleanPath)}`
  const saveUrl = readUrl.replace(/(\.pdf)$/i, `${suffix}$1`)

  return { readUrl, saveUrl, targetName }
}

/**
 * Lecture WebDAV native vers l'instance de l'utilisateur.
 */
async function readFile(file) {
  const { readUrl } = resolveWebDavUrls(file)
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'requesttoken': getRequestToken(),
  }

  const res = await fetch(readUrl, {
    method: 'GET',
    headers,
    credentials: 'same-origin',
  })

  if (!res.ok) {
    throw new Error(`Failed to read file via WebDAV (HTTP ${res.status})`)
  }

  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Écriture WebDAV vers l'instance Nextcloud avec jeton CSRF et rechargement de vue.
 */
async function writeFile(file, bytes, suffix = '-redacted', view = null) {
  const { saveUrl, targetName } = resolveWebDavUrls(file, suffix)
  const token = getRequestToken()

  const headers = {
    'Content-Type': 'application/pdf',
    'X-Requested-With': 'XMLHttpRequest',
    'OCS-APIREQUEST': 'true',
  }
  if (token) {
    headers.requesttoken = token
  }

  const res = await fetch(saveUrl, {
    method: 'PUT',
    headers,
    body: bytes,
    credentials: 'same-origin',
  })

  if (!res.ok && res.status !== 201 && res.status !== 204 && res.status !== 200) {
    throw new Error(`Failed to save redacted file via WebDAV (HTTP ${res.status} ${res.statusText})`)
  }

  // Notifier l'app Fichiers pour faire apparaître immédiatement le nouveau document
  try {
    if (view && typeof view.reload === 'function') {
      view.reload()
    } else if (window.OCA && window.OCA.Files && window.OCA.Files.fileList && typeof window.OCA.Files.fileList.reload === 'function') {
      window.OCA.Files.fileList.reload()
    }
    window.dispatchEvent(new CustomEvent('files:reload'))
  } catch (err) {
    // Non bloquant
  }

  return targetName
}

function showToast(msg, type = 'success') {
  if (typeof document === 'undefined') return
  const toast = document.createElement('div')
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 100001;
    background: ${type === 'success' ? '#059669' : '#dc2626'};
    color: #ffffff;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: opacity 0.3s ease;
  `
  toast.textContent = msg
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}

function notifySuccess(msg) {
  if (typeof window !== 'undefined' && window.OC && window.OC.Notification && typeof window.OC.Notification.showTemporary === 'function') {
    window.OC.Notification.showTemporary(msg)
  } else {
    showToast(msg, 'success')
  }
}

function notifyError(msg) {
  if (typeof window !== 'undefined' && window.OC && window.OC.dialogs && typeof window.OC.dialogs.alert === 'function') {
    window.OC.dialogs.alert(msg, 'Toolocal Redact')
  } else {
    showToast(msg, 'error')
  }
}

/**
 * Point d'entrée déclenché par l'action de fichier.
 */
export async function openRedactor(file, view = null) {
  try {
    const bytes = await readFile(file)

    const before = inspectPdf(bytes)
    if (before.encrypted) {
      notifyError(t('toolocal_redact', 'This PDF is password-protected and cannot be redacted here.'))
      return
    }

    const { options, cancelled } = await presentEditor(bytes, file)
    if (cancelled || !options) return

    const out = await redactPdf(bytes, options)

    // Vérification d'intégrité : révision unique, non récupérable
    const checks = inspectPdf(out)
    if (checks.incrementalRevisions > 1) {
      notifyError(t('toolocal_redact', 'Redaction produced a file with a recoverable earlier revision. Nothing was saved.'))
      return
    }

    const savedName = await writeFile(file, out, '-redacted', view)
    notifySuccess(t('toolocal_redact', 'Saved as {name}', { name: savedName }))
  } catch (e) {
    notifyError(t('toolocal_redact', 'Redaction failed: {msg}', { msg: e.message }))
  }
}

/**
 * Interface utilisateur locale pour configurer et visualiser le caviardage en direct.
 */
async function presentEditor(bytes, file) {
  return new Promise(async (resolve) => {
    const pdfjs = getPdfJs()
    let pdfDoc = null
    let numPages = 1
    let currentPage = 1

    try {
      const loading = pdfjs.getDocument({
        data: bytes,
        disableWorker: true,
        isEvalSupported: false,
        useSystemFonts: true,
      })
      pdfDoc = await loading.promise
      numPages = pdfDoc.numPages
    } catch (err) {
      console.warn('[Toolocal Redact] Preview load error:', err)
    }

    // État de l'éditeur
    const manualBoxes = [] // { page, normX, normY, normWidth, normHeight }
    let activePageBoxes = [] // boîtes calculées pour la page active

    // Structure DOM de la modale
    const overlay = document.createElement('div')
    overlay.id = 'toolocal-redact-overlay'
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-face, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      color: var(--color-main-text, #111827);
    `

    const modal = document.createElement('div')
    modal.style.cssText = `
      background: var(--color-main-background, #ffffff);
      width: 95vw;
      max-width: 1120px;
      height: 92vh;
      max-height: 860px;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `

    // En-tête
    const header = document.createElement('div')
    header.style.cssText = `
      padding: 14px 20px;
      border-bottom: 1px solid var(--color-border, #e5e7eb);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--color-background-hover, #f8fafc);
    `
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:22px;">🔲</span>
        <div>
          <h2 style="margin:0; font-size:16px; font-weight:700; color:var(--color-main-text, #0f172a);">
            ${t('toolocal_redact', 'Redact PDF Document')}
          </h2>
          <div style="font-size:12px; color:#059669; font-weight:600; display:flex; align-items:center; gap:6px; margin-top:2px;">
            <span>🛡️</span> 100% Local · Zéro Tiers · Non Récupérable
          </div>
        </div>
      </div>
      <button id="tl-btn-close" style="background:none; border:none; font-size:20px; cursor:pointer; color:#64748b; padding:4px 8px; border-radius:6px;">✕</button>
    `

    // Corps (2 colonnes)
    const body = document.createElement('div')
    body.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `

    // Colonne gauche : Paramètres et détection
    const sidebar = document.createElement('div')
    sidebar.style.cssText = `
      width: 400px;
      padding: 18px;
      border-right: 1px solid var(--color-border, #e5e7eb);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: var(--color-main-background, #ffffff);
    `

    sidebar.innerHTML = `
      <div>
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">
          ${t('toolocal_redact', 'Terms or patterns to redact')}
        </label>
        <textarea id="tl-terms" rows="3" placeholder="credit, capital, debt, loss, percent, first..." style="width:100%; box-sizing:border-box; padding:10px; border-radius:6px; border:1px solid #cbd5e1; font-family:inherit; font-size:13px; resize:vertical;"></textarea>
        <div style="font-size:11px; color:#64748b; margin-top:4px;">
          ${t('toolocal_redact', 'Separate terms with commas (supports multi-word phrases & regex /pat/i)')}
        </div>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; font-weight:700; color:#334155;">
          ⚡ Détection automatique & Catégories sensibles :
        </div>

        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer;">
          <input type="checkbox" id="tl-chk-sensitive" checked style="margin-top:2px;">
          <span>
            <strong>Identifiants sensibles :</strong> Creditor, Statutory Work, Redacted, Forbidden, Confidential...
          </span>
        </label>

        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer;">
          <input type="checkbox" id="tl-chk-gdpr" style="margin-top:2px;">
          <span>
            <strong>Assistance motifs RGPD :</strong> Aide au repérage (Emails, Téléphones, IBANs, Cartes, Sécurité sociale...)
          </span>
        </label>

        <div style="background:#fffbeb; border:1px solid #fef3c7; border-left:3px solid #f59e0b; padding:6px 8px; border-radius:4px; font-size:10.5px; color:#92400e; line-height:1.35; margin-top:2px; margin-bottom:6px;">
          ⚠️ <strong>Aide au repérage :</strong> Cette détection est une aide visuelle. Un format atypique, un espace inhabituel ou une césure de ligne peut échapper aux filtres. <em>Une relecture humaine reste obligatoire avant transmission.</em>
        </div>

        <div style="border-top:1px solid #e2e8f0; padding-top:8px; display:flex; align-items:center; justify-content:space-between;">
          <span id="tl-detected-badge" style="font-size:12px; font-weight:600; color:#2563eb;">
            0 terme(s) détecté(s)
          </span>
          <button type="button" id="tl-btn-redact-all" style="padding:4px 10px; font-size:11px; font-weight:600; border-radius:4px; border:1px solid #2563eb; color:#2563eb; background:#eff6ff; cursor:pointer;">
            Tout caviarder
          </button>
        </div>
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#475569;">
          📋 Profils rapides :
        </label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <button type="button" class="tl-preset" data-preset="siret, capital, sarl, sas, gérant, rcs, contrat" style="padding:6px 8px; font-size:11px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:6px; cursor:pointer; text-align:left;">📋 Contrat</button>
          <button type="button" class="tl-preset" data-preset="iban, bic, tva, compte, solde, facture, virement" style="padding:6px 8px; font-size:11px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:6px; cursor:pointer; text-align:left;">💳 Facture / IBAN</button>
          <button type="button" class="tl-preset" data-preset="patient, diagnostic, sécurité sociale, nir, ordonnance, consultation" style="padding:6px 8px; font-size:11px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:6px; cursor:pointer; text-align:left;">🏥 Médical</button>
          <button type="button" class="tl-preset" data-preset="parquet, rg, déposant, pièce n°, adversaire, audience" style="padding:6px 8px; font-size:11px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:6px; cursor:pointer; text-align:left;">⚖️ Procédure</button>
        </div>
      </div>

      <div style="border-top:1px solid #e2e8f0; padding-top:12px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">
          ✏️ Sélection manuelle de zones :
        </label>
        <p style="font-size:11px; color:#64748b; margin:0 0 8px 0; line-height:1.4;">
          Tracez des rectangles directement à la souris sur la prévisualisation à droite.
        </p>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span id="tl-box-count" style="font-size:12px; font-weight:600; color:#0f172a;">0 zone(s) manuelle(s)</span>
          <button type="button" id="tl-btn-clear-boxes" style="padding:3px 8px; font-size:11px; border:1px solid #fca5a5; color:#b91c1c; background:#fff; border-radius:4px; cursor:pointer;">Effacer</button>
        </div>
      </div>

      <div style="border-top:1px solid #e2e8f0; padding-top:12px; margin-top:auto;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <input type="checkbox" id="tl-match-case" style="cursor:pointer;">
          <label for="tl-match-case" style="font-size:12px; cursor:pointer; color:#334155;">
            ${t('toolocal_redact', 'Match case')}
          </label>
        </div>

        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:#475569;">
          Qualité de rendu de sortie :
        </label>
        <select id="tl-scale" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid #cbd5e1; font-size:12px;">
          <option value="2" selected>Élevée (~150-200 DPI)</option>
          <option value="3">Optimale (~300 DPI - Impression)</option>
        </select>
      </div>
    `

    // Colonne droite : Prévisualisation interactive
    const previewPane = document.createElement('div')
    previewPane.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #e2e8f0;
      overflow: hidden;
    `

    // Barre d'outils de pagination
    const pageToolbar = document.createElement('div')
    pageToolbar.style.cssText = `
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: var(--color-main-background, #ffffff);
      border-bottom: 1px solid var(--color-border, #e5e7eb);
    `
    pageToolbar.innerHTML = `
      <button id="tl-prev-page" style="padding:4px 12px; border-radius:4px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-size:12px;">◀ Précédent</button>
      <span id="tl-page-info" style="font-size:13px; font-weight:600;">Page 1 sur ${numPages}</span>
      <button id="tl-next-page" style="padding:4px 12px; border-radius:4px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-size:12px;">Suivant ▶</button>
    `

    const canvasContainer = document.createElement('div')
    canvasContainer.style.cssText = `
      flex: 1;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      position: relative;
    `

    const canvasWrapper = document.createElement('div')
    canvasWrapper.style.cssText = `
      position: relative;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      background: #ffffff;
      user-select: none;
    `

    const previewCanvas = document.createElement('canvas')
    const overlayCanvas = document.createElement('canvas')
    overlayCanvas.style.cssText = `
      position: absolute;
      inset: 0;
      cursor: crosshair;
    `

    canvasWrapper.appendChild(previewCanvas)
    canvasWrapper.appendChild(overlayCanvas)
    canvasContainer.appendChild(canvasWrapper)

    previewPane.appendChild(pageToolbar)
    previewPane.appendChild(canvasContainer)

    body.appendChild(sidebar)
    body.appendChild(previewPane)

    // Pied de page
    const footer = document.createElement('div')
    footer.style.cssText = `
      padding: 12px 20px;
      border-top: 1px solid var(--color-border, #e5e7eb);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--color-background-hover, #f8fafc);
    `
    footer.innerHTML = `
      <div style="font-size:11px; color:#64748b;">
        🔒 Le caviardage détruit définitivement les pixels et le calque texte sous-jacent.
      </div>
      <div style="display:flex; gap:10px;">
        <button id="tl-btn-cancel" style="padding:8px 16px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-size:13px; font-weight:500;">
          ${t('toolocal_redact', 'Cancel')}
        </button>
        <button id="tl-btn-apply" style="padding:8px 20px; border-radius:6px; border:none; background:var(--color-primary, #0082c9); color:#fff; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;">
          <span>${t('toolocal_redact', 'Apply Redaction')}</span>
        </button>
      </div>
    `

    modal.appendChild(header)
    modal.appendChild(body)
    modal.appendChild(footer)
    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    // Logique de détection et mise à jour en direct
    let currentVp = null
    let currentPageObj = null
    let currentTextMap = null

    function getCurrentOptions() {
      const termsVal = (overlay.querySelector('#tl-terms') || {}).value || ''
      const matchCaseVal = Boolean((overlay.querySelector('#tl-match-case') || {}).checked)
      const detectSensitive = Boolean((overlay.querySelector('#tl-chk-sensitive') || {}).checked)
      const detectGdpr = Boolean((overlay.querySelector('#tl-chk-gdpr') || {}).checked)
      const scaleVal = parseFloat((overlay.querySelector('#tl-scale') || {}).value || 2)

      return {
        terms: termsVal,
        matchCase: matchCaseVal,
        detectSensitiveIdentifiers: detectSensitive,
        detectGdpr: detectGdpr,
        scale: scaleVal,
        manualBoxes,
      }
    }

    async function updateDetections() {
      if (!currentPageObj || !currentVp || !currentTextMap) return
      const opts = getCurrentOptions()
      activePageBoxes = calculateTextMatchBoxes(currentPageObj, currentVp, currentTextMap, opts)

      const badge = overlay.querySelector('#tl-detected-badge')
      if (badge) {
        badge.textContent = `${activePageBoxes.length} terme(s) détecté(s)`
      }

      redrawOverlay()
    }

    async function renderPreviewPage(pageIndex) {
      if (!pdfDoc) return
      currentPage = pageIndex
      const pageInfo = overlay.querySelector('#tl-page-info')
      if (pageInfo) pageInfo.textContent = `Page ${currentPage} sur ${numPages}`

      currentPageObj = await pdfDoc.getPage(pageIndex)
      currentVp = currentPageObj.getViewport({ scale: 1.25 })

      previewCanvas.width = Math.round(currentVp.width)
      previewCanvas.height = Math.round(currentVp.height)
      overlayCanvas.width = Math.round(currentVp.width)
      overlayCanvas.height = Math.round(currentVp.height)

      const ctx = previewCanvas.getContext('2d')
      await currentPageObj.render({ canvasContext: ctx, viewport: currentVp }).promise

      currentTextMap = await extractPageTextMap(currentPageObj)
      await updateDetections()
    }

    function redrawOverlay() {
      const ctx = overlayCanvas.getContext('2d')
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

      // 1. Dessiner les correspondances détectées automatiquement (noir avec liseré rouge)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1.5

      activePageBoxes.forEach((b) => {
        ctx.fillRect(b.x, b.y, b.width, b.height)
        ctx.strokeRect(b.x, b.y, b.width, b.height)
      })

      // 2. Dessiner les boîtes manuelles pour cette page
      ctx.fillStyle = '#000000'
      const pageBoxes = manualBoxes.filter((b) => b.page === currentPage)
      pageBoxes.forEach((b) => {
        const x = b.normX * overlayCanvas.width
        const y = b.normY * overlayCanvas.height
        const w = b.normWidth * overlayCanvas.width
        const h = b.normHeight * overlayCanvas.height
        ctx.fillRect(x, y, w, h)
      })

      const countEl = overlay.querySelector('#tl-box-count')
      if (countEl) {
        countEl.textContent = `${manualBoxes.length} zone(s) manuelle(s)`
      }
    }

    // Gestion du tracé manuel à la souris
    let isDrawing = false
    let startX = 0
    let startY = 0

    overlayCanvas.addEventListener('mousedown', (e) => {
      const rect = overlayCanvas.getBoundingClientRect()
      startX = e.clientX - rect.left
      startY = e.clientY - rect.top
      isDrawing = true
    })

    overlayCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return
      const rect = overlayCanvas.getBoundingClientRect()
      const currentX = e.clientX - rect.left
      const currentY = e.clientY - rect.top

      redrawOverlay()
      const ctx = overlayCanvas.getContext('2d')
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'

      const w = currentX - startX
      const h = currentY - startY
      ctx.fillRect(startX, startY, w, h)
      ctx.strokeRect(startX, startY, w, h)
    })

    const finishDraw = (e) => {
      if (!isDrawing) return
      isDrawing = false
      const rect = overlayCanvas.getBoundingClientRect()
      const endX = Math.max(0, Math.min(overlayCanvas.width, e.clientX - rect.left))
      const endY = Math.max(0, Math.min(overlayCanvas.height, e.clientY - rect.top))

      const x = Math.min(startX, endX)
      const y = Math.min(startY, endY)
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)

      if (width > 5 && height > 5) {
        manualBoxes.push({
          page: currentPage,
          normX: x / overlayCanvas.width,
          normY: y / overlayCanvas.height,
          normWidth: width / overlayCanvas.width,
          normHeight: height / overlayCanvas.height,
        })
      }
      redrawOverlay()
    }

    overlayCanvas.addEventListener('mouseup', finishDraw)
    overlayCanvas.addEventListener('mouseleave', finishDraw)

    // Événements d'interaction en direct
    const termsEl = overlay.querySelector('#tl-terms')
    if (termsEl) {
      termsEl.addEventListener('input', () => updateDetections())
    }

    const chkSensitive = overlay.querySelector('#tl-chk-sensitive')
    if (chkSensitive) {
      chkSensitive.addEventListener('change', () => updateDetections())
    }

    const chkGdpr = overlay.querySelector('#tl-chk-gdpr')
    if (chkGdpr) {
      chkGdpr.addEventListener('change', () => updateDetections())
    }

    const chkMatchCase = overlay.querySelector('#tl-match-case')
    if (chkMatchCase) {
      chkMatchCase.addEventListener('change', () => updateDetections())
    }

    // Boutons de navigation
    overlay.querySelector('#tl-prev-page').onclick = () => {
      if (currentPage > 1) renderPreviewPage(currentPage - 1)
    }
    overlay.querySelector('#tl-next-page').onclick = () => {
      if (currentPage < numPages) renderPreviewPage(currentPage + 1)
    }

    // Profils rapides
    overlay.querySelectorAll('.tl-preset').forEach((btn) => {
      btn.onclick = () => {
        const val = btn.getAttribute('data-preset')
        if (termsEl) {
          termsEl.value = termsEl.value ? `${termsEl.value.trim()}, ${val}` : val
          updateDetections()
        }
      }
    })

    // Tout caviarder (ajoute les termes détectés en dur dans la boîte)
    overlay.querySelector('#tl-btn-redact-all').onclick = () => {
      updateDetections()
    }

    // Effacer boîtes manuelles
    overlay.querySelector('#tl-btn-clear-boxes').onclick = () => {
      manualBoxes.length = 0
      redrawOverlay()
    }

    // Fermeture
    const close = (cancelled, result = null) => {
      overlay.remove()
      resolve(cancelled ? { cancelled: true } : { options: result, cancelled: false })
    }

    overlay.querySelector('#tl-btn-close').onclick = () => close(true)
    overlay.querySelector('#tl-btn-cancel').onclick = () => close(true)

    overlay.querySelector('#tl-btn-apply').onclick = () => {
      const applyBtn = overlay.querySelector('#tl-btn-apply')
      if (applyBtn) {
        applyBtn.disabled = true
        applyBtn.textContent = 'Caviardage en cours...'
      }
      close(false, getCurrentOptions())
    }

    // Initialisation
    if (pdfDoc) {
      renderPreviewPage(1)
    }
  })
}
