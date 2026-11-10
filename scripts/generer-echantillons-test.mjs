import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

async function genererPdf(nomFichier, titre, contenu) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontReg = await doc.embedFont(StandardFonts.Helvetica)

  page.drawText(titre, {
    x: 50,
    y: 750,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  })

  let y = 700
  for (const ligne of contenu) {
    page.drawText(ligne, {
      x: 50,
      y,
      size: 12,
      font: fontReg,
      color: rgb(0.2, 0.2, 0.2),
    })
    y -= 30
  }

  const bytes = await doc.save()
  fs.mkdirSync(path.dirname(nomFichier), { recursive: true })
  fs.writeFileSync(nomFichier, bytes)
  console.log(`Généré : ${nomFichier} (${bytes.length} octets)`)
}

async function main() {
  const dir = 'test_samples'
  
  await genererPdf(
    path.join(dir, 'contrat.pdf'),
    'CONTRAT COMMERCIAL CONFIDENTIEL',
    [
      'Client : Jean Dupont',
      'IBAN : FR76 3000 1234 5678 9000 123',
      'Email : contact@secretcorp.com',
      'Statutory Work Forbidden - Tenant Migration Risk'
    ]
  )

  await genererPdf(
    path.join(dir, 'dossier_pièce_août.pdf'),
    'DOSSIER PIECE ACCENTUEE AOUT',
    [
      'Pièce confidentielle relative à la transaction d\'août.',
      'Bénéficiaire : Marie Dupuis',
      'Numéro de compte : FR76 1000 2000 3000 4000 500',
      'Donnée strictement protégée.'
    ]
  )

  await genererPdf(
    path.join(dir, 'dossier#42_annexe.pdf'),
    'DOSSIER AVEC CARACTERE SPECIAL DIESE #42',
    [
      'Annexe spéciale référencée #42.',
      'Identifiant technique : SEC-REF-#42-CONF',
      'Code d\'accès confidentiel : 9876-5432-10',
      'Document soumis au secret des affaires.'
    ]
  )
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
