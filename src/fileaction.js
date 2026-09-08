/**
 * Action « Caviarder » sur les PDF dans l'app Fichiers Nextcloud.
 *
 * Compatible Nextcloud Hub 30 à 38.
 * Supporte à la fois les nouvelles interfaces @nextcloud/files et les fallbacks legacy.
 */
import { registerFileAction, FileAction, Permission } from '@nextcloud/files'
import { translate as t } from '@nextcloud/l10n'
import { openRedactor } from './redact-view.js'
import redactSvg from '../img/redact.svg?raw'

const actionConfig = {
  id: 'toolocal-redact',
  displayName: () => t('toolocal_redact', 'Redact'),
  iconSvgInline: () => redactSvg,

  // Détection PDF universelle (mime ou extension) avec droit d'écriture si disponible
  enabled: (files) => {
    const list = Array.isArray(files) ? files : (files?.nodes ? files.nodes : [files])
    if (!list || list.length !== 1 || !list[0]) return false
    const node = list[0]

    const mime = node.mime || ''
    const name = (node.basename || node.name || '').toLowerCase()
    const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')

    // Si les permissions sont définies, vérifier le droit UPDATE
    const hasPermission = typeof node.permissions === 'number'
      ? Boolean(node.permissions & Permission.UPDATE)
      : true

    return isPdf && hasPermission
  },

  async exec(file, view, dir) {
    const targetNode = file?.nodes ? file.nodes[0] : (Array.isArray(file) ? file[0] : file)
    if (!targetNode) return null
    await openRedactor(targetNode, view)
    return null
  },
}

try {
  registerFileAction(new FileAction(actionConfig))
} catch (e) {
  console.warn('[Toolocal Redact] Standard registerFileAction failed, trying window registry fallback:', e)
  if (typeof window !== 'undefined') {
    window._nc_fileactions = window._nc_fileactions || []
    if (!window._nc_fileactions.some((a) => a.id === actionConfig.id)) {
      window._nc_fileactions.push(new FileAction(actionConfig))
    }
  }
}

// Support fallback pour les environnements legacy Nextcloud si OCA.Files est présent
if (typeof window !== 'undefined' && window.OCA && window.OCA.Files && window.OCA.Files.fileActions && typeof window.OCA.Files.fileActions.registerAction === 'function') {
  try {
    window.OCA.Files.fileActions.registerAction({
      name: 'toolocal-redact',
      displayName: t('toolocal_redact', 'Redact'),
      mime: 'application/pdf',
      permissions: Permission.UPDATE,
      icon: '',
      actionHandler(fileName, context) {
        const fileInfo = context?.fileInfo || { name: fileName, dir: context?.dir }
        openRedactor(fileInfo, context?.fileList)
      },
    })
  } catch (err) {
    // Non bloquant
  }
}
