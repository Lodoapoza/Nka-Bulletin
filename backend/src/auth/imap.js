import { ImapFlow } from 'imapflow';
import { v4 as uuidv4 } from 'uuid';

export async function verifyConnection({ host, port, user, password, useTls }) {
  const client = new ImapFlow({
    host,
    port: Number(port),
    secure: useTls === true || useTls === 'true' || port === 993,
    auth: { user, pass: password },
    logger: false
  });

  try {
    await client.connect();
    await client.logout();
    return { success: true, message: 'Connexion IMAP réussie' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export function saveConfig(data) {
  return {
    id: data.id || uuidv4(),
    email: data.email,
    provider: 'imap',
    config_json: JSON.stringify({
      host: data.host,
      port: Number(data.port),
      user: data.user,
      useTls: data.useTls === true || data.useTls === 'true'
    })
  };
}
