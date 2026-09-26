const express = require('express');
const db = require('../db');
const { encrypt, decrypt } = require('../crypto');
const { resetDeviceData } = require('./device');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://nka-bulletin.glocal-innov.com/api/auth/google/callback';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('[google-auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans .env — OAuth2 Google désactivé');
}

/**
 * GET /api/auth/google?device_id=xxx
 * Redirige vers l'écran de consentement Google.
 */
router.get('/', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'OAuth2 Google non configuré côté serveur' });
  }
  const deviceId = req.query.device_id;
  if (!deviceId) {
    return res.status(400).json({ error: 'device_id requis' });
  }
  // State = device_id signé (évite le CSRF)
  const state = Buffer.from(JSON.stringify({ deviceId, ts: Date.now() })).toString('base64url');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',        // force refresh_token
    prompt: 'consent',             // force refresh_token même si déjà autorisé
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/auth?${params}`);
});

/**
 * GET /api/auth/google/callback?code=xxx&state=xxx
 * Échange le code contre des tokens, enregistre le compte Gmail.
 */
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`/index.html?auth=error&msg=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect('/index.html?auth=error&msg=missing_params');
  }

  let deviceId;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    deviceId = decoded.deviceId;
    // Vérifier que le state n'est pas trop vieux (5 min)
    if (Date.now() - decoded.ts > 5 * 60 * 1000) {
      return res.redirect('/index.html?auth=error&msg=state_expired');
    }
  } catch (e) {
    return res.redirect('/index.html?auth=error&msg=invalid_state');
  }

  // Vérifier que le device existe
  const device = db.prepare('SELECT id FROM devices WHERE id = ?').get(deviceId);
  if (!device) {
    return res.redirect('/index.html?auth=error&msg=unknown_device');
  }

  // Échange du code contre les tokens
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('[google-auth] Token exchange failed:', tokenData);
      return res.redirect(`/index.html?auth=error&msg=${encodeURIComponent(tokenData.error_description || 'token_exchange_failed')}`);
    }

    const { access_token, refresh_token, expires_in, token_type } = tokenData;

    // Récupérer l'email de l'utilisateur via Gmail API
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.emailAddress) {
      console.error('[google-auth] Profile fetch failed:', profile);
      return res.redirect('/index.html?auth=error&msg=profile_fetch_failed');
    }

    const email = profile.emailAddress.toLowerCase();
    const expiryDate = new Date(Date.now() + expires_in * 1000).toISOString();
    const previous = db.prepare(
      "SELECT encrypted_credentials FROM accounts WHERE device_id = ? AND email = ? AND provider = 'gmail' ORDER BY id DESC LIMIT 1"
    ).get(deviceId, email);
    let previousRefreshToken = null;
    if (previous) {
      try { previousRefreshToken = JSON.parse(decrypt(previous.encrypted_credentials)).refresh_token || null; } catch (_) {}
    }

    const credentials = JSON.stringify({
      access_token,
      refresh_token: refresh_token || previousRefreshToken || null,
      token_type,
      expiry_date: expiryDate,
    });

    // Limite 3 appareils par email
    const sameEmailCount = db.prepare(
      'SELECT COUNT(DISTINCT device_id) AS n FROM accounts WHERE email = ? AND device_id != ?'
    ).get(email, deviceId);
    if (sameEmailCount.n >= 3) {
      const oldest = db.prepare(`
        SELECT d.id FROM accounts a
        JOIN devices d ON d.id = a.device_id
        WHERE a.email = ? AND a.device_id != ?
        GROUP BY d.id ORDER BY MIN(d.created_at) ASC LIMIT 1
      `).get(email, deviceId);
      if (oldest) {
        resetDeviceData(oldest.id);
      } else {
        return res.redirect('/index.html?auth=error&msg=device_limit');
      }
    }

    // Rattachement multi-appareils
    const dev = db.prepare('SELECT user_matricule FROM devices WHERE id = ?').get(deviceId);
    if (dev && !dev.user_matricule) {
      const linked = db.prepare(`
        SELECT DISTINCT d.user_matricule AS mat FROM accounts a
        JOIN devices d ON d.id = a.device_id
        WHERE a.email = ? AND d.user_matricule IS NOT NULL AND d.id != ?
        LIMIT 1
      `).get(email, deviceId);
      if (linked && linked.mat) {
        db.prepare('UPDATE devices SET user_matricule = ?, owner_matricule = COALESCE(owner_matricule, ?) WHERE id = ?')
          .run(linked.mat, linked.mat, deviceId);
      }
    }

    // Supprimer un ancien compte Gmail OAuth pour ce device (remplacement)
    db.prepare("DELETE FROM accounts WHERE device_id = ? AND email = ? AND provider = 'gmail'")
      .run(deviceId, email);

    // Insérer le compte
    const info = db.prepare(`
      INSERT INTO accounts (device_id, provider, label, email, imap_host, imap_port, imap_secure, encrypted_credentials)
      VALUES (?, 'gmail', ?, ?, 'imap.gmail.com', 993, 1, ?)
    `).run(deviceId, email, email, encrypt(credentials));

    console.log(`[google-auth] Compte Gmail OAuth ajouté: ${email} (device ${deviceId})`);

    res.redirect('/index.html?auth=success&email=' + encodeURIComponent(email));
  } catch (e) {
    console.error('[google-auth] Erreur callback:', e);
    res.redirect(`/index.html?auth=error&msg=${encodeURIComponent(e.message)}`);
  }
});

/**
 * POST /api/auth/google/refresh
 * Rafraîchit l'access_token d'un compte Gmail OAuth.
 * Appelé par le sync service quand le token est expiré.
 */
router.post('/refresh', async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ error: 'accountId requis' });

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND device_id = ?').get(accountId, req.deviceId);
  if (!account) return res.status(404).json({ error: 'Compte introuvable' });
  if (account.provider !== 'gmail') return res.status(400).json({ error: 'Ce n\'est pas un compte Gmail OAuth' });

  let creds;
  try {
    creds = JSON.parse(decrypt(account.encrypted_credentials));
  } catch (e) {
    return res.status(500).json({ error: 'Credentials illisibles' });
  }

  if (!creds.refresh_token) {
    return res.status(400).json({ error: 'Pas de refresh_token — réautorisez le compte' });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(401).json({ error: 'Refresh échoué', details: tokenData });
    }

    const newCreds = {
      ...creds,
      access_token: tokenData.access_token,
      expiry_date: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    };
    if (tokenData.refresh_token) {
      newCreds.refresh_token = tokenData.refresh_token;
    }

    db.prepare('UPDATE accounts SET encrypted_credentials = ? WHERE id = ?')
      .run(encrypt(JSON.stringify(newCreds)), accountId);

    res.json({ ok: true, expiry_date: newCreds.expiry_date });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
