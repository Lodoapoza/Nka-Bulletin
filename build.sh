#!/bin/bash
set -e

echo "=== Nka Bulletin - Build APK ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js requis"; exit 1; }
command -v java >/dev/null 2>&1 || { echo "Java 17+ requis"; exit 1; }
[ -n "$ANDROID_HOME" ] || { echo "ANDROID_HOME doit être défini"; exit 1; }

cd app

echo "→ Installation des dépendances..."
npm ci

echo "→ Build des assets web..."
rm -rf dist
mkdir -p dist
cp -r index.html css/ js/ pages/ assets/ dist/

echo "→ Sync Capacitor..."
npx cap sync android

echo "→ Build APK..."
cd android
./gradlew assembleDebug

echo ""
echo "✅ APK généré : app/android/app/build/outputs/apk/debug/app-debug.apk"
