# Nka Bulletin — PWA réelle

Application complète (frontend PWA + backend Node.js) qui synchronise automatiquement vos
bulletins de paie reçus par email, entre le 16 et le 31 de chaque mois, les archive, et permet
de les rechercher, filtrer, fusionner et partager.

**Tout le code ici est fonctionnel et réel** — pas de maquette. Il y a cependant une contrainte
incontournable : pour lire *vraiment* votre messagerie, l'application a besoin de vraies
identifiants IMAP (ou d'une app OAuth Google/Microsoft enregistrée par vous). Aucun raccourci
fictif n'est possible ici — c'est une règle de sécurité des fournisseurs de messagerie eux-mêmes.

## Comment ça marche (architecture réelle)

```
nka-bulletin/
├── backend/     → API Node.js/Express + SQLite : IMAP réel (imapflow), extraction PDF
│                  (pdf-parse), fusion PDF (pdf-lib), planification (node-cron),
│                  notifications (web-push).
└── frontend/    → PWA (HTML/CSS/JS vanilla) : verrouillage PIN local, tableau de bord,
                   gestion des comptes, recherche/filtres, export, notifications.
```

Le frontend ne parle jamais directement à Gmail/Outlook/Yahoo : c'est le backend qui se
connecte en IMAP avec les identifiants que vous fournissez, chiffrés en base (AES-256-GCM).

## 1. Installer et lancer le backend

```bash
cd backend
npm install
cp .env.example .env
```

Éditez `.env` et générez de VRAIES valeurs :

```bash
# Secret de session
openssl rand -hex 32   # → JWT_SECRET

# Secret de chiffrement des identifiants IMAP
openssl rand -hex 32   # → CRYPTO_SECRET

# Clés VAPID pour les notifications push
npx web-push generate-vapid-keys   # → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

Puis démarrez :

```bash
npm start
```

Le serveur écoute sur `http://localhost:4000` et planifie automatiquement la synchronisation
de chaque appareil dès son démarrage.

## 2. Lancer le frontend (PWA)

```bash
cd frontend
python3 -m http.server 8080
# ou : npx serve .
```

Ouvrez `http://localhost:8080`. Sur mobile Android, ouvrez cette URL dans Chrome puis
**"Ajouter à l'écran d'accueil"** pour installer la PWA en mode standalone.

> ⚠️ Les service workers (notifications, offline) exigent HTTPS en production — `localhost`
> est une exception tolérée par les navigateurs pour le développement.

Par défaut, le frontend appelle `http://localhost:4000/api`. Pour pointer vers un backend
déployé, ouvrez `frontend/js/api.js` et changez `API_BASE`, ou définissez avant les scripts :
```html
<script>window.NKA_API_BASE = 'https://votre-backend.example.com/api';</script>
```

## 3. Connecter une vraie messagerie

Dans l'onglet **Comptes**, choisissez un fournisseur et entrez un **mot de passe
d'application** (jamais votre mot de passe principal) :

- **Gmail** : compte Google → Sécurité → Validation en 2 étapes (à activer) → Mots de passe
  des applications → générez-en un pour "Nka Bulletin".
- **Yahoo Mail** : Compte → Sécurité → Générer un mot de passe d'application.
- **Outlook/Microsoft 365** : selon le tenant, un mot de passe d'application ou l'accès IMAP
  direct (`outlook.office365.com:993`) suffit ; les comptes Entra ID avec MFA strict peuvent
  nécessiter une app OAuth enregistrée dans Azure (extension possible, voir plus bas).
- **IMAP personnalisé** : hébergeur pro (OVH, o2switch, Zoho Mail, etc.) → renseignez le
  serveur IMAP et le port fournis par votre hébergeur.

Le backend teste la connexion IMAP en direct avant d'enregistrer le compte — si les
identifiants sont invalides, vous obtenez une vraie erreur, pas un faux succès.

## 4. Ce que fait vraiment la synchronisation

- Recherche les emails reçus depuis la dernière synchro (ou depuis le 1er du mois si c'est la
  première fois).
- Ne retient que les messages **reçus entre le 16 et le 31 du mois**, avec une pièce jointe PDF
  dont le sujet ou le nom contient un mot-clé de bulletin de paie (bulletin, paie, paye,
  payslip...).
- Calcule un hash (message-id + nom de fichier + taille) pour ignorer les doublons.
- Si l'option "Analyse des montants PDF" est activée, extrait le "Net à payer" par expression
  régulière (`pdf-parse`) — fonctionne sur la plupart des bulletins francophones standards ;
  les mises en page très atypiques peuvent nécessiter d'ajuster les motifs dans
  `backend/src/pdfService.js`.
- Envoie une vraie notification Web Push dès qu'un nouveau bulletin est détecté.

## 5. Étendre vers OAuth Gmail/Microsoft (optionnel)

L'authentification IMAP par mot de passe d'application fonctionne dès aujourd'hui sans
inscription préalable. Pour une expérience "Se connecter avec Google/Microsoft" (sans jamais
saisir de mot de passe), il faut enregistrer une vraie application OAuth :

- **Google** : console Google Cloud → APIs & Services → identifiants OAuth 2.0 → activer
  l'API Gmail → scope `https://www.googleapis.com/auth/gmail.readonly`.
- **Microsoft** : portail Azure → Entra ID → Enregistrements d'applications → API Microsoft
  Graph → scope `Mail.Read`.

Ce sont de vraies démarches d'inscription développeur (gratuites) que seul le propriétaire du
projet peut réaliser — il n'existe pas de contournement légitime.

## 6. Déploiement en production

- **Backend** : Render, Railway, Fly.io ou un VPS (le stockage SQLite + fichiers PDF doit être
  sur un disque persistant, pas éphémère).
- **Frontend** : Netlify, Vercel, Cloudflare Pages, ou servi par le même backend Express
  (`express.static`) pour éviter les soucis CORS.
- Pensez à activer HTTPS (obligatoire pour les Service Workers et les Web Push hors localhost).

## 7. Sécurité & vie privée

- Le code PIN est un verrou **local** (Web Crypto PBKDF2, 150 000 itérations) : il n'est ni
  envoyé, ni stocké côté serveur, conformément au cahier des charges ("aucun nouveau mot de
  passe ni compte externe").
- Les identifiants IMAP sont chiffrés en base avec AES-256-GCM (`backend/src/crypto.js`).
- Les fichiers PDF sont stockés sur disque, séparés par appareil (`storage/<deviceId>/`).
