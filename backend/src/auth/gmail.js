import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
}

export function getAuthUrl(state) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state
  });
}

export async function handleCallback(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });

  return {
    email: profile.data.emailAddress,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry_date ? tokens.expiry_date : null
  };
}

export async function refreshAccessToken(refreshToken) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return {
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token || refreshToken,
    expiry_date: credentials.expiry_date
  };
}
