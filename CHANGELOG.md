# Changelog

## 0.2.1 — 2026-09-10
- Conformité officielle avec l'API @nextcloud/files v4 (Nextcloud 33 et 34).
- Utilisation de la signature d'action déstructurée `exec({ nodes, view })`.
- Conditionnement de l'action à `Permission.WRITE` (droit d'écriture effectif sur le fichier).
- Caviardage local destructif exécuté à 100% dans le navigateur via WebDAV local.
- Zéro sous-traitant, zéro requête externe : vérifié par `local-guard.mjs`.
