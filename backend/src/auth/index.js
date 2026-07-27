import * as gmail from './gmail.js';
import * as outlook from './outlook.js';
import * as yahoo from './yahoo.js';
import * as imap from './imap.js';
import { updateAccountTokens } from '../db.js';

const providers = { gmail, outlook, yahoo, imap };

export function getProvider(providerName) {
  const provider = providers[providerName];
  if (!provider) throw new Error(`Fournisseur inconnu: ${providerName}`);
  return provider;
}

export async function refreshAccessToken(account) {
  const provider = getProvider(account.provider);
  if (!provider.refreshAccessToken) {
    throw new Error(`Le fournisseur ${account.provider} ne supporte pas le rafraîchissement de token`);
  }

  const tokens = await provider.refreshAccessToken(account.refresh_token);

  // Update tokens in DB
  updateAccountTokens(account.id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });

  return tokens;
}
