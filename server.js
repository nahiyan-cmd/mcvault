require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const { PORT = 3000, JWT_SECRET = 'mcvault_super_secret_change_this' } = process.env;

// ─── Data persistence helpers ────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, '[]');
if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, '[]');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ─── Simple token helpers (no external JWT lib needed) ───────────────────────
function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    // 24h expiry
    if (Date.now() - payload.iat > 86400000) return null;
    return payload;
  } catch { return null; }
}

function hashPassword(pass) {
  return crypto.createHmac('sha256', JWT_SECRET).update(pass).digest('hex');
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid_token' });
  req.admin = payload;
  next();
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/admin/login  { username, password, code }
app.post('/api/admin/login', (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) {
    return res.status(400).json({ error: 'missing_fields', message: 'Username, password and code are required.' });
  }
  const admins = readJSON(ADMINS_FILE);
  const admin = admins.find(a =>
    a.username === username &&
    a.passwordHash === hashPassword(password) &&
    a.code === String(code)
  );
  if (!admin) return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid username, password, or code.' });
  const token = signToken({ username: admin.username, role: 'admin' });
  res.json({ token, username: admin.username });
});

// GET /api/admin/me — verify token & return identity
app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username, role: 'admin' });
});

// ════════════════════════════════════════════════════════════════════════════
//  BOT-ONLY ADMIN MANAGEMENT ROUTES (protected by BOT_SECRET header)
// ════════════════════════════════════════════════════════════════════════════
function requireBot(req, res, next) {
  if (req.headers['x-bot-secret'] !== (process.env.BOT_SECRET || 'mcvault_bot_secret')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

// GET /api/bot/admins — list all admins
app.get('/api/bot/admins', requireBot, (req, res) => {
  const admins = readJSON(ADMINS_FILE).map(a => ({ username: a.username, code: a.code, createdAt: a.createdAt }));
  res.json(admins);
});

// POST /api/bot/admins — create admin { username, password, code }
app.post('/api/bot/admins', requireBot, (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) return res.status(400).json({ error: 'missing_fields' });
  if (!/^\d{6}$/.test(String(code))) return res.status(400).json({ error: 'invalid_code', message: 'Code must be exactly 6 digits.' });
  const admins = readJSON(ADMINS_FILE);
  if (admins.length >= 2) return res.status(400).json({ error: 'max_reached', message: 'Max 2 admins allowed.' });
  if (admins.find(a => a.username === username)) return res.status(400).json({ error: 'exists', message: 'Username already exists.' });
  admins.push({ username, passwordHash: hashPassword(password), code: String(code), createdAt: new Date().toISOString() });
  writeJSON(ADMINS_FILE, admins);
  res.json({ success: true, username });
});

// DELETE /api/bot/admins/:username — remove an admin
app.delete('/api/bot/admins/:username', requireBot, (req, res) => {
  let admins = readJSON(ADMINS_FILE);
  const before = admins.length;
  admins = admins.filter(a => a.username !== req.params.username);
  if (admins.length === before) return res.status(404).json({ error: 'not_found' });
  writeJSON(ADMINS_FILE, admins);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  ACCOUNTS ROUTES (public read, admin write)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/accounts — public, returns all saved accounts
app.get('/api/accounts', (req, res) => {
  res.json(readJSON(ACCOUNTS_FILE));
});

// POST /api/accounts — admin only, add account
app.post('/api/accounts', requireAdmin, (req, res) => {
  const entry = req.body;
  if (!entry.username || !entry.uuid) return res.status(400).json({ error: 'missing_fields' });
  const accounts = readJSON(ACCOUNTS_FILE);
  if (accounts.find(a => a.uuid.toLowerCase() === entry.uuid.toLowerCase())) {
    return res.status(400).json({ error: 'duplicate', message: 'Account already exists.' });
  }
  if (accounts.length >= 10) return res.status(400).json({ error: 'vault_full', message: 'Vault is full (10/10).' });
  entry.addedDate = new Date().toISOString().split('T')[0];
  accounts.push(entry);
  writeJSON(ACCOUNTS_FILE, accounts);
  res.json({ success: true, entry });
});

// PUT /api/accounts/:uuid — admin only, update account
app.put('/api/accounts/:uuid', requireAdmin, (req, res) => {
  const accounts = readJSON(ACCOUNTS_FILE);
  const idx = accounts.findIndex(a => a.uuid.toLowerCase() === req.params.uuid.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  accounts[idx] = { ...accounts[idx], ...req.body, addedDate: accounts[idx].addedDate };
  writeJSON(ACCOUNTS_FILE, accounts);
  res.json({ success: true, entry: accounts[idx] });
});

// DELETE /api/accounts/:uuid — admin only, remove account
app.delete('/api/accounts/:uuid', requireAdmin, (req, res) => {
  let accounts = readJSON(ACCOUNTS_FILE);
  const before = accounts.length;
  accounts = accounts.filter(a => a.uuid.toLowerCase() !== req.params.uuid.toLowerCase());
  if (accounts.length === before) return res.status(404).json({ error: 'not_found' });
  writeJSON(ACCOUNTS_FILE, accounts);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  MOJANG / MCTIERS PROXY ROUTES (unchanged)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/lookup/:username', async (req, res) => {
  const { username } = req.params;
  if (!username || username.length < 3 || username.length > 16 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'invalid_username', message: 'Invalid Minecraft username format.' });
  }
  try {
    const mojangRes = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`);
    const uuid = mojangRes.data.id;
    const correctUsername = mojangRes.data.name;
    const skinUrl = `https://mc-heads.net/body/${uuid}/right`;
    res.json({ username: correctUsername, uuid, skinUrl });
  } catch (err) {
    if (err.response?.status === 404) return res.status(404).json({ error: 'not_found', message: 'No Minecraft account found with that username.' });
    res.status(500).json({ error: 'lookup_failed', message: 'Could not look up that username.' });
  }
});

app.get('/api/tiers/:username', async (req, res) => {
  const { username } = req.params;
  if (!username || username.length < 3 || username.length > 16 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'invalid_username', message: 'Invalid Minecraft username format.' });
  }
  try {
    const mojangRes = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`);
    const uuid = mojangRes.data.id;
    const uuidDashed = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
    const tiersRes = await axios.get(`https://mctiers.com/api/profile/${uuidDashed}`);
    const data = tiersRes.data;
    res.json({ uuid, rankings: data.rankings || {}, leaderboardPos: data.overall || null, region: data.region || null });
  } catch (err) {
    if (err.response?.status === 404) return res.json({ uuid: null, rankings: {}, leaderboardPos: null, region: null });
    res.status(500).json({ error: 'tier_lookup_failed', message: 'Could not fetch tier data.' });
  }
});

app.listen(PORT, () => console.log(`MC Vault server running on port ${PORT}`));
