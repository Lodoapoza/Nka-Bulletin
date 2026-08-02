process.env.SYNC_TIMEOUT = process.env.SYNC_TIMEOUT || '900000';

const db = require('../src/db');
const { fetchPayslipsSince } = require('../src/imapService');
const { importFound } = require('../src/syncService');
const { decrypt } = require('../src/crypto');
const { ImapFlow } = require('imapflow');

async function authOk(account, password) {
  const client = new ImapFlow({
    host: account.provider === 'gmail' ? 'imap.gmail.com' : (account.imap_host || ''),
    port: account.imap_port || 993,
    secure: !!account.imap_secure,
    auth: { user: account.email, pass: password },
    logger: false,
    connectTimeout: 10000,
    socketTimeout: 30000,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    await client.logout();
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  const devices = db.prepare('SELECT DISTINCT device_id FROM accounts').all();
  const currentYear = new Date().getFullYear();

  for (const d of devices) {
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(d.device_id);
    const accounts = db.prepare('SELECT * FROM accounts WHERE device_id = ?').all(d.device_id);

    for (const account of accounts) {
      const password = decrypt(account.encrypted_credentials);
      if (!(await authOk(account, password))) {
        console.log(`[rescan] ${account.email} (#${account.id}): AUTH refusée, compte ignoré.`);
        continue;
      }
      let total = 0;
      console.log(`[rescan] ${account.email} (#${account.id}) — balayage ${2000}-${currentYear}...`);
      for (let year = 2000; year <= currentYear; year++) {
        try {
          const found = await fetchPayslipsSince({
            provider: account.provider,
            host: account.imap_host,
            port: account.imap_port,
            secure: !!account.imap_secure,
            email: account.email,
            password,
            sinceDate: new Date(year, 0, 1),
            beforeDate: new Date(year + 1, 0, 1),
          });
          const n = await importFound(device, account, found);
          if (n > 0) console.log(`[rescan] ${year}: +${n}`);
          total += n;
        } catch (e) {
          console.error(`[rescan] ${year}: ERREUR ${e.message}`);
        }
      }
      db.prepare('UPDATE accounts SET last_sync_at = ? WHERE id = ?').run(new Date().toISOString(), account.id);
      console.log(`[rescan] TOTAL ${account.email} (#${account.id}): +${total}`);
    }
  }
  console.log('[rescan] Terminé.');
}

main().catch((e) => { console.error(e); process.exit(1); });
