const express = require('express');
const fs = require('fs');
const db = require('../db');
const { encrypt } = require('../crypto');
const { PROVIDER_PRESETS } = require('../imapService');
const { ImapFlow } = require('imapflow');
const { resetDeviceData } = require('./device');

const router = express.Router();

// Liste des comptes connectés : ceux de cet appareil + ceux des autres appareils
// du MÊME user_matricule (multi-appareils). Le DELETE autorise déjà la suppression
// cross-device (sameUser) : lister ces comptes est nécessaire pour pouvoir les
// déconnecter depuis n'importe quel appareil.
// (Remplace l'ancienne « ligne fantôme » {id:null} qui produisait un compte vide
// impossible à supprimer → DELETE /api/accounts/null → 404 en boucle.)
router.get('/', (req, res) => {
  const own = db.prepare(
    'SELECT id, provider, label, email, last_sync_at, created_at FROM accounts WHERE device_id = ?'
  ).all(req.deviceId).map(a => ({ ...a, own_device: 1 }));

  let rows = own;
  if (req.userMatricule) {
    const shared = db.prepare(`
      SELECT a.id, a.provider, a.label, a.email, a.last_sync_at, a.created_at, 0 AS own_device
      FROM accounts a
      JOIN devices d ON d.id = a.device_id
      WHERE d.user_matricule = ? AND a.device_id != ?
      ORDER BY a.created_at ASC
    `).all(req.userMatricule, req.deviceId);
    rows = [...own, ...shared];
  }

  res.json(rows);
});

/**
 * Ajoute un compte de messagerie. Pour Gmail/Yahoo/Outlook : l'utilisateur fournit un
 * "mot de passe d'application" (app password), qui est la méthode réelle et supportée par ces
 * fournisseurs pour l'accès IMAP tiers (l'app ne demande jamais le mot de passe principal du compte).
 * Pour IMAP personnalisé : host/port/secure sont fournis explicitement.
 */
router.post('/', async (req, res) => {
  const { provider, label, email, password, host, port, secure } = req.body;
  if (!provider || !email || !password) {
    return res.status(400).json({ error: 'provider, email et password sont requis' });
  }

  const preset = PROVIDER_PRESETS[provider];
  const imapHost = preset ? preset.host : host;
  const imapPort = preset ? preset.port : Number(port) || 993;
  const imapSecure = preset ? preset.secure : secure !== false;

  if (!imapHost) {
    return res.status(400).json({ error: 'host requis pour un compte IMAP personnalisé' });
  }

  // Vérification réelle de connexion avant d'enregistrer, pour éviter de stocker des identifiants invalides
  try {
    const testClient = new ImapFlow({
      host: imapHost, port: imapPort, secure: imapSecure,
      auth: { user: email, pass: password }, logger: false,
    });
    await testClient.connect();
    await testClient.logout();
  } catch (e) {
    return res.status(400).json({ error: `Connexion IMAP impossible : ${e.message}` });
  }

  // Limite : 3 appareils maximum par compte de messagerie (hors appareil courant).
  // Éjection AUTOMATIQUE de l'appareil le plus ancien au lieu d'un refus 403.
  const sameEmailCount = db.prepare(
    'SELECT COUNT(DISTINCT device_id) AS n FROM accounts WHERE email = ? AND device_id != ?'
  ).get(email, req.deviceId);
  if (sameEmailCount.n >= 3) {
    const oldest = db.prepare(`
      SELECT d.id FROM accounts a
      JOIN devices d ON d.id = a.device_id
      WHERE a.email = ? AND a.device_id != ?
      GROUP BY d.id ORDER BY MIN(d.created_at) ASC LIMIT 1
    `).get(email, req.deviceId);
    if (oldest) {
      resetDeviceData(oldest.id);
    } else {
      // Cas incohérent (compte plein mais aucun appareil trouvable) : 403 en secours.
      return res.status(403).json({ error: 'Ce compte de messagerie est déjà utilisé sur 3 appareils. Retirez un appareil pour en connecter un nouveau.', code: 'DEVICE_LIMIT' });
    }
  }

  // Rattachement automatique : si l'appareil courant n'a pas encore de compte
  // utilisateur, on le rattache au compte utilisateur d'un autre appareil qui
  // utilise le MÊME email de messagerie (multi-appareils invisible pour le client).
  const dev = db.prepare('SELECT user_matricule FROM devices WHERE id = ?').get(req.deviceId);
  if (dev && !dev.user_matricule) {
    const linked = db.prepare(`
      SELECT DISTINCT d.user_matricule AS mat FROM accounts a
      JOIN devices d ON d.id = a.device_id
      WHERE a.email = ? AND d.user_matricule IS NOT NULL AND d.id != ?
      LIMIT 1
    `).get(email, req.deviceId);
    if (linked && linked.mat) {
      const userCount = db.prepare('SELECT COUNT(*) AS n FROM devices WHERE user_matricule = ? AND id != ?').get(linked.mat, req.deviceId);
      if (userCount.n >= 3) {
        // Éjection AUTOMATIQUE de l'appareil le plus ancien du matricule.
        const oldest = db.prepare('SELECT id FROM devices WHERE user_matricule = ? AND id != ? ORDER BY created_at ASC LIMIT 1').get(linked.mat, req.deviceId);
        if (oldest) {
          resetDeviceData(oldest.id);
        } else {
          // Cas incohérent (compte plein mais aucun appareil trouvable) : 403 en secours.
          return res.status(403).json({ error: 'Ce compte est déjà utilisé sur 3 appareils. Retirez un appareil pour en connecter un nouveau.', code: 'DEVICE_LIMIT' });
        }
      }
      const attach = db.transaction(() => {
        db.prepare('UPDATE devices SET user_matricule = ?, owner_matricule = COALESCE(owner_matricule, ?) WHERE id = ?').run(linked.mat, linked.mat, req.deviceId);
        // Les bulletins déjà scannés par cet appareil rejoignent le compte
        db.prepare('UPDATE bulletins SET user_matricule = ? WHERE device_id = ? AND user_matricule IS NULL').run(linked.mat, req.deviceId);
        // Dédup : supprimer les doublons (user_matricule, message_hash) en gardant MIN(id)
        const dups = db.prepare(`
          SELECT b.id, b.filepath FROM bulletins b
          WHERE b.user_matricule = ? AND b.device_id = ?
            AND EXISTS (SELECT 1 FROM bulletins b2 WHERE b2.user_matricule = b.user_matricule AND b2.message_hash = b.message_hash AND b2.id < b.id)
        `).all(linked.mat, req.deviceId);
        const del = db.prepare('DELETE FROM bulletins WHERE id = ?');
        for (const r of dups) {
          if (r.filepath) { try { fs.unlinkSync(r.filepath); } catch (e) { /* best-effort */ } }
          del.run(r.id);
        }
      });
      attach();
    }
  }

  const encryptedCredentials = encrypt(password);
  const info = db.prepare(`
    INSERT INTO accounts (device_id, provider, label, email, imap_host, imap_port, imap_secure, encrypted_credentials)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.deviceId, provider, label || email, email, imapHost, imapPort, imapSecure ? 1 : 0, encryptedCredentials);

  res.status(201).json({ id: info.lastInsertRowid, provider, label: label || email, email });
});

router.delete('/:id', (req, res) => {
  console.log(`[accounts] DELETE id=${req.params.id} device_id=${req.deviceId} mat=${req.userMatricule}`);
  // Premier check : le compte existe-t-il ?
  const account = db.prepare('SELECT a.id, a.device_id, a.email, d.user_matricule FROM accounts a LEFT JOIN devices d ON d.id = a.device_id WHERE a.id = ?').get(req.params.id);
  if (!account) {
    console.log(`[accounts] DELETE not found: no account with id=${req.params.id}`);
    return res.status(404).json({ error: 'Compte introuvable' });
  }
  // Autorisation : le compte peut être supprimé si
  //   (a) il appartient à cet appareil, OU
  //   (b) il appartient à un autre appareil du MÊME user_matricule
  //         (gestion multi-appareils : l'user peut gérer ses comptes depuis n'importe lequel de ses appareils)
  const sameUser = req.userMatricule && account.user_matricule === req.userMatricule;
  const sameDevice = account.device_id === req.deviceId;
  if (!sameUser && !sameDevice) {
    console.log(`[accounts] DELETE forbidden: account dev=${account.device_id} (mat=${account.user_matricule}) vs request dev=${req.deviceId} (mat=${req.userMatricule})`);
    return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à supprimer ce compte.' });
  }
  // Les bulletins sont des archives indépendantes du compte email. On détache
  // d'abord la FK pour éviter une violation SQLite, puis on supprime le compte
  // et ses identifiants chiffrés dans la même transaction.
  db.transaction(() => {
    db.prepare('UPDATE bulletins SET account_id = NULL WHERE account_id = ?').run(req.params.id);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  })();
  console.log(`[accounts] DELETE ok: id=${req.params.id} email=${account.email}`);
  res.json({ ok: true });
});

module.exports = router;
