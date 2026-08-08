#!/usr/bin/env bash
# =============================================================================
# deploy-frontend.sh — Build + déploiement du frontend Nka Bulletin (o2switch)
#
# Usage :  ./deploy-frontend.sh
# Prerequis :
#   - Cle SSH privee : ~/.ssh/id_rsa_o2switch (sans passphrase)
#   - IP du poste en liste blanche SSH dans cPanel > Autorisation SSH
#
# Pipeline : npm install (si besoin) -> node build.mjs -> scp dist/ -> .htaccess
#            -> verification des headers HTTP (compression + cache)
# =============================================================================
set -euo pipefail

# --- Configuration -----------------------------------------------------------
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$PROJECT_ROOT/frontend"
SSH_HOST="prune.o2switch.net"
SSH_USER="sc3sidaou"
SSH_KEY="$HOME/.ssh/id_rsa_o2switch"
REMOTE_WEBROOT="/home2/sc3sidaou/nka-bulletin.glocal-innov.com"
BASE_URL="https://nka-bulletin.glocal-innov.com"

SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no \
          -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20)

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m    %s\033[0m\n' "$*"; exit 1; }

# --- 1. Dépendances ----------------------------------------------------------
say "1/5  Dépendances (npm install)"
cd "$FRONTEND"
if [ ! -d node_modules ]; then
  npm install || fail "npm install a échoué"
else
  ok "node_modules déjà présent, installation ignorée"
fi

# --- 2. Build ----------------------------------------------------------------
say "2/5  Build du frontend (node build.mjs)"
node build.mjs || fail "Le build a échoué"

# --- 3. Upload des fichiers --------------------------------------------------
say "3/5  Upload vers $SSH_USER@$SSH_HOST:$REMOTE_WEBROOT"
scp "${SSH_OPTS[@]}" -r dist/index.html dist/sworker.js dist/manifest.json \
    dist/css dist/js dist/icons "$SSH_USER@$SSH_HOST:$REMOTE_WEBROOT/" \
    || fail "scp des fichiers a échoué"
ok "index.html, sworker.js, manifest.json, css/, js/, icons/ envoyés"

# --- 4. Upload du .htaccess --------------------------------------------------
say "4/5  Upload du .htaccess"
scp "${SSH_OPTS[@]}" .htaccess "$SSH_USER@$SSH_HOST:$REMOTE_WEBROOT/.htaccess" \
    || fail "scp du .htaccess a échoué"
ok ".htaccess envoyé"

# --- 5. Vérification HTTP ----------------------------------------------------
say "5/5  Vérification des headers HTTP"

CSS_HASH="$(grep -o 'css/app\.css?v=[0-9a-f]\{8\}' dist/index.html | head -1 | cut -d= -f2)"
[ -n "$CSS_HASH" ] || fail "Hash CSS introuvable dans dist/index.html"

check_headers() {
  local url="$1" label="$2"
  printf '\n    --- %s ---\n' "$label"
  curl -sI --max-time 20 "$url" \
    | grep -iE '^(HTTP/|content-type|content-encoding|cache-control|expires)' \
    || fail "Headers introuvables pour $url"
}

check_headers "$BASE_URL/index.html" "index.html"
check_headers "$BASE_URL/css/app.css?v=$CSS_HASH" "css/app.css (hash $CSS_HASH)"
check_headers "$BASE_URL/sworker.js" "sworker.js"

ok "Déploiement terminé avec succès"