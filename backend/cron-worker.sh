#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:/opt/alt/alt-nodejs22/root/usr/bin:/usr/local/bin:$PATH"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "node introuvable dans le PATH cron" >&2
  exit 1
fi
mkdir -p "$ROOT/tmp" "$ROOT/logs"
cd "$ROOT"

# Un seul worker à la fois : un scan peut durer plusieurs minutes.
# Le cron suivant quitte immédiatement si le précédent est encore actif.
if command -v flock >/dev/null 2>&1; then
  flock -n "$ROOT/tmp/worker-once.lock" \
    env NODE_ENV=production "$NODE_BIN" "$ROOT/worker-once.js" >> "$ROOT/logs/worker-cron.log" 2>&1 || true
else
  # o2switch fournit normalement flock ; ce repli évite un échec brutal si absent.
  if [ -e "$ROOT/tmp/worker-once.pid" ] && kill -0 "$(cat "$ROOT/tmp/worker-once.pid")" 2>/dev/null; then
    exit 0
  fi
  echo $$ > "$ROOT/tmp/worker-once.pid"
  trap 'rm -f "$ROOT/tmp/worker-once.pid"' EXIT
  NODE_ENV=production "$NODE_BIN" "$ROOT/worker-once.js" >> "$ROOT/logs/worker-cron.log" 2>&1
fi
