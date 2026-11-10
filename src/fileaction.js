/**
 * Action « Caviarder » sur les PDF dans l'app Fichiers Nextcloud.
 *
 * Compatible Nextcloud Hub 33 à 35.
 * Supporte à la fois les nouvelles interfaces @nextcloud/files et les fallbacks legacy.
 */
import { registerFileAction, Permission } from '@nextcloud/files'
import { translate as t } from '@nextcloud/l10n'
import { openRedactor } from './redact-view.js'
import redactSvg from '../img/redact.svg?raw'

const actionConfig = {
  id: 'toolocal-redact',
  displayName: () => t('toolocal_redact', 'Redact'),
  iconSvgInline: () => redactSvg,

  // Détection PDF universelle : vérifie que le document est un PDF lisible (Permission.READ)
  // Le refus d'écriture dans le dossier parent est traité lors de l'enregistrement WebDAV (erreur 403).
  enabled: (nodes) => {
    const list = Array.isArray(nodes) ? nodes : (nodes?.nodes ? nodes.nodes : [nodes])
    if (!list || list.length !== 1 || !list[0]) return false
    const node = list[0]

    const mime = node.mime || ''
    const name = (node.basename || node.name || '').toLowerCase()
    const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')

    const hasReadPermission = typeof node.permissions === 'number'
      ? Boolean(node.permissions & Permission.READ)
      : true

    return isPdf && hasReadPermission
  },

  /** v4 : contexte déstructuré exec({ nodes, view, folder, contents }) */
  async exec({ nodes, view }) {
    const targetNode = nodes && nodes.length > 0 ? nodes[0] : null
    if (!targetNode) return null
    await openRedactor(targetNode, view)
    return null
  },
}

try {
  registerFileAction(actionConfig)
} catch (e) {
  console.warn('[Toolocal Redact] Standard registerFileAction failed, trying window registry fallback:', e)
  if (typeof window !== 'undefined') {
    window._nc_fileactions = window._nc_fileactions || []
    if (!window._nc_fileactions.some((a) => a.id === actionConfig.id)) {
      window._nc_fileactions.push(actionConfig)
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
      permissions: Permission.READ,
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
