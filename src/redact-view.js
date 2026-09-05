/**
 * La frontière d'isolation du produit.
 *
 * TOUT ce que fait ce module se passe dans le navigateur. Les seules requêtes
 * autorisées sont deux appels WebDAV vers l'instance Nextcloud de l'utilisateur :
 * lire le fichier, réécrire le fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  RÈGLE NON NÉGOCIABLE DE CE DÉPÔT
 *
 *  Aucun import, aucune police, aucun WASM, aucune image ne provient d'une
 *  origine tierce. Tout est empaqueté.
 *
 *  Un seul `import` distant, et le client :
 *    · dépend de notre disponibilité ;
 *    · peut recevoir un code différent d'un jour à l'autre ;
 *    · doit nous inscrire dans sa chaîne de sous-traitance — le DPA revient,
 *      et la raison d'être de cette application disparaît.
 *
 *  `local-guard` fait échouer la CI sur toute origine tierce. Ne contourne pas.
 * ─────────────────────────────────────────────────────────────────────────
 */
import axios from '@nextcloud/axios'
import { generateRemoteUrl } from '@nextcloud/router'
import { showError, showSuccess } from '@nextcloud/dialogs'
import { translate as t } from '@nextcloud/l10n'

// Moteur de caviardage — empaqueté dans le bundle, jamais chargé à distance.
import { redactPdf, inspectPdf } from './engine/redact.js'

const davBase = () => generateRemoteUrl('dav/files')

/** Lecture WebDAV — même origine, l'instance de l'utilisateur. */
async function readFile(file) {
  const { data } = await axios.get(`${davBase()}/${file.owner}${file.path}`, {
    responseType: 'arraybuffer',
  })
  return new Uint8Array(data)
}

/** Écriture WebDAV — même origine. Nouveau fichier par défaut : jamais d'écrasement silencieux. */
async function writeFile(file, bytes, suffix = '-redacted') {
  const target = file.path.replace(/\.pdf$/i, `${suffix}.pdf`)
  await axios.put(`${davBase()}/${file.owner}${target}`, bytes, {
    headers: { 'Content-Type': 'application/pdf' },
  })
  return target
}

export async function openRedactor(file) {
  try {
    const bytes = await readFile(file)

    // Les propriétés contrôlables sur la SORTIE, avant d'enregistrer quoi que ce soit.
    const before = inspectPdf(bytes)
    if (before.encrypted) {
      showError(t('toolocal_redact', 'This PDF is password-protected and cannot be redacted here.'))
      return
    }

    const { zones, cancelled } = await presentEditor(bytes)   // interface locale
    if (cancelled) return

    const out = await redactPdf(bytes, zones)

    // On ne propose jamais d'enregistrer un caviardage qui a échoué à ses
    // propres contrôles — le même principe que le refus d'attester.
    const checks = inspectPdf(out)
    if (checks.incrementalRevisions > 1) {
      showError(t('toolocal_redact',
        'Redaction produced a file with a recoverable earlier revision. Nothing was saved.'))
      return
    }

    const saved = await writeFile(file, out)
    showSuccess(t('toolocal_redact', 'Saved as {name}', { name: saved.split('/').pop() }))
  } catch (e) {
    showError(t('toolocal_redact', 'Redaction failed: {msg}', { msg: e.message }))
  }
}

/**
 * Interface utilisateur locale pour configurer le caviardage.
 * Affiche une modale interactive conforme au design Nextcloud avec prévisualisation
 * de page, sélection de termes, profils métier et traçage manuel de zones à la souris.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<{ zones: Object, cancelled: boolean }>}
 */
async function presentEditor(bytes) {
  return new Promise(async (resolve) => {
    // 1. Initialisation de PDF.js local pour la prévisualisation
    const pdfjs = window.pdfjsLib
    let pdfDoc = null
    let numPages = 1
    let currentPage = 1

    if (pdfjs) {
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
        console.warn('[Toolocal] Preview load error:', err)
      }
    }

    // Données de caviardage en cours d'édition
    const manualBoxes = [] // { page, x, y, width, height, normalized: true }

    // 2. Création de la structure DOM de la modale
    const overlay = document.createElement('div')
    overlay.id = 'toolocal-redact-overlay'
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-face, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      color: var(--color-main-text, #222);
    `

    const modal = document.createElement('div')
    modal.style.cssText = `
      background: var(--color-main-background, #ffffff);
      width: 94vw;
      max-width: 1080px;
      height: 90vh;
      max-height: 820px;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `

    // En-tête
    const header = document.createElement('div')
    header.style.cssText = `
      padding: 16px 24px;
      border-bottom: 1px solid var(--color-border, #e5e7eb);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--color-background-hover, #f9fafb);
    `
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:20px;">🔲</span>
        <div>
          <h2 style="margin:0; font-size:16px; font-weight:700; color:var(--color-main-text, #111827);">
            ${t('toolocal_redact', 'Redact PDF Document')}
          </h2>
          <div style="font-size:12px; color:#10b981; font-weight:600; display:flex; align-items:center; gap:4px; margin-top:2px;">
            <span>🛡️</span> 100% Local · Zéro Tiers · Non Récupérable
          </div>
        </div>
      </div>
      <button id="tl-btn-close" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--color-text-lighter, #6b7280); padding:4px 8px; border-radius:6px;">✕</button>
    `

    // Corps (2 colonnes)
    const body = document.createElement('div')
    body.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `

    // Colonne gauche : Paramètres et profils
    const sidebar = document.createElement('div')
    sidebar.style.cssText = `
      width: 380px;
      padding: 20px;
      border-right: 1px solid var(--color-border, #e5e7eb);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
      background: var(--color-main-background, #ffffff);
    `

    sidebar.innerHTML = `
      <div>
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">
          ${t('toolocal_redact', 'Terms or patterns to redact')}
        </label>
        <textarea id="tl-terms" rows="3" placeholder="Dupont, 06 12 34 56 78, FR76..." style="width:100%; box-sizing:border-box; padding:10px; border-radius:6px; border:1px solid var(--color-border, #d1d5db); font-family:inherit; font-size:13px; resize:vertical;"></textarea>
        <div style="font-size:11px; color:var(--color-text-lighter, #6b7280); margin-top:4px;">
          ${t('toolocal_redact', 'Separate terms with commas')}
        </div>
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:8px; color:var(--color-text-lighter, #4b5563);">
          ⚡ Profils rapides :
        </label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <button type="button" class="tl-preset" data-preset="siret, capital, sarl, sas, gérant, rcs" style="padding:6px 8px; font-size:11px; border:1px solid var(--color-border, #e5e7eb); background:var(--color-background-hover, #f3f4f6); border-radius:6px; cursor:pointer; text-align:left;">📋 Contrat</button>
          <button type="button" class="tl-preset" data-preset="iban, bic, tva, compte, solde, facture" style="padding:6px 8px; font-size:11px; border:1px solid var(--color-border, #e5e7eb); background:var(--color-background-hover, #f3f4f6); border-radius:6px; cursor:pointer; text-align:left;">💳 Facture / IBAN</button>
          <button type="button" class="tl-preset" data-preset="patient, diagnostic, sécurité sociale, nir, ordonnance" style="padding:6px 8px; font-size:11px; border:1px solid var(--color-border, #e5e7eb); background:var(--color-background-hover, #f3f4f6); border-radius:6px; cursor:pointer; text-align:left;">🏥 Médical</button>
          <button type="button" class="tl-preset" data-preset="parquet, rg, déposant, pièce n°, adversaire" style="padding:6px 8px; font-size:11px; border:1px solid var(--color-border, #e5e7eb); background:var(--color-background-hover, #f3f4f6); border-radius:6px; cursor:pointer; text-align:left;">⚖️ Procédure</button>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="tl-match-case" style="cursor:pointer;">
        <label for="tl-match-case" style="font-size:13px; cursor:pointer;">
          ${t('toolocal_redact', 'Match case')}
        </label>
      </div>

      <div style="border-top: 1px solid var(--color-border, #e5e7eb); padding-top:14px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">
          ✏️ Sélection manuelle de zones :
        </label>
        <p style="font-size:12px; color:var(--color-text-lighter, #6b7280); margin:0 0 10px 0; line-height:1.4;">
          Tracez des rectangles directement à la souris sur la page affichée à droite.
        </p>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span id="tl-box-count" style="font-size:12px; font-weight:600; color:#2563eb;">0 zone(s) tracée(s)</span>
          <button type="button" id="tl-btn-clear-boxes" style="padding:4px 8px; font-size:11px; border:1px solid #f87171; color:#dc2626; background:#fff; border-radius:4px; cursor:pointer;">Effacer</button>
        </div>
      </div>

      <div style="border-top: 1px solid var(--color-border, #e5e7eb); padding-top:14px; margin-top:auto;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px;">
          Qualité de rendu :
        </label>
        <select id="tl-scale" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--color-border, #d1d5db); font-size:12px;">
          <option value="2" selected>Élevée (~150-200 DPI)</option>
          <option value="3">Optimale (~300 DPI)</option>
        </select>
      </div>
    `

    // Colonne droite : Prévisualisation interactive
    const previewPane = document.createElement('div')
    previewPane.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #f1f5f9;
      overflow: hidden;
    `

    // Barre d'outils de page
    const pageToolbar = document.createElement('div')
    pageToolbar.style.cssText = `
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: var(--color-main-background, #ffffff);
      border-bottom: 1px solid var(--color-border, #e5e7eb);
    `
    pageToolbar.innerHTML = `
      <button id="tl-prev-page" style="padding:4px 10px; border-radius:4px; border:1px solid #cbd5e1; background:#fff; cursor:pointer;">◀ Précédent</button>
      <span id="tl-page-info" style="font-size:13px; font-weight:600;">Page 1 sur ${numPages}</span>
      <button id="tl-next-page" style="padding:4px 10px; border-radius:4px; border:1px solid #cbd5e1; background:#fff; cursor:pointer;">Suivant ▶</button>
    `

    const canvasContainer = document.createElement('div')
    canvasContainer.style.cssText = `
      flex: 1;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
    `

    const canvasWrapper = document.createElement('div')
    canvasWrapper.style.cssText = `
      position: relative;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
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

    // Pied de page (Actions)
    const footer = document.createElement('div')
    footer.style.cssText = `
      padding: 14px 24px;
      border-top: 1px solid var(--color-border, #e5e7eb);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--color-background-hover, #f9fafb);
    `
    footer.innerHTML = `
      <div style="font-size:11px; color:var(--color-text-lighter, #6b7280);">
        🔒 Le caviardage détruit définitivement les pixels et le calque texte sous-jacent.
      </div>
      <div style="display:flex; gap:10px;">
        <button id="tl-btn-cancel" style="padding:8px 16px; border-radius:6px; border:1px solid var(--color-border, #d1d5db); background:#fff; cursor:pointer; font-size:13px; font-weight:500;">
          ${t('toolocal_redact', 'Cancel')}
        </button>
        <button id="tl-btn-apply" style="padding:8px 20px; border-radius:6px; border:none; background:var(--color-primary, #0082c9); color:#fff; cursor:pointer; font-size:13px; font-weight:600;">
          ${t('toolocal_redact', 'Apply Redaction')}
        </button>
      </div>
    `

    modal.appendChild(header)
    modal.appendChild(body)
    modal.appendChild(footer)
    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    // 3. Logique de rendu de page et traçage
    async function renderPreviewPage(pageIndex) {
      if (!pdfDoc) return
      currentPage = pageIndex
      const pageInfo = overlay.querySelector('#tl-page-info')
      if (pageInfo) pageInfo.textContent = `Page ${currentPage} sur ${numPages}`

      const page = await pdfDoc.getPage(pageIndex)
      const vp = page.getViewport({ scale: 1.2 })

      previewCanvas.width = Math.round(vp.width)
      previewCanvas.height = Math.round(vp.height)
      overlayCanvas.width = Math.round(vp.width)
      overlayCanvas.height = Math.round(vp.height)

      const ctx = previewCanvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      redrawOverlay()
    }

    function redrawOverlay() {
      const ctx = overlayCanvas.getContext('2d')
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

      // Dessin des zones manuelles pour cette page
      ctx.fillStyle = '#000000'
      const pageBoxes = manualBoxes.filter((b) => b.page === currentPage)
      pageBoxes.forEach((b) => {
        const x = b.x * overlayCanvas.width
        const y = b.y * overlayCanvas.height
        const w = b.width * overlayCanvas.width
        const h = b.height * overlayCanvas.height
        ctx.fillRect(x, y, w, h)
      })

      const countEl = overlay.querySelector('#tl-box-count')
      if (countEl) countEl.textContent = `${manualBoxes.length} zone(s) tracée(s)`
    }

    // Gestion du tracé à la souris sur l'overlay
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
          x: x / overlayCanvas.width,
          y: y / overlayCanvas.height,
          width: width / overlayCanvas.width,
          height: height / overlayCanvas.height,
          normalized: true,
        })
      }
      redrawOverlay()
    }

    overlayCanvas.addEventListener('mouseup', finishDraw)
    overlayCanvas.addEventListener('mouseleave', finishDraw)

    // Boutons de navigation
    overlay.querySelector('#tl-prev-page').onclick = () => {
      if (currentPage > 1) renderPreviewPage(currentPage - 1)
    }
    overlay.querySelector('#tl-next-page').onclick = () => {
      if (currentPage < numPages) renderPreviewPage(currentPage + 1)
    }

    // Boutons de profils prédéfinis
    overlay.querySelectorAll('.tl-preset').forEach((btn) => {
      btn.onclick = () => {
        const txt = overlay.querySelector('#tl-terms')
        const val = btn.getAttribute('data-preset')
        if (txt) {
          txt.value = txt.value ? `${txt.value.trim()}, ${val}` : val
        }
      }
    })

    // Effacer les boîtes
    overlay.querySelector('#tl-btn-clear-boxes').onclick = () => {
      manualBoxes.length = 0
      redrawOverlay()
    }

    // Nettoyage et fermeture
    const close = (cancelled, result = null) => {
      overlay.remove()
      resolve(cancelled ? { cancelled: true } : { zones: result, cancelled: false })
    }

    overlay.querySelector('#tl-btn-close').onclick = () => close(true)
    overlay.querySelector('#tl-btn-cancel').onclick = () => close(true)

    overlay.querySelector('#tl-btn-apply').onclick = () => {
      const termsVal = (overlay.querySelector('#tl-terms') || {}).value || ''
      const matchCaseVal = Boolean((overlay.querySelector('#tl-match-case') || {}).checked)
      const scaleVal = parseFloat((overlay.querySelector('#tl-scale') || {}).value || 2)

      close(false, {
        terms: termsVal,
        matchCase: matchCaseVal,
        scale: scaleVal,
        manualBoxes,
      })
    }

    // Rendu de la première page
    if (pdfDoc) {
      renderPreviewPage(1)
    }
  })
}

