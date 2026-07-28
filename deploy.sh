#!/usr/bin/env bash
USER="sc3sidaou"
HOST="prune.o2switch.net"
WEBROOT="/home/$USER/public_html"
BACKEND_PATH="/home/$USER/backends/nka-bulletin"
DOMAIN="nka-bulletin.glocal-innov.com"

cd "/Users/louissamake/Documents/Nka Bulletin"

echo "📦 Création des archives..."
tar czf /tmp/nka-frontend.tar.gz -C frontend .
tar czf /tmp/nka-backend.tar.gz -C backend .

echo "📤 Envoi des archives sur le serveur..."
scp /tmp/nka-frontend.tar.gz "$USER@$HOST:$WEBROOT/../"
scp /tmp/nka-backend.tar.gz "$USER@$HOST:/tmp/"

echo "📁 Extraction sur le serveur..."
ssh "$USER@$HOST" "mkdir -p $WEBROOT && tar xzf $WEBROOT/../nka-frontend.tar.gz -C $WEBROOT && rm -f $WEBROOT/../nka-frontend.tar.gz"
ssh "$USER@$HOST" "mkdir -p $BACKEND_PATH && tar xzf /tmp/nka-backend.tar.gz -C $BACKEND_PATH && rm -f /tmp/nka-backend.tar.gz"

echo "🚀 Installation des dépendances Node..."
ssh "$USER@$HOST" "cd $BACKEND_PATH && npm install --omit=dev"

echo "🔄 Démarrage du backend..."
ssh "$USER@$HOST" "cd $BACKEND_PATH && pm2 restart nka-bulletin 2>/dev/null || pm2 start server.js --name nka-bulletin"

echo "✅ Déploiement terminé ! Rendez-vous sur https://$DOMAIN"
