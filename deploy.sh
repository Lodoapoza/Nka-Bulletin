#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Déploiement du backend Nka Bulletin sur o2switch (Passenger)
#
# Usage :  ./deploy.sh
# Prerequis :
#   - Cle SSH privee : ~/.ssh/id_rsa_o2switch (sans passphrase)
#   - IP du poste en liste blanche SSH dans cPanel > Autorisation SSH
#     (outil en self-service, effective en ~20 s)
#
# Pipeline :  rsync source -> rebuild better-sqlite3 (gcc-toolset-14) -> restart -> health
# =============================================================================
set -euo pipefail

# --- Configuration -----------------------------------------------------------
LOCAL_BACKEND="/Users/louissamake/Documents/Nka Bulletin/backend"
SSH_HOST="prune.o2switch.net"
SSH_USER="sc3sidaou"
SSH_KEY="$HOME/.ssh/id_rsa_o2switch"
REMOTE_ROOT="/home2/sc3sidaou/nka-bulletin.glocal-innov.com/nka-bulletin"
REMOTE_BACKEND="$REMOTE_ROOT/backend"
HEALTH_URL="https://nka-bulletin.glocal-innov.com/api/health"

SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no \
          -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 -o ServerAliveInterval=15)

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m    %s\033[0m\n' "$*"; exit 1; }

# --- 1. Connexion SSH --------------------------------------------------------
say "1/5  Connexion SSH  ($SSH_USER@$SSH_HOST)"
if ! ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" 'echo SSH_OK' >/dev/null 2>&1; then
  fail "SSH KO. Verifier :
   1) la cle existe : $SSH_KEY
   2) votre IP est en liste blanche : cPanel > Autorisation SSH > Ajouter (port 22)"
fi
ok "Connexion OK"

# --- 2. Upload du backend (sans node_modules ni fichiers serveur) -----------
say "2/5  Upload backend via rsync"
if ! rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude 'node_modules' \
  --exclude 'data/' \
  --exclude 'storage/' \
  --exclude 'public/' \
  --exclude 'build/' \
  --exclude 'tmp/' \
  --exclude 'logs/' \
  --exclude '.env' \
  --exclude '.htaccess' \
  "$LOCAL_BACKEND/" "$SSH_USER@$SSH_HOST:$REMOTE_BACKEND/"; then
  fail "rsync en erreur"
fi
ok "Upload terminé"

# --- 3. Build distant (module natif better-sqlite3) --------------------------
say "3/5  Rebuild du module natif (gcc-toolset-14 + python 3.12)"
if ! ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" 'bash -s' << REMOTE
set -e
cd "$REMOTE_BACKEND"
source /opt/rh/gcc-toolset-14/enable 2>/dev/null || true
export PYTHON=/opt/alt/python312/bin/python3.12
export npm_config_build_from_source=true
npm install --no-audit --no-fund >/dev/null 2>&1 || true
npm rebuild better-sqlite3 --build-from-source
node -e "require('better-sqlite3'); console.log('SQLITE OK')"
REMOTE
then
  fail "Build en erreur — voir la sortie ci-dessus"
fi
ok "Module natif rebuild et vérifié (SQLITE OK)"

# --- 4. Redémarrage Passenger ------------------------------------------------
say "4/5  Redémarrage Passenger"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "mkdir -p '$REMOTE_BACKEND/tmp' && touch '$REMOTE_BACKEND/tmp/restart.txt'"
ok "Restart demandé"

# --- 5. Vérification ---------------------------------------------------------
say "5/5  Vérification $HEALTH_URL"
sleep 5
code=$(curl -s -o /tmp/nka-health.json -w '%{http_code}' --max-time 40 "$HEALTH_URL")
if [ "$code" = "200" ] && grep -q '"ok":true' /tmp/nka-health.json; then
  ok "BACKEND OPÉRATIONNEL  (HTTP $code)"
  grep -o '"uptime":[0-9]*,"memory"[^}]*' /tmp/nka-health.json || true
else
  fail "Health KO (HTTP $code) — réponse : $(cat /tmp/nka-health.json 2>/dev/null)"
fi

echo
ok "Déploiement terminé."
