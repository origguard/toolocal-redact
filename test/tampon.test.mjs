/* Contrôle de la forme sous laquelle un PDF part vers WebDAV.
   Le défaut visé : un Uint8Array passé tel quel à la bibliothèque webdav est
   sérialisé en JSON dans un navigateur, et le fichier enregistré n'est plus un
   PDF. Ce test passe les octets à la fonction réelle de la bibliothèque. */
import assert from 'node:assert/strict'
import { enTampon, estPdf, memesOctets } from '../src/tampon.js'
import { etendueHorizontale } from '../src/engine/redact.js'
import { requestDataToFetchBody } from '../node_modules/webdav/dist/node/tools/body.js'

const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
let n = 0
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`) }

console.log('\nForme des octets envoyés à WebDAV\n')

cas('rejette null, une chaîne, un tableau ordinaire', () => {
  for (const v of [null, undefined, '%PDF-1.7', [0x25, 0x50], {}]) assert.throws(() => enTampon(v), TypeError)
})
cas('rejette une suite vide', () => assert.throws(() => enTampon(new Uint8Array(0)), RangeError))
cas('rejette ce qui n’est pas un PDF', () => {
  assert.throws(() => enTampon(new TextEncoder().encode('{"0":37,"1":80,"2":68}')), TypeError)
  assert.equal(estPdf(new TextEncoder().encode('{"0":37}')), false)
})
cas('rend un ArrayBuffer aux octets identiques', () => {
  const t = enTampon(pdf)
  assert.ok(t instanceof ArrayBuffer)
  assert.ok(memesOctets(new Uint8Array(t), pdf))
})
cas('une vue partielle ne laisse pas passer le reste de son tampon', () => {
  const large = new Uint8Array(pdf.byteLength + 20).fill(0x41)
  large.set(pdf, 10)
  const t = enTampon(large.subarray(10, 10 + pdf.byteLength))
  assert.equal(t.byteLength, pdf.byteLength)
  assert.ok(memesOctets(new Uint8Array(t), pdf))
})
cas('la bibliothèque webdav envoie cet ArrayBuffer tel quel, sans JSON', () => {
  const [corps, enTetes] = requestDataToFetchBody(enTampon(pdf))
  assert.ok(corps instanceof ArrayBuffer)
  assert.deepEqual(enTetes, {})
})
cas('témoin : un objet quelconque, lui, part en JSON — le défaut d’origine', () => {
  const [corps, enTetes] = requestDataToFetchBody({ 0: 37, 1: 80 })
  assert.equal(typeof corps, 'string')
  assert.equal(enTetes['content-type'], 'application/json')
})
cas('memesOctets distingue une longueur ou un octet différent', () => {
  const autre = pdf.slice(); autre[9] ^= 1
  assert.equal(memesOctets(pdf, autre), false)
  assert.equal(memesOctets(pdf, pdf.subarray(1)), false)
  assert.equal(memesOctets(pdf, null), false)
})

console.log('\nÉtendue d’une boîte de caviardage\n')

cas('rejette un texte vide, une largeur ou des indices invalides', () => {
  assert.throws(() => etendueHorizontale('', 10, 0, 0), TypeError)
  assert.throws(() => etendueHorizontale(null, 10, 0, 0), TypeError)
  assert.throws(() => etendueHorizontale('abc', NaN, 0, 0), RangeError)
  assert.throws(() => etendueHorizontale('abc', 10, 2, 1), RangeError)
  assert.throws(() => etendueHorizontale('abc', 10, 0, 3), RangeError)
  assert.throws(() => etendueHorizontale('abc', 10, -1, 1), RangeError)
})
cas('couvre toujours l’estimation à chasse fixe, marge en plus', () => {
  const texte = 'IBAN : FR7630006000011234567890189'
  const largeur = 300
  const fixe = largeur / texte.length
  for (let d = 0; d < texte.length; d++) for (let f = d; f < texte.length; f++) {
    const e = etendueHorizontale(texte, largeur, d, f)
    assert.ok(e.de < d * fixe && e.a > (f + 1) * fixe, `${d}-${f}`)
  }
})
cas('après des caractères étroits, la boîte commence plus tôt qu’à chasse fixe', () => {
  const texte = 'IBAN : FR7630006000011234567890189'
  const fixe = 300 / texte.length
  const e = etendueHorizontale(texte, 300, 7, texte.length - 1)
  assert.ok(e.de < 7 * fixe - fixe, 'le F de FR76 doit être couvert')
})
cas('avant des caractères étroits, la boîte finit plus tard qu’à chasse fixe', () => {
  const texte = 'Work illicit'
  const fixe = 120 / texte.length
  const e = etendueHorizontale(texte, 120, 0, 3)
  assert.ok(e.a > 4 * fixe + fixe)
})

console.log(`\n  ${n} contrôles passés.\n`)
