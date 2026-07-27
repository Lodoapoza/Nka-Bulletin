import oauth2 from 'simple-oauth2';

function getConfig() {
  return {
    client: {
      id: process.env.YAHOO_CLIENT_ID,
      secret: process.env.YAHOO_CLIENT_SECRET
    },
    auth: {
      tokenHost: 'https://api.login.yahoo.com',
      tokenPath: '/oauth2/get_token',
      authorizePath: '/oauth2/request_auth'
    }
  };
}

export function getAuthUrl(state) {
  const client = new oauth2.AuthorizationCode(getConfig());

  return client.authorizeURL({
    redirect_uri: process.env.YAHOO_REDIRECT_URI,
    scope: 'mail-r offline_access',
    state
  });
}

export async function handleCallback(code) {
  const client = new oauth2.AuthorizationCode(getConfig());

  const result = await client.getToken({
    code,
    redirect_uri: process.env.YAHOO_REDIRECT_URI
  });

  // Yahoo doesn't have a simple user info endpoint,
  // we'll store what we have and let the user confirm their email
  return {
    email: 'yahoo-user',
    refresh_token: result.token.refresh_token,
    access_token: result.token.access_token,
    expiry_date: result.token.expires_at ? result.token.expires_at.getTime() : null
  };
}

export async function refreshAccessToken(refreshToken) {
  const client = new oauth2.AuthorizationCode(getConfig());

  const token = client.createToken({
    refresh_token: refreshToken,
    expires_in: 0
  });

  const refreshed = await token.refresh();

  return {
    access_token: refreshed.token.access_token,
    refresh_token: refreshed.token.refresh_token || refreshToken,
    expiry_date: refreshed.token.expires_at ? refreshed.token.expires_at.getTime() : null
  };
}
