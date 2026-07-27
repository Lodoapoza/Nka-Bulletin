import oauth2 from 'simple-oauth2';

function getConfig() {
  return {
    client: {
      id: process.env.OUTLOOK_CLIENT_ID,
      secret: process.env.OUTLOOK_CLIENT_SECRET
    },
    auth: {
      tokenHost: 'https://login.microsoftonline.com',
      tokenPath: '/common/oauth2/v2.0/token',
      authorizePath: '/common/oauth2/v2.0/authorize'
    }
  };
}

export function getAuthUrl(state) {
  const client = new oauth2.AuthorizationCode(getConfig());

  return client.authorizeURL({
    redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
    scope: 'Mail.Read Mail.ReadWrite offline_access',
    state
  });
}

export async function handleCallback(code) {
  const client = new oauth2.AuthorizationCode(getConfig());

  const result = await client.getToken({
    code,
    redirect_uri: process.env.OUTLOOK_REDIRECT_URI
  });

  const accessToken = result.token.access_token;

  // Get user info from Microsoft Graph
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Microsoft Graph API error: ${response.status}`);
  }

  const profile = await response.json();
  const email = profile.mail || profile.userPrincipalName;

  if (!email) {
    throw new Error('Could not retrieve email from Microsoft account');
  }

  return {
    email,
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
