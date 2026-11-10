#!/usr/bin/env bash
# =============================================================================
#  monter.sh — monte Nextcloud 33, 34 et 35 et y installe Toolocal Redact
# -----------------------------------------------------------------------------
#  Dans un Codespace, ce script se lance tout seul au démarrage. À la main :
#
#      bash banc-essai/monter.sh                 monte les trois instances
#      bash banc-essai/monter.sh --sans-docker   contrôle seulement le contenu
#
#  Il refuse d'avancer à la moindre incohérence : un essai mené sur une
#  instance mal installée donnerait une trace fausse, et une trace fausse est
#  pire qu'une trace absente.
#
#  Ce qu'il fait, dans l'ordre :
#    1. assemble l'application depuis le dépôt, fichier par fichier, et exige
#       que chacun ait l'empreinte SHA-256 relevée dans l'archive signée
#    2. démarre les trois conteneurs
#    3. attend la fin de l'installation de chaque instance
#    4. active l'application, puis vérifie que chaque instance SERT bien les
#       octets de l'archive
#    5. écrit trace-instances.txt et affiche les trois adresses
#
#  Tout arrêter sans rien perdre :   docker compose stop     (dans banc-essai/)
#  Tout effacer, volumes compris :   docker compose down -v
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"
RACINE="$(cd .. && pwd)"
MANIFESTE="contenu-archive.txt"
APP="app/toolocal_redact"
TRACE="trace-instances.txt"
SERVICES="nc33:8033:33 nc34:8034:34 nc35:8035:35"
SCRIPT_JS="js/toolocal_redact-main.js"

etape() { printf '\n\033[36m[%s] %s\033[0m\n' "$1" "$2"; }
bien()  { printf '    \033[32mOK\033[0m  %s\n' "$1"; }
mal()   { printf '    \033[31m!!\033[0m  %s\n' "$1" >&2; }
occ()   { local s="$1"; shift; docker compose exec -T -u www-data "$s" php occ "$@"; }

# ------------------------------------------------ 1. assemblage et contrôle
etape 1 "Assemblage de l'application et contrôle des empreintes"
[ -f "$MANIFESTE" ] || { mal "$MANIFESTE introuvable. Il est écrit par : npm run package"; exit 1; }
VERSION="$(sed -n 's/^# version: //p' "$MANIFESTE")"
ARCHIVE_SHA="$(sed -n 's/^# archive-sha256: //p' "$MANIFESTE")"
[ -n "$VERSION" ] && [ -n "$ARCHIVE_SHA" ] || { mal "En-tête de $MANIFESTE illisible."; exit 1; }
NB="$(grep -vc '^#' "$MANIFESTE" || true)"
[ "$NB" -gt 0 ] || { mal "$MANIFESTE ne liste aucun fichier."; exit 1; }

# Le dossier est vidé, jamais supprimé : il est monté dans les conteneurs, et
# le supprimer laisserait un montage vide tant que ceux-ci tournent.
mkdir -p "$APP"
find "$APP" -mindepth 1 -delete
mkdir -p "$APP"
grep -v '^#' "$MANIFESTE" | while read -r _ chemin; do
  [ -f "$RACINE/$chemin" ] || { mal "Fichier de l'archive absent du dépôt : $chemin"; exit 1; }
  mkdir -p "$APP/$(dirname "$chemin")"
  cp "$RACINE/$chemin" "$APP/$chemin"
done
if ! ( cd "$APP" && grep -v '^#' "../../$MANIFESTE" | sha256sum --check --quiet ); then
  mal "Au moins un fichier du dépôt n'a pas l'empreinte relevée dans l'archive signée."
  mal "Ce que tu essaierais ne serait pas ce qui sera téléversé : arrêt."
  exit 1
fi
grep -q "<version>$VERSION</version>" "$APP/appinfo/info.xml" \
  || { mal "Le manifeste de l'application n'annonce pas $VERSION."; exit 1; }
BORNES="$(sed -n 's/.*min-version="\([0-9]*\)" *max-version="\([0-9]*\)".*/\1 à \2/p' "$APP/appinfo/info.xml")"
[ -n "$BORNES" ] || { mal "Bornes de compatibilité illisibles dans info.xml."; exit 1; }
bien "$NB fichiers, tous identiques à ceux de l'archive $VERSION (${ARCHIVE_SHA:0:16}…)"
bien "compatibilité déclarée : Nextcloud $BORNES"

if [ "${1:-}" = "--sans-docker" ]; then
  printf '\n    Contrôle du contenu terminé, aucun conteneur démarré.\n\n'
  exit 0
fi

# -------------------------------------------------------------- 2. Docker
etape 2 "Démarrage des trois instances"
for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
docker info >/dev/null 2>&1 || { mal "Le démon Docker ne répond pas."; exit 1; }

if [ ! -f .env ]; then
  ( umask 077; printf 'NC_ADMIN_USER=essai\nNC_ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 16)" > .env )
  bien "identifiants d'essai générés dans banc-essai/.env (jamais commités)"
fi
docker compose up -d || { mal "docker compose a échoué (image 33, 34 ou 35 indisponible ?)"; exit 1; }
bien "conteneurs lancés"

# ------------------------------------------------- 3. fin d'installation
etape 3 "Attente de la fin d'installation (premier démarrage : plusieurs minutes)"
for s in $SERVICES; do
  nom="${s%%:*}"; pret=0
  for _ in $(seq 1 90); do
    if occ "$nom" status --output=json 2>/dev/null | grep -q '"installed":true'; then pret=1; break; fi
    sleep 10
  done
  [ "$pret" = 1 ] || { mal "$nom n'a pas fini en 15 minutes. Journaux : docker compose logs $nom"; exit 1; }
  bien "$nom installée"
done

# ------------------------------------------------ 4. activation et service
etape 4 "Activation, puis contrôle de ce que chaque instance sert réellement"
ATTENDU_JS="$(grep -v '^#' "$MANIFESTE" | awk -v f="$SCRIPT_JS" '$2==f{print $1}')"
[ -n "$ATTENDU_JS" ] || { mal "$SCRIPT_JS absent de $MANIFESTE."; exit 1; }
{
  echo "Banc d'essai Toolocal Redact — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit           : $(git -C "$RACINE" rev-parse HEAD 2>/dev/null || echo inconnu)"
  echo "version          : $VERSION"
  echo "archive signée   : sha256 $ARCHIVE_SHA"
  echo "contenu essayé   : $NB fichiers, empreintes identiques à celles de l'archive"
  echo "compatibilité    : Nextcloud $BORNES (appinfo/info.xml)"
  echo
} > "$TRACE"

echecs=0
for s in $SERVICES; do
  nom="${s%%:*}"; reste="${s#*:}"; port="${reste%%:*}"; majeure="${reste##*:}"

  # Dans un Codespace, l'instance est atteinte par une adresse en https qui
  # n'est pas localhost : sans ces réglages, Nextcloud refuse le domaine ou
  # fabrique des liens en http.
  if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    hote="${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    adresse="https://$hote"
    occ "$nom" config:system:set trusted_domains 2 --value="$hote" >/dev/null
    occ "$nom" config:system:set overwritehost --value="$hote" >/dev/null
    occ "$nom" config:system:set overwriteprotocol --value=https >/dev/null
    occ "$nom" config:system:set overwrite.cli.url --value="$adresse" >/dev/null
  else
    adresse="http://localhost:$port"
  fi

  reelle="$(occ "$nom" status --output=json 2>/dev/null | sed -n 's/.*"versionstring":"\([^"]*\)".*/\1/p')"
  sortie="$(occ "$nom" app:enable toolocal_redact 2>&1 || true)"
  active="$(occ "$nom" config:app:get toolocal_redact enabled 2>/dev/null || true)"
  installee="$(occ "$nom" config:app:get toolocal_redact installed_version 2>/dev/null || true)"
  servi="$(curl -fsS -m 30 -H 'Host: localhost' "http://127.0.0.1:$port/custom_apps/toolocal_redact/$SCRIPT_JS" 2>/dev/null | sha256sum | cut -c1-64 || true)"

  ok=1
  [ "${reelle%%.*}" = "$majeure" ] || { ok=0; mal "$nom : version réelle « $reelle », attendue $majeure.x"; }
  [ "$active" = "yes" ]            || { ok=0; mal "$nom : application non activée — $sortie"; }
  [ "$installee" = "$VERSION" ]    || { ok=0; mal "$nom : version installée « $installee », attendue $VERSION"; }
  [ "$servi" = "$ATTENDU_JS" ]     || { ok=0; mal "$nom : le script servi n'a pas l'empreinte de l'archive"; }

  if [ "$ok" = 1 ]; then
    bien "Nextcloud $reelle : application $installee activée, script servi conforme"
    verdict="CONFORME"
  else
    echecs=$((echecs + 1)); verdict="ÉCHEC"
  fi
  {
    echo "Nextcloud $majeure"
    echo "  version réelle       : ${reelle:-illisible}"
    echo "  application activée  : ${active:-non}  (version ${installee:-aucune})"
    echo "  script servi sha256  : ${servi:-illisible}"
    echo "  attendu              : $ATTENDU_JS"
    echo "  installation         : $verdict"
    echo "  adresse              : $adresse"
    echo
  } >> "$TRACE"
done

{
  echo "Cette trace ne couvre que l'installation. Le fonctionnement du caviardage"
  echo "reste à constater à la main sur chaque instance."
} >> "$TRACE"

# ---------------------------------------------------------- 5. récapitulatif
etape 5 "Résultat"
echo
cat "$TRACE"
echo
if [ "$echecs" -gt 0 ]; then
  mal "$echecs instance(s) en échec : la trace le dit, ne la présente pas comme un succès."
  exit 1
fi
printf '    Identifiant : %s   —   mot de passe : dans banc-essai/.env\n' "$(sed -n 's/^NC_ADMIN_USER=//p' .env)"
printf '    Trace écrite : banc-essai/%s\n\n' "$TRACE"
