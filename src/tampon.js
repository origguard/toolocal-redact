/* =============================================================================
   src/tampon.js — forme sous laquelle les octets d'un PDF partent vers WebDAV
   -----------------------------------------------------------------------------
   La bibliothèque webdav n'envoie tel quel qu'une chaîne, un Buffer (Node) ou
   un ArrayBuffer. Tout autre objet — un Uint8Array compris, dans un
   navigateur — est passé à JSON.stringify : le fichier enregistré contient
   alors « {"0":37,"1":80,…} » au lieu du PDF, sous un nom en « .pdf ».

   Défaut constaté le 2026-11-10 sur Nextcloud 33, 34 et 35 en relisant un
   fichier produit. Ce module existe pour qu'il ne revienne pas : il est testé
   seul (test/tampon.test.mjs), et ecrire() relit ce qu'elle vient d'écrire.
============================================================================= */

const EN_TETE_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] // « %PDF- »

/** Vrai si ces octets commencent comme un PDF. */
export function estPdf(octets) {
  return octets instanceof Uint8Array
    && octets.byteLength > EN_TETE_PDF.length
    && EN_TETE_PDF.every((o, i) => octets[i] === o)
}

/**
 * Copie exacte des octets dans un ArrayBuffer autonome.
 * Une vue peut ne couvrir qu'une partie de son tampon : on ne renvoie jamais
 * `octets.buffer` tel quel, qui pourrait contenir autre chose.
 * @param {Uint8Array} octets
 * @returns {ArrayBuffer}
 */
export function enTampon(octets) {
  if (!(octets instanceof Uint8Array)) throw new TypeError('Octets attendus sous forme de Uint8Array.')
  if (octets.byteLength === 0) throw new RangeError('Aucun octet à enregistrer.')
  if (!estPdf(octets)) throw new TypeError('Ces octets ne sont pas un PDF : rien n’est enregistré.')
  return octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)
}

/** Vrai si les deux suites d'octets sont identiques. */
export function memesOctets(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}
