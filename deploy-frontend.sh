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
API_HEALTH="https://nka-bulletin.glocal-innov.com/api/health"

SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no \
          -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20)

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m    %s\033[0m\n' "$*"; exit 1; }

# --- 1. Dépendances ----------------------------------------------------------
say "1/6  Dépendances (npm install)"
cd "$FRONTEND"
if [ ! -d node_modules ]; then
  npm install || fail "npm install a échoué"
else
  ok "node_modules déjà présent, installation ignorée"
fi

# --- 2. Build ----------------------------------------------------------------
say "2/6  Build du frontend (node build.mjs)"
node build.mjs || fail "Le build a échoué"

# --- 3. Upload des fichiers --------------------------------------------------
say "3/6  Upload vers $SSH_USER@$SSH_HOST:$REMOTE_WEBROOT"
scp "${SSH_OPTS[@]}" -r dist/index.html dist/sworker.js dist/manifest.json \
    dist/css dist/js dist/icons "$SSH_USER@$SSH_HOST:$REMOTE_WEBROOT/" \
    || fail "scp des fichiers a échoué"
ok "index.html, sworker.js, manifest.json, css/, js/, icons/ envoyés"

# --- 3 bis. Sauvegarde du .htaccess distant (garde-fou rollback) --------------
say "3bis/6  Sauvegarde du .htaccess distant courant"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" \
    "cp $REMOTE_WEBROOT/.htaccess $REMOTE_WEBROOT/.htaccess.bak-deploy-\$(date +%s) 2>/dev/null \
     && ls -t $REMOTE_WEBROOT/.htaccess.bak-deploy-* | head -1" \
    || ok "Pas de .htaccess distant existant à sauvegarder"

# --- 4. Upload du .htaccess --------------------------------------------------
say "4/6  Upload du .htaccess"
scp "${SSH_OPTS[@]}" .htaccess "$SSH_USER@$SSH_HOST:$REMOTE_WEBROOT/.htaccess" \
    || fail "scp du .htaccess a échoué"
ok ".htaccess envoyé"

# --- 5. Vérification HTTP ----------------------------------------------------
say "5/6  Vérification des headers HTTP"

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

# --- 6. Vérification du backend /api (garde-fou critical) ---------------------
# Le .htaccess porte le routage Passenger. Si /api/health ne répond plus 200,
# on restaure immédiatement le .htaccess précédent et on échoue le déploiement.
say "6/6  Vérification du backend ($API_HEALTH)"
BACKUP_LATEST="$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" \
  "ls -t $REMOTE_WEBROOT/.htaccess.bak-deploy-* 2>/dev/null | head -1" || true)"
bs_code=$(curl -s -o /tmp/nka-api-health.json -w '%{http_code}' --max-time 40 "$API_HEALTH")
if [ "$bs_code" = "200" ] && grep -q '"ok":true' /tmp/nka-api-health.json; then
  ok "Backend OK — /api/health → ${bs_code}"
else
  echo ""
  echo "    BACKEND KO après déploiement (HTTP ${bs_code}) — restauration du .htaccess précédent..."
  BACKUP_LATEST="$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" \
    "ls -t $REMOTE_WEBROOT/.htaccess.bak-deploy-* 2>/dev/null | head -1" || true)"
  if [ -n "$BACKUP_LATEST" ]; then
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" \
      "cp -f $BACKUP_LATEST $REMOTE_WEBROOT/.htaccess" && ok ".htaccess restauré ($BACKUP_LATEST)"
  else
    echo "  Aucun backup trouvé — restauration manuelle requise"
  fi
  fail "Backend KO (${bs_code}) après déploiement — .htaccess restauré"
fi

ok "Déploiement terminé avec succès (frontend + backend /api OK)"