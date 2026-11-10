/* =============================================================================
   src/webdav.js — lecture et écriture WebDAV pour toolocal-redact
   -----------------------------------------------------------------------------
   Remplace readFile() et writeFile() de redact-view.js.

   POURQUOI UN MODULE ENTIER PLUTÔT QU'UN CORRECTIF

   La version actuelle construit les requêtes à la main : URL, jeton CSRF,
   chemin, en-têtes. Chacune de ces pièces a un défaut connu :

   · « /index.php/csrftoken » et « /remote.php/dav/files » sont écrits en
     absolu. Sur une instance installée dans un sous-dossier
     (https://exemple.fr/nextcloud/), ces adresses n'existent pas.
   · encodeURI() laisse passer « # » et « ? ». Un fichier nommé
     « Pièce #3.pdf » est tronqué à « Pièce » : la requête vise un fichier
     qui n'existe pas.
   · Le PUT écrase sans prévenir un « -redacted.pdf » déjà présent — y compris
     une version caviardée antérieure que l'utilisateur voulait garder.
   · window.OCA.Files.fileList.reload() est l'API de l'ancienne application
     Fichiers. Depuis Nextcloud 28, Fichiers est réécrit : le fichier est
     enregistré mais n'apparaît pas, et l'utilisateur croit à un échec.

   @nextcloud/files v4 fournit déjà un client WebDAV qui règle les trois
   premiers points : il connaît l'URL réelle de l'instance, ajoute le jeton,
   et encode les chemins. C'est ce qu'emploient les applications officielles.

   API VÉRIFIÉE sur @nextcloud/files 4.1.0 et webdav 5.11.0 :
     getClient, getDefaultPropfind, resultToNode  (depuis '@nextcloud/files/dav')
     client.getFileContents, client.putFileContents, client.exists, client.stat
     node.root, node.dirname, node.basename, node.path
============================================================================= */

import { getClient, getDefaultPropfind, resultToNode } from '@nextcloud/files/dav'
import { emit } from '@nextcloud/event-bus'
import { enTampon, estPdf, memesOctets } from './tampon.js'
import { L } from './langue.js'

/* Un seul client pour la session : il porte l'URL de l'instance et le jeton. */
let client = null
const dav = () => (client ??= getClient())

/* Assemble un chemin DAV sans double barre oblique.
   node.dirname vaut « / » à la racine : une concaténation naïve produirait
   « /files/alice//contrat.pdf », que certains serveurs refusent. */
function joindre(...morceaux) {
  return '/' + morceaux
    .map((m) => String(m).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}

/* Chemin DAV complet d'un nœud : racine de l'utilisateur, puis chemin relatif.
   On ne passe PAS par source ou encodedSource : ce sont des URL complètes,
   alors que le client attend un chemin relatif à sa racine — et il se charge
   lui-même de l'encodage. Encoder deux fois est la cause la plus fréquente
   d'un 404 sur un nom accentué. */
const cheminDe = (node) => joindre(node.root, node.path)

/**
 * Lit le PDF désigné par le nœud Fichiers.
 * @returns {Promise<Uint8Array>}
 */
export async function lire(node) {
  const contenu = await dav().getFileContents(cheminDe(node), { format: 'binary' })
  return new Uint8Array(contenu)
}

/**
 * Trouve un nom libre à côté de l'original.
 *   contrat.pdf → contrat-redacted.pdf
 *   s'il existe  → contrat-redacted (2).pdf, puis (3)…
 *
 * On n'écrase jamais : une version caviardée antérieure peut avoir été
 * vérifiée et transmise. La remplacer en silence effacerait la seule trace de
 * ce qui a réellement été envoyé.
 */
async function nomLibre(node, suffixe) {
  const base = node.basename.replace(/\.pdf$/i, '')
  for (let n = 1; n < 100; n++) {
    const nom = n === 1 ? `${base}${suffixe}.pdf` : `${base}${suffixe} (${n}).pdf`
    const chemin = joindre(node.root, node.dirname, nom)
    if (!(await dav().exists(chemin))) return { nom, chemin }
  }
  throw new Error(L('Trop de versions caviardées portent déjà ce nom.', 'Too many redacted versions already carry this name.'))
}

/**
 * Écrit le PDF caviardé à côté de l'original, puis l'affiche dans Fichiers.
 * @returns {Promise<{nom: string, chemin: string}>}
 */
export async function ecrire(node, octets, suffixe = '-redacted') {
  const { nom, chemin } = await nomLibre(node, suffixe)

  /* overwrite: false est une seconde garde : si un fichier du même nom
     apparaît entre la vérification et l'écriture — un autre onglet, un client
     de synchronisation —, le serveur refuse au lieu d'écraser. */
  await dav().putFileContents(chemin, enTampon(octets), {
    overwrite: false,
    contentLength: octets.byteLength,
    headers: { 'Content-Type': 'application/pdf' },
  })

  /* Relecture de ce qui vient d'être écrit. Un fichier nommé « .pdf » qui ne
     serait pas, octet pour octet, le PDF produit ne doit pas rester à côté de
     l'original sous l'apparence d'une version caviardée : on le retire et on
     le dit. */
  const relu = new Uint8Array(await dav().getFileContents(chemin, { format: 'binary' }))
  if (!estPdf(relu) || !memesOctets(relu, octets)) {
    try { await dav().deleteFile(chemin) } catch (e) {
      console.warn('[Toolocal Redact] Fichier non conforme, retrait impossible :', e)
    }
    throw new Error(L('Le fichier enregistré ne correspond pas au PDF produit. Il a été retiré.', 'The file saved does not match the PDF produced. It has been removed.'))
  }

  /* Faire apparaître le fichier dans la vue sans recharger la page.
     On relit ses propriétés pour construire un vrai nœud : l'application
     Fichiers n'affiche que ce qu'elle reçoit sous cette forme.

     Un échec ici n'annule pas l'enregistrement, qui a réussi. On le signale
     en console, et l'utilisateur verra le fichier au prochain rafraîchissement. */
  try {
    const stat = await dav().stat(chemin, { details: true, data: getDefaultPropfind() })
    emit('files:node:created', resultToNode(stat.data))
  } catch (e) {
    console.warn('[Toolocal Redact] Fichier enregistré, affichage non rafraîchi :', e)
  }

  return { nom, chemin }
}

/**
 * Message lisible pour l'utilisateur, selon l'erreur du serveur.
 * Un « HTTP 412 » ne dit rien à un juriste ; « un fichier porte déjà ce nom »,
 * si.
 */
export function messageErreur(e) {
  const statut = e?.status ?? e?.response?.status
  switch (statut) {
    case 401: return L('Session expirée. Rechargez la page, puis recommencez.', 'Session expired. Reload the page, then try again.')
    case 403: return L('Vous n’avez pas le droit d’écrire dans ce dossier.', 'You are not allowed to write in this folder.')
    case 404: return L('Le document d’origine est introuvable. A-t-il été déplacé ?', 'The original document cannot be found. Has it been moved?')
    case 412: return L('Un fichier porte déjà ce nom. Relancez : un autre nom sera choisi.', 'A file already has this name. Try again: another name will be chosen.')
    case 507: return L('Quota de stockage atteint. Libérez de l’espace, puis recommencez.', 'Storage quota reached. Free some space, then try again.')
    default:  return L(`L’enregistrement a échoué${statut ? ` (code ${statut})` : ''}. `, `Saving failed${statut ? ` (code ${statut})` : ''}. `)
                   + L('Le document d’origine n’a pas été modifié.', 'The original document was not changed.')
  }
}
