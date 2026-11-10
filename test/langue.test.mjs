/* Choix de la langue, et garde contre un libellé qui manquerait dans l'une
   des deux langues. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { L, compte, enFrancais } from '../src/langue.js'

let n = 0
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`) }

console.log('\nLangue du dialogue\n')

cas('français pour fr, fr-FR, FR_ca ; anglais pour tout le reste', () => {
  for (const l of ['fr', 'fr-FR', 'FR_ca', ' fr ']) assert.equal(enFrancais(l), true, l)
  for (const l of ['en', 'en-GB', 'de', 'nl', '', 'afr']) assert.equal(enFrancais(l), false, l)
})
cas('sans page ni langue connue : anglais', () => {
  assert.equal(enFrancais(), false)
  assert.equal(L('Annuler', 'Cancel'), 'Cancel')
})
cas('L rend le libellé de la langue demandée', () => {
  assert.equal(L('Annuler', 'Cancel', 'fr'), 'Annuler')
  assert.equal(L('Annuler', 'Cancel', 'de'), 'Cancel')
})
cas('L refuse un libellé absent, vide ou non textuel dans l’une des langues', () => {
  for (const [a, b] of [['', 'x'], ['x', ''], [null, 'x'], ['x', undefined], [3, 'x']]) {
    assert.throws(() => L(a, b, 'fr'), TypeError)
  }
})
cas('compte : pluriels français et anglais, zéro compris', () => {
  const fr = ['zone', 'zones']; const en = ['area', 'areas']
  assert.equal(compte(0, fr, en, 'fr'), '0 zone')
  assert.equal(compte(1, fr, en, 'fr'), '1 zone')
  assert.equal(compte(2, fr, en, 'fr'), '2 zones')
  assert.equal(compte(0, fr, en, 'en'), '0 areas')
  assert.equal(compte(1, fr, en, 'en'), '1 area')
  assert.equal(compte(2, fr, en, 'en'), '2 areas')
})
cas('compte refuse un nombre négatif, décimal ou non numérique', () => {
  for (const v of [-1, 1.5, '2', null, NaN]) assert.throws(() => compte(v, ['a', 'b'], ['c', 'd'], 'fr'), RangeError)
})
cas('aucun appel à L ou compte dans le code n’a moins de deux libellés', () => {
  for (const f of ['src/redact-view.js', 'src/webdav.js', 'src/fileaction.js']) {
    const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')
    assert.ok(/\bL\(/.test(s), f + ' : aucun libellé bilingue')
    assert.equal(/\bL\(\s*(['"`])(?:(?!\1).)*\1\s*\)/.test(s), false, f + ' : L() à un seul libellé')
  }
})

console.log(`\n  ${n} contrôles passés.\n`)
