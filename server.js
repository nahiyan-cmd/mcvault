require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

const app = express();

const {
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_REDIRECT_URI,
  SESSION_SECRET,
  PORT = 3000,
} = process.env;

app.use(session({
  secret: SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: MS_REDIRECT_URI,
    response_mode: 'query',
    scope: 'XboxLive.signin offline_access',
  });

  res.redirect(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params.toString()}`);
});

app.get('/api/auth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect('/?auth_error=missing_code');
  }

  try {
    const tokenRes = await axios.post(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: MS_REDIRECT_URI,
        scope: 'XboxLive.signin offline_access',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const msAccessToken = tokenRes.data.access_token;

    const xblRes = await axios.post(
      'https://user.auth.xboxlive.com/user/authenticate',
      {
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${msAccessToken}`,
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );

    const xblToken = xblRes.data.Token;
    const userHash = xblRes.data.DisplayClaims.xui[0].uhs;

    const xstsRes = await axios.post(
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xblToken],
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );

    const xstsToken = xstsRes.data.Token;

    const mcLoginRes = await axios.post(
      'https://api.minecraftservices.com/authentication/login_with_xbox',
      { identityToken: `XBL3.0 x=${userHash};${xstsToken}` },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const mcAccessToken = mcLoginRes.data.access_token;

    const profileRes = await axios.get(
      'https://api.minecraftservices.com/minecraft/profile',
      { headers: { Authorization: `Bearer ${mcAccessToken}` } }
    );

    const profile = profileRes.data;

    let skinUrl = null;
    if (profile.skins && profile.skins.length) {
      const activeSkin = profile.skins.find(s => s.state === 'ACTIVE') || profile.skins[0];
      skinUrl = activeSkin.url;
    }

    req.session.pendingProfile = {
      username: profile.name,
      uuid: profile.id,
      skinUrl,
    };

    res.redirect('/?login=success');
  } catch (err) {
    console.error('Auth flow failed:', err.response?.data || err.message);

    const status = err.response?.status;
    let reason = 'unknown_error';
    if (status === 404) reason = 'no_minecraft_profile';
    if (status === 401) reason = 'unauthorized';

    res.redirect(`/?auth_error=${reason}`);
  }
});

app.get('/api/auth/pending', (req, res) => {
  const profile = req.session.pendingProfile || null;
  delete req.session.pendingProfile;
  res.json({ profile });
});

app.get('/api/tiers/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const mojangRes = await axios.get(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
    );
    const uuid = mojangRes.data.id;

    const tiersRes = await axios.get(`https://mctiers.com/api/profile/${uuid}`);

    res.json({ uuid, tiers: tiersRes.data });
  } catch (err) {
    console.error('Tier lookup failed:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'tier_lookup_failed',
      message: 'Could not fetch tier data for this player.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`MC Vault server running on port ${PORT}`);
});
