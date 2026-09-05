/**
 * Action « Caviarder » sur les PDF dans l'app Fichiers.
 *
 * ⚠ Les API front de Nextcloud évoluent d'une version majeure à l'autre.
 *    Vérifie `registerFileAction` / `FileAction` contre la documentation de ta
 *    version cible avant de coder. C'est le premier endroit où ce squelette
 *    se périme.
 */
import { registerFileAction, FileAction, Permission } from '@nextcloud/files'
import { translate as t } from '@nextcloud/l10n'
import { openRedactor } from './redact-view.js'
import redactSvg from '../img/redact.svg?raw'

registerFileAction(new FileAction({
  id: 'toolocal-redact',
  displayName: () => t('toolocal_redact', 'Redact'),
  iconSvgInline: () => redactSvg,

  // PDF uniquement, et seulement si l'utilisateur peut réécrire le fichier :
  // proposer une action qui échouera à l'enregistrement est une mauvaise action.
  enabled: (files) =>
    files.length === 1 &&
    files[0].mime === 'application/pdf' &&
    Boolean(files[0].permissions & Permission.UPDATE),

  async exec(file) {
    await openRedactor(file)
    return null            // pas de rechargement : la vue gère l'enregistrement
  },
}))
