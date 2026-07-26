# Nka Bulletin

Gestion des bulletins de paie — tout en local, chiffré, sans serveur.

## Pourquoi cette app

Tu reçois tes bulletins de paie par email. Tu les télécharges un par un, tu les ranges dans des dossiers, tu fais gaffe à pas les perdre. Et à la fin de l'année, il faut tous les rassembler pour la déclaration.

Nka Bulletin fait tout ça à ta place : il va chercher les PDF dans ta boîte mail, les trie par mois/année, et te laisse les exporter en un clic.

## Ce que ça fait

- Se connecte à Gmail, Outlook, ou n'importe quelle boîte IMAP
- Surveille automatiquement les nouveaux bulletins (entre le 16 et la fin du mois)
- Extrait les infos du PDF (nom, prénom, matricule)
- Stocke tout en local, chiffré
- Déverrouillage par empreinte/visage ou code PIN
- Moteur de recherche : tape "mars 2024" ou "Dupont"
- Fusionne plusieurs bulletins en un seul PDF ou en archive Zip
- Partage natif Android

## Pas de serveur, pas de cloud

Tout reste sur ton téléphone. Les tokens d'accès sont chiffrés avec le trousseau Android (Keystore). Les PDF sont stockés dans le dossier privé de l'app, pas dans la galerie.

## Pour faire tourner le projet

1. Ouvre le dossier dans **Android Studio**
2. Laisse Gradle télécharger les dépendances (compte ~2 minutes)
3. Lance sur un émulateur ou un appareil (min Android 7, API 24)

### Avant de compiler

**Pour Gmail :** Il faut créer un projet Google Cloud, activer l'API Gmail, et configurer un écran OAuth. Sinon la connexion Google ne marchera pas.

**Pour Outlook :** Il faut enregistrer l'app dans le portail Azure AD et remplacer le `CLIENT_ID` dans `MicrosoftAuthManager.kt` (ligne 33).

**Pour IMAP :** Il faut un mot de passe d'application (pas le mot de passe principal). La plupart des fournisseurs (Orange, Free, SFR, Yahoo) en proposent un dans les paramètres de sécurité du compte.

### Build de l'APK

```bash
# Debug (pour tester)
./gradlew :app:assembleDebug

# Release (APK signé, nécessite une keystore)
./gradlew :app:assembleRelease
```

L'APK se trouve dans `app/build/outputs/apk/`.

## Stack technique

- Kotlin, Jetpack Compose, Material 3
- Clean Architecture (data/domain/presentation)
- Room (base locale SQLite)
- Hilt (injection de dépendances)
- WorkManager (tâches planifiées)
- PdfBox-Android (PDF)
- Android Keystore + EncryptedSharedPreferences (chiffrement)

## Structure du code

```
com.nka.bulletin/
├── data/           # Accès aux données (Room, réseau, Keystore, PDF)
├── domain/         # Règles métier (modèles, interfaces, use cases)
├── presentation/   # UI Compose + ViewModels
└── di/             # Modules d'injection (Hilt)
```

## Licence

Projet privé.
