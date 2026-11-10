/**
 * La frontière d'isolation du produit Toolocal Redact.
 *
 * TOUT ce que fait ce module se passe dans le navigateur de l'utilisateur.
 * Les seules requêtes autorisées sont les appels WebDAV vers l'instance Nextcloud
 * de l'utilisateur : lire le fichier original, réécrire la version caviardée.
 *
 * ZÉRO TIERS · AUCUN SOUS-TRAITANT · AUCUN DPA REQUIS.
 */
// Chaque libellé est écrit dans le code en français et en anglais, côte à
// côte (src/langue.js) : l'application ne livre pas de fichiers de traduction.

// Moteur de caviardage local souverain
import {
  redactPdf,
  inspectPdf,
  getPdfJs,
  extractPageTextMap,
  calculateTextMatchBoxes,
} from './engine/redact.js'

import { lire, ecrire, messageErreur } from './webdav.js'
import { L, compte } from './langue.js'


function showToast(msg, type = 'success') {
  if (typeof document === 'undefined') return
  const toast = document.createElement('div')
  toast.className = 'toolocal-redact-message'
  toast.setAttribute('role', 'status')
  toast.style.cssText = `
    max-width: min(560px, calc(100vw - 48px));
    line-height: 1.45;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 100001;
    background: ${type === 'success' ? '#047857' : '#b91c1c'};
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
  }, 15000)
}

/**
 * Message de fin d'un caviardage réussi, avec le téléchargement du fichier.
 *
 * Le fichier est remis depuis les octets que le navigateur vient de produire —
 * ceux-là mêmes qui ont été enregistrés et relus : aucune requête ne part, et
 * le téléchargement ne dépend pas du menu de l'application Fichiers. Le
 * message reste affiché jusqu'à ce qu'on le ferme : c'est lui qui porte le
 * rappel de relecture.
 *
 * @param {string} msg Le message
 * @param {string} nom Nom du fichier enregistré
 * @param {Uint8Array} octets Le PDF produit
 */
function annoncerFichier(msg, nom, octets) {
  if (typeof document === 'undefined') return
  if (typeof nom !== 'string' || nom === '' || !(octets instanceof Uint8Array) || octets.byteLength === 0) {
    showToast(msg, 'success')
    return
  }
  const boite = document.createElement('div')
  boite.className = 'toolocal-redact-message'
  boite.setAttribute('role', 'status')
  boite.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 100001;
    max-width: min(560px, calc(100vw - 48px));
    background: #047857; color: #ffffff;
    padding: 14px 18px; border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
    font-size: 14px; font-weight: 600; line-height: 1.45;
  `
  const texte = document.createElement('div')
  texte.className = 'toolocal-redact-message-texte'
  texte.textContent = msg
  const barre = document.createElement('div')
  barre.style.cssText = 'display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap;'
  const bouton = (libelle, plein) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = libelle
    b.style.cssText = `
      margin: 0; min-height: 0; padding: 7px 14px; border-radius: 6px; cursor: pointer;
      font: inherit; font-size: 13px; font-weight: 700;
      border: 1px solid #ffffff;
      background: ${plein ? '#ffffff' : 'transparent'}; color: ${plein ? '#064e3b' : '#ffffff'};
    `
    return b
  }
  const telecharger = bouton(L('Télécharger le fichier caviardé', 'Download the redacted file'), true)
  telecharger.setAttribute('data-tl', 'telecharger')
  telecharger.onclick = () => {
    const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }))
    const lien = document.createElement('a')
    lien.href = url
    lien.download = nom
    lien.style.display = 'none'
    document.body.appendChild(lien)
    lien.click()
    lien.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  const fermer = bouton(L('Fermer', 'Close'), false)
  fermer.setAttribute('data-tl', 'fermer')
  fermer.onclick = () => boite.remove()
  barre.append(telecharger, fermer)
  boite.append(texte, barre)
  document.querySelectorAll('.toolocal-redact-message').forEach((e) => e.remove())
  document.body.appendChild(boite)
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
    const bytes = await lire(file)

    const before = inspectPdf(bytes)
    if (before.encrypted) {
      notifyError(L('Ce PDF est protégé par un mot de passe : il ne peut pas être caviardé ici.', 'This PDF is password-protected: it cannot be redacted here.'))
      return
    }

    const { options, cancelled, bilan } = await presentEditor(bytes)
    if (cancelled || !options) return

    const out = await redactPdf(bytes, options)

    // Vérification d'intégrité : révision unique, non récupérable
    const checks = inspectPdf(out)
    if (checks.incrementalRevisions > 1) {
      notifyError(L('Le fichier produit garde une version antérieure récupérable. Rien n’a été enregistré.', 'The file produced keeps a recoverable earlier version. Nothing was saved.'))
      return
    }

    const { nom: savedName } = await ecrire(file, out, '-redacted')
    // Le message de fin redit ce qui a été fait et ce qui reste à la charge
    // de la personne : l'outil n'a noirci que ce qui a été détecté ou tracé.
    const fait = compte(bilan.zones, ['zone noircie', 'zones noircies'], ['area blacked out', 'areas blacked out'])
    const scan = bilan.sansTexte > 0
      ? L(' Attention : ' + bilan.sansTexte + ' page(s) sans texte lisible, non analysée(s).', ' Warning: ' + bilan.sansTexte + ' page(s) with no readable text, not analysed.')
      : ''
    annoncerFichier(L('Enregistré sous ', 'Saved as ') + savedName + ' — ' + fait + '.' + scan + L(' Relisez le fichier avant de le transmettre.', ' Review the file before you send it.'), savedName, out)
  } catch (e) {
    const statut = e?.status ?? e?.response?.status
    notifyError(statut
      ? messageErreur(e)
      : L('Le caviardage a échoué : ', 'Redaction failed: ') + (e && e.message ? e.message : L('erreur inconnue', 'unknown error')) + L(' Le document d’origine n’a pas été modifié.', ' The original document was not changed.'))
  }
}

/**
 * Feuille de style du dialogue.
 *
 * Règle tenue partout : une couleur de fond n'est jamais posée sans la couleur
 * du texte qui va dessus. Le défaut corrigé ici venait de fonds clairs écrits
 * en dur sur lesquels le texte héritait la couleur du thème — clair sur clair
 * dès que Nextcloud est en thème sombre.
 *
 * Les couleurs suivent le thème de l'instance par ses variables CSS ; les
 * encadrés d'avertissement gardent un couple fond/texte fixe, lisible dans les
 * deux thèmes.
 */
const FEUILLE = `
#toolocal-redact-overlay {
  --tl-texte: var(--color-main-text, #111827);
  --tl-fond: var(--color-main-background, #ffffff);
  --tl-doux: var(--color-text-maxcontrast, #4b5563);
  --tl-carte: var(--color-background-dark, #eef2f6);
  --tl-bord: var(--color-border-maxcontrast, #6b7280);
  --tl-trait: var(--color-border, #d1d5db);
  position: fixed; inset: 0; z-index: 100000;
  background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-face, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
  font-size: 14px; line-height: 1.45; color: var(--tl-texte);
}
#toolocal-redact-overlay * { box-sizing: border-box; }
#toolocal-redact-overlay .tl-modale {
  background: var(--tl-fond); color: var(--tl-texte);
  width: 96vw; max-width: 1180px; height: 94vh; max-height: 900px;
  border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
  display: flex; flex-direction: column; overflow: hidden;
}
#toolocal-redact-overlay .tl-entete,
#toolocal-redact-overlay .tl-pied {
  background: var(--tl-carte); color: var(--tl-texte);
  padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
#toolocal-redact-overlay .tl-entete { border-bottom: 1px solid var(--tl-trait); }
#toolocal-redact-overlay .tl-pied { border-top: 1px solid var(--tl-trait); flex-wrap: wrap; }
#toolocal-redact-overlay h2 { margin: 0; font-size: 17px; font-weight: 700; color: var(--tl-texte); }
#toolocal-redact-overlay .tl-sous-titre { font-size: 13px; color: var(--tl-doux); margin-top: 2px; }
#toolocal-redact-overlay .tl-corps { flex: 1; display: flex; overflow: hidden; min-height: 0; }
#toolocal-redact-overlay .tl-volet {
  width: 420px; flex: none; padding: 16px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 16px;
  background: var(--tl-fond); color: var(--tl-texte);
  border-right: 1px solid var(--tl-trait);
}
#toolocal-redact-overlay .tl-titre { display: block; font-size: 14px; font-weight: 700; margin: 0 0 6px 0; color: var(--tl-texte); }
#toolocal-redact-overlay .tl-aide { font-size: 13px; color: var(--tl-doux); margin: 4px 0 0 0; }
#toolocal-redact-overlay .tl-carte {
  background: var(--tl-carte); color: var(--tl-texte);
  border: 1px solid var(--tl-trait); border-radius: 8px; padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
}
#toolocal-redact-overlay .tl-case { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; cursor: pointer; color: var(--tl-texte); margin: 0; }
#toolocal-redact-overlay .tl-case input { margin: 3px 0 0 0; flex: none; width: 16px; height: 16px; min-height: 0; cursor: pointer; }
#toolocal-redact-overlay textarea,
#toolocal-redact-overlay select {
  width: 100%; margin: 0; padding: 8px 10px; border-radius: 6px;
  border: 1px solid var(--tl-bord);
  background: var(--tl-fond); color: var(--tl-texte);
  font-family: inherit; font-size: 14px;
}
#toolocal-redact-overlay textarea { resize: vertical; }
#toolocal-redact-overlay textarea::placeholder { color: var(--tl-doux); opacity: 1; }
#toolocal-redact-overlay .tl-btn {
  margin: 0; min-height: 0; padding: 7px 14px; border-radius: 6px;
  border: 1px solid var(--tl-bord);
  background: var(--tl-fond); color: var(--tl-texte);
  font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; text-align: left;
}
#toolocal-redact-overlay .tl-btn:hover:not(:disabled) { border-color: var(--tl-texte); }
#toolocal-redact-overlay .tl-btn-principal {
  background: var(--color-primary-element, #00679e); color: var(--color-primary-element-text, #ffffff);
  border-color: var(--color-primary-element, #00679e); padding: 9px 20px; font-size: 14px;
}
#toolocal-redact-overlay .tl-btn:disabled { opacity: 0.45; cursor: not-allowed; }
#toolocal-redact-overlay .tl-fermer { border: none; background: transparent; color: var(--tl-texte); font-size: 20px; padding: 4px 10px; }
#toolocal-redact-overlay .tl-grille { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
#toolocal-redact-overlay .tl-ligne { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#toolocal-redact-overlay .tl-compte { font-size: 14px; font-weight: 700; color: var(--tl-texte); }
#toolocal-redact-overlay .tl-limites {
  background: #fff4ce; color: #3b2a00; border: 2px solid #b45309;
  border-radius: 8px; padding: 12px 14px; font-size: 13.5px;
}
#toolocal-redact-overlay .tl-limites strong { color: #3b2a00; }
#toolocal-redact-overlay .tl-limites ul { margin: 6px 0 0 0; padding: 0 0 0 18px; list-style: disc; }
#toolocal-redact-overlay .tl-limites li { margin: 3px 0; color: #3b2a00; }
#toolocal-redact-overlay .tl-alerte {
  background: #fde8e8; color: #7f1d1d; border: 2px solid #b91c1c;
  border-radius: 8px; padding: 10px 12px; font-size: 13.5px; font-weight: 600;
}
#toolocal-redact-overlay [hidden] { display: none !important; }
#toolocal-redact-overlay .tl-apercu { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--tl-carte); color: var(--tl-texte); overflow: hidden; }
#toolocal-redact-overlay .tl-barre {
  padding: 8px 16px; display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap;
  background: var(--tl-fond); color: var(--tl-texte); border-bottom: 1px solid var(--tl-trait);
}
#toolocal-redact-overlay .tl-legende { width: 100%; text-align: center; font-size: 13px; color: var(--tl-doux); }
#toolocal-redact-overlay .tl-defile { flex: 1; overflow: auto; padding: 16px; text-align: center; }
#toolocal-redact-overlay .tl-feuille {
  position: relative; display: inline-block; width: 100%; vertical-align: top;
  background: #ffffff; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25); user-select: none; line-height: 0;
}
#toolocal-redact-overlay .tl-feuille canvas { display: block; width: 100%; height: auto; }
#toolocal-redact-overlay .tl-feuille canvas + canvas { position: absolute; inset: 0; height: 100%; cursor: crosshair; }
#toolocal-redact-overlay .tl-etat { font-size: 13px; font-weight: 600; color: var(--tl-texte); text-align: right; }
@media (max-width: 860px) {
  #toolocal-redact-overlay .tl-corps { flex-direction: column; overflow-y: auto; }
  #toolocal-redact-overlay .tl-volet { width: 100%; border-right: none; overflow: visible; }
  #toolocal-redact-overlay .tl-apercu { min-height: 70vh; flex: none; }
}
`

/**
 * Interface de réglage et d'aperçu.
 *
 * Trois garde-fous, tous là pour qu'on ne puisse pas croire à un caviardage
 * qui n'a pas eu lieu :
 *   1. le décompte porte sur le document entier, pas sur la page affichée ;
 *   2. une page sans texte lisible (scan) est signalée nommément : la détection
 *      automatique n'y voit rien ;
 *   3. « Caviarder » reste bloqué tant qu'il n'y a rien à noircir, tant que
 *      l'aperçu n'a pas pu être affiché, et tant que la relecture n'est pas
 *      confirmée.
 */
async function presentEditor(bytes) {
  const pdfjs = getPdfJs()
  let pdfDoc = null
  try {
    // Copie : PDF.js peut s'approprier le tampon qu'on lui donne, et ces
    // octets resservent pour le caviardage lui-même.
    pdfDoc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true }).promise
  } catch (err) {
    console.warn('[Toolocal Redact] Aperçu illisible :', err)
  }
  const numPages = pdfDoc ? pdfDoc.numPages : 0

  return new Promise((resolve) => {
    const manualBoxes = [] // { page, normX, normY, normWidth, normHeight }
    const pages = new Map() // numéro -> { page, textMap }
    let currentPage = 1
    let currentVp = null
    let activePageBoxes = []
    let bilan = null // { total, parPage: Map, sansTexte: number[] } — null tant que l'analyse court
    let tour = 0

    const overlay = document.createElement('div')
    overlay.id = 'toolocal-redact-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.innerHTML = `
      <style>${FEUILLE}</style>
      <div class="tl-modale">
        <div class="tl-entete">
          <div>
            <h2>${L('Caviarder un document PDF', 'Redact a PDF document')}</h2>
            <div class="tl-sous-titre">${L('Traitement dans votre navigateur · aucun envoi à un tiers', 'Processed in your browser · nothing is sent to a third party')}</div>
          </div>
          <button type="button" id="tl-btn-close" class="tl-btn tl-fermer" aria-label="${L('Fermer sans caviarder', 'Close without redacting')}">✕</button>
        </div>

        <div class="tl-corps">
          <div class="tl-volet">
            <div class="tl-limites" id="tl-limites">
              <strong>⚠️ ${L(`Limites de l'outil — à lire avant de caviarder`, `Limits of this tool — read before redacting`)}</strong>
              <ul>
                <li><strong>${L(`Recherche littérale :`, `Literal search:`)}</strong> ${L(`un nom abrégé ou coupé en fin de ligne passe.`, `an abbreviated name, or one split across two lines, is missed.`)}</li>
                <li><strong>${L(`Pas d'OCR :`, `No OCR:`)}</strong> ${L(`un texte présent seulement en image (page scannée, photo, tampon) n'est pas détecté.`, `text that exists only as an image (scanned page, photo, stamp) is not detected.`)}</li>
                <li><strong>${L(`L'outil ne juge pas,`, `The tool does not judge:`)}</strong> ${L(`il applique vos règles.`, `it applies your rules.`)}</li>
                <li><strong>${L(`Relecture humaine indispensable`, `Human review is essential`)}</strong> ${L(`avant toute transmission.`, `before anything is sent.`)}</li>
                <li>${L(`Le jeu de test est le nôtre : vos documents réels peuvent présenter des cas non rencontrés.`, `The test set is ours: your real documents may contain cases we have not met.`)}</li>
              </ul>
            </div>

            <div>
              <label class="tl-titre" for="tl-terms">${L('Termes à caviarder', 'Terms to redact')}</label>
              <textarea id="tl-terms" rows="4" placeholder="${L('Un terme par ligne, par exemple :&#10;Jean Dupont&#10;Dossier 2026-114', 'One term per line, for example:&#10;John Smith&#10;Case 2026-114')}"></textarea>
              <p class="tl-aide">${L('Termes exacts, un par ligne ou séparés par des virgules. Les expressions régulières /motif/i sont acceptées.', 'Exact terms, one per line or separated by commas. Regular expressions /pattern/i are accepted.')}</p>
            </div>

            <div class="tl-carte">
              <div class="tl-titre" style="margin:0;">${L('Détection automatique', 'Automatic detection')}</div>
              <label class="tl-case">
                <input type="checkbox" id="tl-chk-sensitive" checked>
                <span><strong>${L('Mentions sensibles :', 'Sensitive markings:')}</strong> ${L('Confidentiel, Secret, et les termes anglais Creditor, Statutory Work, Forbidden…', 'Creditor, Statutory Work, Forbidden, and the French terms Confidentiel, Secret…')}</span>
              </label>
              <label class="tl-case">
                <input type="checkbox" id="tl-chk-gdpr" checked>
                <span><strong>${L('Données personnelles :', 'Personal data:')}</strong> ${L('téléphones, courriels, IBAN, cartes bancaires, numéros de sécurité sociale…', 'phone numbers, email addresses, IBANs, bank card numbers, French social security numbers…')}</span>
              </label>
              <div class="tl-compte" id="tl-detected-badge" aria-live="polite">${L('Analyse du document en cours…', 'Analysing the document…')}</div>
              <div class="tl-alerte" id="tl-sans-texte" hidden></div>
            </div>

            <div>
              <span class="tl-titre">${L('Profils rapides', 'Quick profiles')}</span>
              <div class="tl-grille">
                <button type="button" class="tl-btn tl-preset" data-preset="siret, capital, sarl, sas, gérant, rcs, contrat">${L('Contrat', 'Contract (French terms)')}</button>
                <button type="button" class="tl-btn tl-preset" data-preset="iban, bic, tva, compte, solde, facture, virement">${L('Facture / IBAN', 'Invoice / IBAN (French terms)')}</button>
                <button type="button" class="tl-btn tl-preset" data-preset="patient, diagnostic, sécurité sociale, nir, ordonnance, consultation">${L('Médical', 'Medical (French terms)')}</button>
                <button type="button" class="tl-btn tl-preset" data-preset="parquet, rg, déposant, pièce n°, adversaire, audience">${L('Procédure', 'Litigation (French terms)')}</button>
              </div>
              <p class="tl-aide">${L('Un profil ajoute des mots à la liste ci-dessus. Il ne reconnaît ni les noms ni les montants.', 'A profile adds French words to the list above. It recognises neither names nor amounts.')}</p>
            </div>

            <div>
              <span class="tl-titre">${L('Zones tracées à la main', 'Areas drawn by hand')}</span>
              <p class="tl-aide" style="margin:0 0 8px 0;">${L(`Tracez un rectangle à la souris sur l'aperçu pour noircir ce que la détection n'a pas vu.`, `Draw a rectangle on the preview with the mouse to black out what detection did not catch.`)}</p>
              <div class="tl-ligne">
                <span class="tl-compte" id="tl-box-count">${compte(0, ['zone tracée', 'zones tracées'], ['area drawn', 'areas drawn'])}</span>
                <button type="button" id="tl-btn-clear-boxes" class="tl-btn">${L('Effacer les zones tracées', 'Clear drawn areas')}</button>
              </div>
            </div>

            <div>
              <label class="tl-case" style="margin-bottom:10px;">
                <input type="checkbox" id="tl-match-case">
                <span>${L('Respecter les majuscules et minuscules', 'Match upper and lower case')}</span>
              </label>
              <label class="tl-titre" for="tl-scale">${L('Qualité du fichier produit', 'Quality of the file produced')}</label>
              <select id="tl-scale">
                <option value="2" selected>${L('Élevée (environ 150 à 200 DPI)', 'High (about 150 to 200 DPI)')}</option>
                <option value="3">${L('Impression (environ 300 DPI)', 'Print (about 300 DPI)')}</option>
              </select>
            </div>
          </div>

          <div class="tl-apercu">
            <div class="tl-barre">
              <button type="button" id="tl-prev-page" class="tl-btn">◀ ${L('Précédente', 'Previous')}</button>
              <span class="tl-compte" id="tl-page-info">${L('Page 1 sur ', 'Page 1 of ')}${numPages || 1}</span>
              <button type="button" id="tl-next-page" class="tl-btn">${L('Suivante', 'Next')} ▶</button>
              <div class="tl-legende">${L(`Aperçu : chaque zone encadrée de rouge sera noircie définitivement dans le fichier produit. Ce qui n'est pas encadré restera lisible.`, `Preview: every area outlined in red will be blacked out permanently in the file produced. Anything not outlined will stay readable.`)}</div>
            </div>
            <div class="tl-defile" id="tl-defile">
              <div class="tl-alerte" id="tl-apercu-erreur" hidden></div>
              <div class="tl-feuille" id="tl-feuille"><canvas></canvas><canvas></canvas></div>
            </div>
          </div>
        </div>

        <div class="tl-pied">
          <label class="tl-case" style="flex:1; min-width:280px; font-weight:600;">
            <input type="checkbox" id="tl-chk-relu">
            <span>${L(`J'ai relu l'aperçu de chaque page, et je relirai le fichier produit avant de le transmettre.`, `I have reviewed the preview of every page, and I will review the file produced before I send it.`)}</span>
          </label>
          <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
            <div class="tl-etat" id="tl-etat" aria-live="polite"></div>
            <div style="display:flex; gap:10px;">
              <button type="button" id="tl-btn-cancel" class="tl-btn">${L('Annuler', 'Cancel')}</button>
              <button type="button" id="tl-btn-apply" class="tl-btn tl-btn-principal" disabled>${L('Caviarder', 'Redact')}</button>
            </div>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    const $ = (sel) => overlay.querySelector(sel)
    const feuille = $('#tl-feuille')
    const [previewCanvas, overlayCanvas] = feuille.querySelectorAll('canvas')
    const detectees = (n) => compte(n, ['zone détectée', 'zones détectées'], ['area detected', 'areas detected'])

    function getCurrentOptions() {
      return {
        terms: $('#tl-terms').value || '',
        matchCase: $('#tl-match-case').checked,
        detectSensitiveIdentifiers: $('#tl-chk-sensitive').checked,
        detectGdpr: $('#tl-chk-gdpr').checked,
        scale: parseFloat($('#tl-scale').value || 2),
        manualBoxes,
      }
    }

    async function donneesPage(n) {
      if (!pages.has(n)) {
        const page = await pdfDoc.getPage(n)
        pages.set(n, { page, textMap: await extractPageTextMap(page) })
      }
      return pages.get(n)
    }

    // Dit pourquoi le bouton est bloqué, plutôt que de le laisser gris sans un mot.
    function majEtat() {
      let raison = ''
      if (!pdfDoc) raison = L('Aperçu impossible : caviardage bloqué.', 'No preview: redaction is blocked.')
      else if (!bilan) raison = L('Analyse du document en cours…', 'Analysing the document…')
      else if (bilan.total === 0 && manualBoxes.length === 0) raison = L('Rien à caviarder : aucune zone détectée ni tracée.', 'Nothing to redact: no area detected or drawn.')
      else if (!$('#tl-chk-relu').checked) raison = L('Cochez la case de relecture pour caviarder.', 'Tick the review box to redact.')
      $('#tl-btn-apply').disabled = raison !== ''
      $('#tl-etat').textContent = raison
    }

    function majCompteurs() {
      const badge = $('#tl-detected-badge')
      const alerte = $('#tl-sans-texte')
      if (!pdfDoc) {
        badge.textContent = L('Détection impossible : le document n’a pas pu être lu.', 'Detection impossible: the document could not be read.')
        alerte.hidden = true
      } else if (!bilan) {
        badge.textContent = L('Analyse du document en cours…', 'Analysing the document…')
      } else {
        const ici = bilan.parPage.get(currentPage) || 0
        badge.textContent = numPages > 1
          ? detectees(bilan.total) + L(` dans le document, dont ${ici} sur cette page`, ` in the document, ${ici} of them on this page`)
          : detectees(bilan.total)
        if (bilan.sansTexte.length) {
          const liste = bilan.sansTexte.length > 12
            ? `${bilan.sansTexte.slice(0, 12).join(', ')}… (${bilan.sansTexte.length} pages)`
            : bilan.sansTexte.join(', ')
          alerte.textContent = bilan.sansTexte.length === numPages
            ? L('Ce document ne contient aucun texte lisible (scan ou image). La détection automatique n’y voit rien : tracez chaque zone à la main.', 'This document contains no readable text (scan or image). Automatic detection sees nothing in it: draw every area by hand.')
            : L(`Aucun texte lisible page ${liste} (scan ou image). La détection automatique n'y voit rien : tracez les zones à la main.`, `No readable text on page ${liste} (scan or image). Automatic detection sees nothing there: draw the areas by hand.`)
          alerte.hidden = false
        } else {
          alerte.hidden = true
        }
      }
      $('#tl-box-count').textContent = compte(manualBoxes.length, ['zone tracée', 'zones tracées'], ['area drawn', 'areas drawn'])
      majEtat()
    }

    // Analyse du document entier. Un tour périmé (réglage changé entre-temps)
    // n'écrit rien.
    async function analyser() {
      if (!pdfDoc) return
      const monTour = ++tour
      bilan = null
      majCompteurs()
      try {
        const opts = getCurrentOptions()
        const parPage = new Map()
        const sansTexte = []
        let total = 0
        for (let n = 1; n <= numPages; n++) {
          const { page, textMap } = await donneesPage(n)
          if (monTour !== tour) return
          if (!textMap.fullText.trim()) { sansTexte.push(n); continue }
          const nb = calculateTextMatchBoxes(page, page.getViewport({ scale: 1 }), textMap, opts).length
          parPage.set(n, nb)
          total += nb
        }
        bilan = { total, parPage, sansTexte }
        majCompteurs()
      } catch (err) {
        console.warn('[Toolocal Redact] Analyse impossible :', err)
        signalerApercuImpossible()
      }
    }

    let minuterie = null
    function reglageChange() {
      if (!pdfDoc) return
      if (currentVp && pages.has(currentPage)) {
        const { page, textMap } = pages.get(currentPage)
        activePageBoxes = calculateTextMatchBoxes(page, currentVp, textMap, getCurrentOptions())
        redrawOverlay()
      }
      tour++
      bilan = null
      majCompteurs()
      clearTimeout(minuterie)
      minuterie = setTimeout(analyser, 200)
    }

    // Les rendus se suivent à la file : PDF.js refuse deux rendus simultanés
    // sur le même canvas.
    let file = Promise.resolve()
    function afficherPage(n) {
      file = file.then(async () => {
        if (!pdfDoc) return
        currentPage = n
        $('#tl-page-info').textContent = L(`Page ${n} sur ${numPages}`, `Page ${n} of ${numPages}`)
        $('#tl-prev-page').disabled = n <= 1
        $('#tl-next-page').disabled = n >= numPages
        const { page, textMap } = await donneesPage(n)
        currentVp = page.getViewport({ scale: 1.5 })
        for (const c of [previewCanvas, overlayCanvas]) {
          c.width = Math.round(currentVp.width)
          c.height = Math.round(currentVp.height)
        }
        feuille.style.maxWidth = `${Math.round(currentVp.width)}px`
        await page.render({ canvasContext: previewCanvas.getContext('2d'), viewport: currentVp }).promise
        activePageBoxes = calculateTextMatchBoxes(page, currentVp, textMap, getCurrentOptions())
        redrawOverlay()
        $('#tl-defile').scrollTop = 0
        majCompteurs()
      }).catch((err) => {
        console.warn('[Toolocal Redact] Rendu de l’aperçu impossible :', err)
        signalerApercuImpossible()
      })
    }

    function signalerApercuImpossible() {
      pdfDoc = null
      bilan = null
      feuille.hidden = true
      const e = $('#tl-apercu-erreur')
      e.textContent = L('L’aperçu de ce document n’a pas pu être affiché. Sans aperçu, rien ne peut être relu : le caviardage est bloqué.', 'The preview of this document could not be displayed. Without a preview nothing can be reviewed: redaction is blocked.')
      e.hidden = false
      majCompteurs()
    }

    function redrawOverlay() {
      const ctx = overlayCanvas.getContext('2d')
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 2
      for (const b of activePageBoxes) {
        ctx.fillRect(b.x, b.y, b.width, b.height)
        ctx.strokeRect(b.x, b.y, b.width, b.height)
      }
      for (const b of manualBoxes.filter((m) => m.page === currentPage)) {
        const x = b.normX * overlayCanvas.width
        const y = b.normY * overlayCanvas.height
        const w = b.normWidth * overlayCanvas.width
        const h = b.normHeight * overlayCanvas.height
        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
      }
    }

    // Le canvas est affiché à la largeur disponible : la position de la souris
    // est ramenée aux pixels réels du canvas.
    function position(e) {
      const r = overlayCanvas.getBoundingClientRect()
      const x = (e.clientX - r.left) * (overlayCanvas.width / r.width)
      const y = (e.clientY - r.top) * (overlayCanvas.height / r.height)
      return {
        x: Math.max(0, Math.min(overlayCanvas.width, x)),
        y: Math.max(0, Math.min(overlayCanvas.height, y)),
      }
    }

    let depart = null
    overlayCanvas.addEventListener('mousedown', (e) => { depart = position(e) })
    overlayCanvas.addEventListener('mousemove', (e) => {
      if (!depart) return
      const p = position(e)
      redrawOverlay()
      const ctx = overlayCanvas.getContext('2d')
      ctx.save()
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.fillRect(depart.x, depart.y, p.x - depart.x, p.y - depart.y)
      ctx.strokeRect(depart.x, depart.y, p.x - depart.x, p.y - depart.y)
      ctx.restore()
    })
    const finTrace = (e) => {
      if (!depart) return
      const p = position(e)
      const width = Math.abs(p.x - depart.x)
      const height = Math.abs(p.y - depart.y)
      if (width > 5 && height > 5) {
        manualBoxes.push({
          page: currentPage,
          normX: Math.min(depart.x, p.x) / overlayCanvas.width,
          normY: Math.min(depart.y, p.y) / overlayCanvas.height,
          normWidth: width / overlayCanvas.width,
          normHeight: height / overlayCanvas.height,
        })
      }
      depart = null
      redrawOverlay()
      majCompteurs()
    }
    overlayCanvas.addEventListener('mouseup', finTrace)
    overlayCanvas.addEventListener('mouseleave', finTrace)

    $('#tl-terms').addEventListener('input', reglageChange)
    $('#tl-chk-sensitive').addEventListener('change', reglageChange)
    $('#tl-chk-gdpr').addEventListener('change', reglageChange)
    $('#tl-match-case').addEventListener('change', reglageChange)
    $('#tl-chk-relu').addEventListener('change', majEtat)

    $('#tl-prev-page').onclick = () => { if (pdfDoc && currentPage > 1) afficherPage(currentPage - 1) }
    $('#tl-next-page').onclick = () => { if (pdfDoc && currentPage < numPages) afficherPage(currentPage + 1) }

    overlay.querySelectorAll('.tl-preset').forEach((btn) => {
      btn.onclick = () => {
        const termes = $('#tl-terms')
        const val = btn.getAttribute('data-preset')
        termes.value = termes.value.trim() ? `${termes.value.trim()}, ${val}` : val
        reglageChange()
      }
    })

    $('#tl-btn-clear-boxes').onclick = () => {
      manualBoxes.length = 0
      redrawOverlay()
      majCompteurs()
    }

    const fermer = (resultat) => {
      clearTimeout(minuterie)
      tour++
      overlay.remove()
      resolve(resultat)
    }
    $('#tl-btn-close').onclick = () => fermer({ cancelled: true })
    $('#tl-btn-cancel').onclick = () => fermer({ cancelled: true })
    $('#tl-btn-apply').onclick = () => {
      if ($('#tl-btn-apply').disabled || !bilan) return
      fermer({
        cancelled: false,
        options: getCurrentOptions(),
        bilan: { zones: bilan.total + manualBoxes.length, sansTexte: bilan.sansTexte.length },
      })
    }

    if (pdfDoc) {
      afficherPage(1)
      analyser()
    } else {
      signalerApercuImpossible()
    }
  })
}
