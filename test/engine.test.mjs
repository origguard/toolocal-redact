import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// Importer le moteur inspectPdf et les nouvelles fonctions de détection
import {
  inspectPdf,
  getPdfJs,
  extractPageTextMap,
  calculateTextMatchBoxes,
  PRESET_PATTERNS,
} from '../src/engine/redact.js'

async function runTests() {
  console.log('=== TEST 1: Création d\'un PDF de test avec données sensibles ===')
  const doc = await PDFDocument.create()
  const page = doc.addPage([600, 400])
  const font = await doc.embedFont(StandardFonts.Helvetica)

  page.drawText('CONTRAT COMMERCIAL CONFIDENTIEL', { x: 50, y: 350, size: 16, font })
  page.drawText('Client: Jean Dupont', { x: 50, y: 300, size: 12, font })
  page.drawText('Statutory Work Forbidden', { x: 50, y: 270, size: 12, font })
  page.drawText('IBAN Bancaire: FR76 3000 1234 5678 9000 123', { x: 50, y: 240, size: 12, font })
  page.drawText('Email: contact@secretcorp.com', { x: 50, y: 210, size: 12, font })
  page.drawText('Migration risk and uncertainty on M365 Tenant', { x: 50, y: 180, size: 12, font })

  doc.setTitle('Contrat Ultra Secret')
  doc.setAuthor('Entreprise XYZ')

  const pdfBytes = await doc.save()
  console.log('PDF généré avec succès, taille:', pdfBytes.length, 'octets')

  console.log('\n=== TEST 2: Validation de inspectPdf() sur document standard ===')
  const before = inspectPdf(pdfBytes)
  console.log('Résultat inspectPdf (document standard):', before)
  if (before.encrypted !== false) throw new Error('Échec: faux positif de chiffrement')
  if (before.incrementalRevisions !== 1) throw new Error('Échec: comptage erroné de révisions incrémentales')
  console.log('✓ inspectPdf() valide pour document standard (revisions = 1, encrypted = false)')

  console.log('\n=== TEST 3: Validation de inspectPdf() sur PDF avec révisions multiples ===')
  const incrementalBytes = new Uint8Array(pdfBytes.length + 100)
  incrementalBytes.set(pdfBytes)
  const appendStr = '\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n12345\n%%EOF\n'
  const appendBuf = Buffer.from(appendStr, 'latin1')
  incrementalBytes.set(appendBuf, pdfBytes.length)

  const multiRevCheck = inspectPdf(incrementalBytes)
  console.log('Résultat inspectPdf (document incrémental simulé):', multiRevCheck)
  if (multiRevCheck.incrementalRevisions !== 2) throw new Error('Échec: détection des révisions incrémentales échouée')
  console.log('✓ Détection des révisions incrémentales validée (%%EOF = 2)')

  console.log('\n=== TEST 4: Validation de inspectPdf() sur détection /Encrypt ===')
  const encStr = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Encrypt 3 0 R >>\nendobj\n%%EOF\n'
  const encBytes = new Uint8Array(Buffer.from(encStr, 'latin1'))
  const encCheck = inspectPdf(encBytes)
  console.log('Résultat inspectPdf (document chiffré):', encCheck)
  if (encCheck.encrypted !== true) throw new Error('Échec: détection du chiffrement /Encrypt échouée')
  console.log('✓ Détection /Encrypt validée (encrypted = true)')

  console.log('\n=== TEST 5: Test du moteur de reconnaissance de texte (Reconnaissance multi-mots, RGPD & PII) ===')
  const pdfjs = getPdfJs()
  // Définir le worker local
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = path.resolve('src/vendor/pdf.worker.min.js')
  }

  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const loadedPdf = await loadingTask.promise
  const page1 = await loadedPdf.getPage(1)
  const vp = page1.getViewport({ scale: 2 })

  const textMap = await extractPageTextMap(page1)
  console.log('Texte intégral extrait de la page:\n', textMap.fullText)

  // A. Test recherche multi-mots personnalisés
  const customBoxes = calculateTextMatchBoxes(page1, vp, textMap, {
    terms: ['Statutory Work', 'M365 Tenant', 'Migration risk'],
  })
  console.log('Boîtes détectées pour termes multi-mots:', customBoxes.length)
  if (customBoxes.length < 3) {
    throw new Error(`Échec détection multi-mots: attendu au moins 3 boîtes, reçu ${customBoxes.length}`)
  }
  console.log('✓ Reconnaissance des termes multi-mots validée avec succès')

  // B. Test détection automatique RGPD & Identifiants sensibles
  const autoBoxes = calculateTextMatchBoxes(page1, vp, textMap, {
    detectGdpr: true,
    detectSensitiveIdentifiers: true,
  })
  console.log('Boîtes détectées pour RGPD & Identifiants sensibles:', autoBoxes.length)
  const foundTerms = autoBoxes.map((b) => b.term)
  console.log('Catégories/termes détectés:', [...new Set(foundTerms)])

  const hasGdpr = autoBoxes.some((b) => b.term === 'GDPR / PII')
  const hasStatutory = autoBoxes.some((b) => b.term === 'Statutory Work')
  if (!hasGdpr || !hasStatutory) {
    throw new Error('Échec détection automatique RGPD ou Identifiants sensibles')
  }
  console.log('✓ Détection automatique RGPD (IBAN, Email) et Identifiants sensibles validée')

  console.log('\n=== TEST 6: Vérification de l\'absence de MESSAGE-JOS.md dans le repo et le paquet ===')
  if (fs.existsSync('MESSAGE-JOS.md')) {
    throw new Error('ALERTE: MESSAGE-JOS.md est toujours présent à la racine du dépôt !')
  }
  console.log('✓ MESSAGE-JOS.md supprimé avec succès')

  console.log('\n========================================')
  console.log('TOUS LES TESTS AUTOMATISÉS ONT RÉUSSI !')
  console.log('========================================')
}

runTests().catch((err) => {
  console.error('Erreur:', err)
  process.exit(1)
})
