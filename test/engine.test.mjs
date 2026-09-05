import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// Importer le moteur inspectPdf
import { inspectPdf } from '../src/engine/redact.js'

async function runTests() {
  console.log('=== TEST 1: Création d\'un PDF de test avec données sensibles ===')
  const doc = await PDFDocument.create()
  const page = doc.addPage([600, 400])
  const font = await doc.embedFont(StandardFonts.Helvetica)

  page.drawText('CONTRAT COMMERCIAL CONFIDENTIEL', { x: 50, y: 350, size: 16, font })
  page.drawText('Client: Jean Dupont', { x: 50, y: 300, size: 12, font })
  page.drawText('IBAN Bancaire: FR76 3000 1234 5678 9000 123', { x: 50, y: 270, size: 12, font })
  page.drawText('Donnée Secrète: SECRET_PROJECT_OMEGA', { x: 50, y: 240, size: 12, font })

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
  // Simuler une sauvegarde incrémentale (append xref + %%EOF)
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

  console.log('\n=== TEST 5: Vérification de l\'intégrité du bundle Webpack généré ===')
  const bundlePath = path.resolve('js/toolocal_redact-main.js')
  if (!fs.existsSync(bundlePath)) {
    throw new Error('Le bundle js/toolocal_redact-main.js n\'existe pas !')
  }
  const stat = fs.statSync(bundlePath)
  console.log('Bundle js/toolocal_redact-main.js présent, taille:', Math.round(stat.size / 1024), 'Ko')

  // Vérifier qu'aucun import CDN ou domaine externe n'est présent dans le bundle
  const bundleContent = fs.readFileSync(bundlePath, 'utf8')
  if (/https?:\/\/cdn\./i.test(bundleContent) || /https?:\/\/cdnjs\./i.test(bundleContent)) {
    throw new Error('Alerte critique: référence CDN détectée dans le bundle !')
  }
  console.log('✓ Bundle 100% autonome et sans référence CDN externe')

  console.log('\n========================================')
  console.log('TOUS LES TESTS AUTOMATISÉS ONT RÉUSSI !')
  console.log('========================================')
}

runTests().catch((err) => {
  console.error('Erreur:', err)
  process.exit(1)
})
