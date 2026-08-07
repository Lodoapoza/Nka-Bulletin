# Design — Reset complet de l'appareil (PIN oublié)

Date : 2026-08-07
Statut : Validé par l'utilisateur

## Contexte

Le PIN est un verrou 100 % local (localStorage `nka_pin_record`, PBKDF2-SHA-256, 150 000 itérations), sans lien avec les données serveur (liées au `device_id`). Aucun mécanisme de récupération n'existe : un utilisateur qui oublie son PIN est bloqué.

Décisions utilisateur :
- **Reset complet de l'appareil** (approche B) : purge serveur + purge locale, l'app repart comme une installation neuve.
- **IMAP** : inchangé (presets Gmail/Yahoo/Outlook déjà pré-remplis, host/port non saisis par l'utilisateur).
- **Emplacement** : lien « PIN oublié ? » sur l'écran de verrouillage PIN **et** bouton « Réinitialiser l'appareil » dans les Réglages.

## Architecture

### 1. Backend — route `DELETE /api/device`

Nouveau fichier `backend/src/routes/device.js` :
- `DELETE /api/device`, protégée par `authMiddleware` (JWT → `req.deviceId`).
- Supprime en transaction SQLite : comptes mail (`accounts`), bulletins (`bulletins`), settings (`settings`), push subscriptions (`push_subscriptions`), puis le device (`devices`).
- Réponse `{ ok: true }` ; idempotent (404 si device inconnu).
- Montage dans `backend/server.js` : `app.use('/api', deviceRoutes)`.

### 2. Frontend — module reset

Nouveau `frontend/js/reset.js` :
- `resetDevice()` :
  1. `DELETE /api/device` avec le token courant — **best-effort** : en cas d'échec réseau, on continue (le reset local doit toujours fonctionner).
  2. Purge locale : `localStorage.clear()`, suppression IndexedDB `nka-offline-cache`, `caches.delete()` sur tous les caches SW (`nka-bulletin-*`).
  3. `location.reload()` → écran de création de PIN + nouvel enregistrement device.

### 3. UI — deux points d'entrée

- **Écran PIN** (`pin.js` + `index.html`) : lien « PIN oublié ? » sous le keypad, visible en mode `unlock`. Clic → modal de confirmation avec avertissement exact : « Toutes les données locales de cet appareil seront perdues (bulletins, comptes, cache). Cette action est irréversible. » → bouton « Réinitialiser » (rouge) / « Annuler ».
- **Réglages** (`settings.js`) : bouton « Réinitialiser l'appareil » (zone danger, style rouge) → même modal de confirmation.

### 4. Comportement hors-ligne

Purge serveur best-effort : si hors-ligne, elle échoue silencieusement, le reset local s'exécute quand même. Données serveur orphelines restantes — acceptable (reset d'appareil).

## Fichiers touchés

- `backend/src/routes/device.js` (nouveau)
- `backend/server.js` (montage route)
- `frontend/js/reset.js` (nouveau)
- `frontend/js/pin.js` (lien « PIN oublié ? » + modal)
- `frontend/js/settings.js` (bouton réinitialiser + modal)
- `frontend/index.html` (script reset.js, modal)
- `frontend/css/app.css` (styles modal/zone danger)

## Vérification

- `node --check` sur les fichiers modifiés.
- Test API : `DELETE /api/device` avec token valide → données supprimées en DB.
- Test UI : reset depuis l'écran PIN et depuis les Réglages → retour à l'écran de création de PIN, device_id régénéré.
- Déploiement + smoke tests HTTP + commit + push + rebuild APK.