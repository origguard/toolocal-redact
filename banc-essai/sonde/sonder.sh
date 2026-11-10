#!/usr/bin/env bash
# Sonde de bout en bout du dialogue de caviardage, dans un vrai Chromium.
#
#   bash banc-essai/sonde/sonder.sh <port> <light|dark> [appliquer]
#   SONDE_LOCALE=en-US bash … pour un navigateur en anglais (défaut : fr-FR)
#
# À lancer dans le Codespace, le banc monté (banc-essai/monter.sh). Elle relève
# ce que le dialogue affiche réellement : limites présentes et visibles,
# contraste de chaque texte, haut de page atteignable, bouton bloqué tant que
# la relecture n'est pas confirmée ; avec « appliquer », elle caviarde et
# rend le message de fin et le nom du fichier créé. Captures dans /tmp/sonde.
#
# Elle ne remplace pas l'essai à la main : elle ne juge pas un document réel.
# Le mot de passe d'essai est lu dans banc-essai/.env et n'est jamais affiché.
set -euo pipefail
ICI="$(cd "$(dirname "$0")" && pwd)"
BANC="$(cd "$ICI/.." && pwd)"
[ $# -ge 2 ] || { echo "usage : sonder.sh <port> <light|dark> [appliquer]" >&2; exit 2; }
[ -f "$BANC/.env" ] || { echo "banc-essai/.env absent : lance d'abord banc-essai/monter.sh" >&2; exit 1; }
NOM="${CODESPACE_NAME:-${NOM_CODESPACE:-}}"
[ -n "$NOM" ] || { echo "Nom du Codespace inconnu : exporte NOM_CODESPACE=<nom> (gh codespace list)." >&2; exit 1; }
IMAGE=mcr.microsoft.com/playwright:v1.49.1-noble
mkdir -p /tmp/sonde
cp "$ICI/sonde.mjs" /tmp/sonde/sonde.mjs
[ -d /tmp/sonde/node_modules/playwright ] || docker run --rm -v /tmp/sonde:/w -w /w "$IMAGE" \
  sh -c 'npm init -y >/dev/null && npm i playwright@1.49.1 >/dev/null 2>&1'
docker run --rm --network host \
  -e CODESPACE_NAME="$NOM" -e GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev \
  -e SONDE_LOCALE="${SONDE_LOCALE:-fr-FR}" \
  -v /tmp/sonde:/tmp/sonde -v "$BANC/.env:/workspaces/toolocal-redact/banc-essai/.env:ro" \
  -w /tmp/sonde "$IMAGE" node sonde.mjs "$@"
