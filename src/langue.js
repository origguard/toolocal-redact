/* =============================================================================
   src/langue.js — français ou anglais, selon la langue de l'utilisateur
   -----------------------------------------------------------------------------
   L'application ne livre pas de fichiers de traduction : chaque libellé est
   écrit dans le code, dans les deux langues, côte à côte. Ainsi une phrase ne
   peut pas exister dans une langue et manquer dans l'autre.

   La langue est celle que Nextcloud inscrit sur la page (<html lang="…">),
   c'est-à-dire celle choisie par l'utilisateur dans ses paramètres. Français
   si elle commence par « fr » ; anglais dans tous les autres cas.
============================================================================= */

/** Vrai si l'interface doit être en français. */
export function enFrancais(langue) {
  const l = typeof langue === 'string'
    ? langue
    : (typeof document !== 'undefined' && document.documentElement ? document.documentElement.lang : '')
  return typeof l === 'string' && l.trim().toLowerCase().startsWith('fr')
}

/**
 * Rend le libellé dans la langue de l'utilisateur.
 * @param {string} fr Le libellé français
 * @param {string} en Le libellé anglais
 * @param {string} [langue] Langue imposée (pour les tests) ; sinon celle de la page
 */
export function L(fr, en, langue) {
  if (typeof fr !== 'string' || fr === '' || typeof en !== 'string' || en === '') {
    throw new TypeError('Un libellé doit exister dans les deux langues.')
  }
  return enFrancais(langue) ? fr : en
}

/**
 * « 1 zone », « 2 zones » — et « 0 zone » en français, « 0 areas » en anglais.
 * @param {number} n
 * @param {[string, string]} fr Singulier et pluriel français
 * @param {[string, string]} en Singulier et pluriel anglais
 * @param {string} [langue]
 */
export function compte(n, fr, en, langue) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('Nombre entier positif attendu.')
  const singulier = L(fr[0], en[0], langue)
  const pluriel = L(fr[1], en[1], langue)
  const plusieurs = enFrancais(langue) ? n > 1 : n !== 1
  return `${n} ${plusieurs ? pluriel : singulier}`
}
