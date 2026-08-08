const crypto = require('crypto');
require('dotenv').config();

const SECRET = process.env.CRYPTO_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error('[crypto] FATAL: CRYPTO_SECRET manquant ou trop court dans .env — générez-en un avec `openssl rand -hex 32`');
  process.exit(1);
}

// On dérive une clé de 32 octets à partir du secret fourni (hex ou texte libre)
function getKey() {
  return crypto.createHash('sha256').update(String(SECRET)).digest();
}

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // On stocke iv + authTag + données chiffrées, encodés en base64, séparés par ':'
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decrypt(payload) {
  const [ivB64, tagB64, dataB64] = String(payload).split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

function hashMessage(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Code de liaison multi-appareils : scrypt avec sel aléatoire de 16 octets, clé de 64 octets.
// Le code n'est JAMAIS stocké en clair — seulement { salt, hash } en base64.
function hashLinkCode(code) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(code), salt, 64);
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

function verifyLinkCode(code, salt, hash) {
  if (!salt || !hash) return false; // user grandfathered sans code défini
  const saltBuf = Buffer.from(String(salt), 'base64');
  const hashBuf = Buffer.from(String(hash), 'base64');
  if (hashBuf.length === 0) return false;
  const candidate = crypto.scryptSync(String(code), saltBuf, hashBuf.length);
  return crypto.timingSafeEqual(candidate, hashBuf);
}

module.exports = { encrypt, decrypt, hashMessage, hashLinkCode, verifyLinkCode };
