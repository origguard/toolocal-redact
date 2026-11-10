import fs from 'node:fs'
import path from 'node:path'

// Établir l'environnement Node pour exécuter le moteur réel redactPdf()
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

// Canvas mock minimal fournissant les interfaces exigées par le moteur de rendu PDF.js
const emptyPngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
const dataUrl = `data:image/png;base64,${emptyPngB64}`

function createMockCanvas() {
  const canvas = {
    width: 600,
    height: 400,
    toDataURL: () => dataUrl,
  }
  const ctx = {
    canvas,
    fillRect: () => {},
    clearRect: () => {},
    strokeRect: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    transform: () => {},
    setTransform: () => {},
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    clip: () => {},
    drawImage: () => {},
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  }
  canvas.getContext = () => ctx
  return canvas
}

globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createMockCanvas()
    return {}
  },
}

// 1. Initialisation explicite du worker et du moteur PDF.js
import '../src/vendor/pdf.worker.min.js'
import '../src/vendor/pdf.min.js'

import { PDFDocument, StandardFonts } from 'pdf-lib'

// Importer le véritable moteur et ses fonctions de contrôle
import {
  inspectPdf,
  getPdfJs,
  extractPageTextMap,
  calculateTextMatchBoxes,
  redactPdf,
} from '../src/engine/redact.js'

async function runTests() {
  console.log('=================================================================')
  console.log('TEST SUITE : MOTEUR DE CAVIARDAGE SOUVERAIN (TOOLOCAL REDACT)')
  console.log('=================================================================')

  console.log('\n=== TEST 1 : Création d\'un document PDF avec données confidentielles ===')
  const doc = await PDFDocument.create()
  const page = doc.addPage([600, 400])
  const font = await doc.embedFont(StandardFonts.Helvetica)

  page.drawText('CONTRAT COMMERCIAL CONFIDENTIEL', { x: 50, y: 350, size: 16, font })
  page.drawText('Client: Jean Durand', { x: 50, y: 300, size: 12, font })
  page.drawText('Statutory Work Forbidden', { x: 50, y: 270, size: 12, font })
  page.drawText('IBAN Bancaire: FR76 3000 1234 5678 9000 123', { x: 50, y: 240, size: 12, font })
  page.drawText('Email: contact@secretcorp.com', { x: 50, y: 210, size: 12, font })
  page.drawText('Migration risk on M365 Tenant', { x: 50, y: 180, size: 12, font })

  doc.setTitle('Contrat Ultra Secret')
  doc.setAuthor('Entreprise XYZ')

  const originalPdfBytes = await doc.save()
  console.log('✓ Document généré avec succès, taille :', originalPdfBytes.length, 'octets')

  console.log('\n=== TEST 2 : Contrôles d\'intégrité structurelle inspectPdf() ===')
  const inspectStd = inspectPdf(originalPdfBytes)
  if (inspectStd.encrypted !== false) throw new Error('Échec : faux positif sur chiffrement')
  if (inspectStd.incrementalRevisions !== 1) throw new Error('Échec : révisions incrémentales erronées sur original')
  console.log('✓ inspectPdf() valide (revisions = 1, encrypted = false)')

  // Simulation de révision incrémentale masquée (%%EOF multiple)
  const incrementalBytes = new Uint8Array(originalPdfBytes.length + 100)
  incrementalBytes.set(originalPdfBytes)
  const appendBuf = Buffer.from('\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n12345\n%%EOF\n', 'latin1')
  incrementalBytes.set(appendBuf, originalPdfBytes.length)

  const inspectMulti = inspectPdf(incrementalBytes)
  if (inspectMulti.incrementalRevisions !== 2) throw new Error('Échec : détection de révision incrémentale masquée échouée')
  console.log('✓ Détection de révision incrémentale validée (%%EOF = 2)')

  // Simulation /Encrypt
  const encBytes = new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Encrypt 3 0 R >>\nendobj\n%%EOF\n', 'latin1'))
  const inspectEnc = inspectPdf(encBytes)
  if (inspectEnc.encrypted !== true) throw new Error('Échec : détection /Encrypt échouée')
  console.log('✓ Détection /Encrypt validée (encrypted = true)')

  console.log('\n=== TEST 3 : Preuve de lecture positive AVANT caviardage (Extraction réelle) ===')
  const pdfjs = getPdfJs()
  const loadingTask = pdfjs.getDocument({
    data: originalPdfBytes.slice(),
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const loadedDoc = await loadingTask.promise
  const page1 = await loadedDoc.getPage(1)
  const vp = page1.getViewport({ scale: 2 })

  const textMap = await extractPageTextMap(page1)
  const fullTextAvant = textMap.fullText
  console.log('Texte extrait du document original :\n"' + fullTextAvant + '"')

  // Assertions positives indispensables
  if (!fullTextAvant.includes('Jean Durand')) {
    throw new Error('Échec critique : "Jean Durand" n\'a pas été extrait du document d\'origine !')
  }
  if (!fullTextAvant.includes('FR76 3000 1234 5678 9000 123')) {
    throw new Error('Échec critique : l\'IBAN n\'a pas été extrait du document d\'origine.')
  }
  if (!fullTextAvant.includes('contact@secretcorp.com')) {
    throw new Error('Échec critique : l\'email n\'a pas été extrait du document d\'origine.')
  }
  if (!fullTextAvant.includes('Statutory Work Forbidden')) {
    throw new Error('Échec critique : l\'expression sensible n\'a pas été extraite.')
  }
  console.log('✓ ASSERTION POSITIVE VALIDÉE : Tous les secrets sont lisibles dans le document source.')

  console.log('\n=== TEST 4 : Détection intelligente des zones de caviardage ===')
  const customBoxes = calculateTextMatchBoxes(page1, vp, textMap, {
    terms: ['Jean Durand', 'Statutory Work', 'M365 Tenant', 'Migration risk'],
  })
  console.log('Boîtes calculées pour termes multi-mots :', customBoxes.length)
  if (customBoxes.length < 4) {
    throw new Error(`Échec : attendu au moins 4 zones détectées, obtenu ${customBoxes.length}`)
  }

  const gdprBoxes = calculateTextMatchBoxes(page1, vp, textMap, {
    detectGdpr: true,
    detectSensitiveIdentifiers: true,
  })
  console.log('Boîtes calculées pour RGPD & Identifiants sensibles :', gdprBoxes.length)
  const hasIban = gdprBoxes.some((b) => b.matchText.includes('FR76'))
  const hasEmail = gdprBoxes.some((b) => b.matchText.includes('secretcorp.com'))
  const hasStatutory = gdprBoxes.some((b) => b.matchText.includes('Statutory'))

  if (!hasIban || !hasEmail || !hasStatutory) {
    throw new Error('Échec : les motifs réglementaires (IBAN, email, sensible) n\'ont pas tous été localisés.')
  }
  console.log('✓ Détection des cibles sensibles validée avec succès.')

  console.log('\n=== TEST 5 : Caviardage réel via redactPdf() & Preuve de destruction définitive ===')
  // EXÉCUTION DU VÉRITABLE MOTEUR sur le document d'origine contenant les secrets
  const redactOptions = {
    terms: ['Jean Durand', 'CONTRAT COMMERCIAL CONFIDENTIEL', 'Migration risk on M365 Tenant'],
    detectGdpr: true,
    detectSensitiveIdentifiers: true,
  }

  const caviardeBytes = await redactPdf(originalPdfBytes, redactOptions)
  console.log('✓ redactPdf() exécuté avec succès. Nouveau conteneur :', caviardeBytes.length, 'octets')

  // Contrôle sur le document produit par le moteur
  const inspectApres = inspectPdf(caviardeBytes)
  if (inspectApres.incrementalRevisions !== 1) {
    throw new Error('Échec : le document caviardé présente des révisions antérieures récupérables !')
  }

  // Extraction de texte sur le document issu de redactPdf()
  const postLoad = await pdfjs.getDocument({ data: caviardeBytes, isEvalSupported: false, useSystemFonts: true }).promise
  const postPage = await postLoad.getPage(1)
  const postTextMap = await extractPageTextMap(postPage)
  const fullTextApres = postTextMap.fullText
  console.log('Texte extrait du document caviardé par redactPdf() :\n"' + fullTextApres + '"')

  // Assertions négatives impératives
  if (fullTextApres.includes('Jean Durand')) {
    throw new Error('ALERTE SÉCURITÉ : "Jean Durand" est toujours extractible après passage dans redactPdf() !')
  }
  if (fullTextApres.includes('FR76')) {
    throw new Error('ALERTE SÉCURITÉ : L\'IBAN est toujours extractible après passage dans redactPdf() !')
  }
  if (fullTextApres.includes('secretcorp.com')) {
    throw new Error('ALERTE SÉCURITÉ : L\'email est toujours extractible après passage dans redactPdf() !')
  }
  if (fullTextApres.includes('Statutory Work')) {
    throw new Error('ALERTE SÉCURITÉ : "Statutory Work" est toujours extractible après passage dans redactPdf() !')
  }
  console.log('✓ ASSERTION NÉGATIVE VALIDÉE : Tous les secrets ont été définitivement détruits par redactPdf().')

  console.log('\n=================================================================')
  console.log('SUITE DE TESTS MOTEUR CONCLUANTE')
  console.log('=================================================================')
}

runTests().catch((err) => {
  console.error('\nERREUR CRITIQUE DANS LES TESTS :', err)
  process.exit(1)
})
