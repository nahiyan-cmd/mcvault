require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';

const DATA_DIR = path.join(__dirname, 'data');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, '[]');
if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, '[]');

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ─── SETUP ──────────────────────────────────────────────────────────────────────
app.post('/api/setup', async (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) {
    return res.status(400).json({ message: 'All fields required' });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Code must be 6 digits' });
  }
  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ message: 'Username 3+ chars, password 4+ chars' });
  }

  let admins = loadJSON(ADMINS_FILE);
  admins = admins.filter(a => a.username !== username);

  const passwordHash = await bcrypt.hash(password, 12);
  const codeHash = await bcrypt.hash(code, 12);

  admins.push({
    username,
    passwordHash,
    codeHash,
    code,
    createdAt: new Date().toISOString()
  });

  if (admins.length > 2) admins = admins.slice(-2);
  saveJSON(ADMINS_FILE, admins);

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, message: 'Admin created' });
});

// ─── LOGIN ──────────────────────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) {
    return res.status(400).json({ message: 'All fields required' });
  }

  const admins = loadJSON(ADMINS_FILE);
  const admin = admins.find(a => a.username === username);
  if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

  const validPass = await bcrypt.compare(password, admin.passwordHash);
  const validCode = await bcrypt.compare(code, admin.codeHash);

  if (!validPass || !validCode) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ username: admin.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

// ─── ADMINS ─────────────────────────────────────────────────────────────────────
app.get('/api/admins', adminAuth, (req, res) => {
  const admins = loadJSON(ADMINS_FILE).map(a => ({
    username: a.username,
    code: a.code,
    createdAt: a.createdAt
  }));
  res.json(admins);
});

app.post('/api/admins', adminAuth, async (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) {
    return res.status(400).json({ message: 'All fields required' });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Code must be 6 digits' });
  }

  let admins = loadJSON(ADMINS_FILE);
  if (admins.length >= 2) return res.status(400).json({ message: 'Max 2 admins reached' });
  if (admins.some(a => a.username === username)) {
    return res.status(400).json({ message: 'Admin already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const codeHash = await bcrypt.hash(code, 12);

  admins.push({
    username,
    passwordHash,
    codeHash,
    code,
    createdAt: new Date().toISOString()
  });

  saveJSON(ADMINS_FILE, admins);
  res.status(201).json({ message: 'Admin created' });
});

app.delete('/api/admins/:username', adminAuth, (req, res) => {
  let admins = loadJSON(ADMINS_FILE);
  if (admins.length <= 1) return res.status(400).json({ message: 'Cannot delete last admin' });

  const idx = admins.findIndex(a => a.username === req.params.username);
  if (idx === -1) return res.status(404).json({ message: 'Admin not found' });

  admins.splice(idx, 1);
  saveJSON(ADMINS_FILE, admins);
  res.json({ message: 'Admin deleted' });
});

app.patch('/api/admins/:username', adminAuth, async (req, res) => {
  const { password, code } = req.body;
  let admins = loadJSON(ADMINS_FILE);
  const admin = admins.find(a => a.username === req.params.username);
  if (!admin) return res.status(404).json({ message: 'Admin not found' });

  if (password) admin.passwordHash = await bcrypt.hash(password, 12);
  if (code) {
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Code must be 6 digits' });
    admin.code = code;
    admin.codeHash = await bcrypt.hash(code, 12);
  }

  saveJSON(ADMINS_FILE, admins);
  res.json({ message: 'Admin updated' });
});

// ─── SETUP STATUS ───────────────────────────────────────────────────────────────
app.get('/api/setup-status', (req, res) => {
  const admins = loadJSON(ADMINS_FILE);
  res.json({ setupComplete: admins.length > 0, adminCount: admins.length });
});

// ─── RESET ────────────────────────────────────────────────────────────────────────
app.get('/api/reset-all', (req, res) => {
  saveJSON(ADMINS_FILE, []);
  saveJSON(ACCOUNTS_FILE, []);
  res.json({ message: 'All data cleared' });
});

// ─── ACCOUNTS ───────────────────────────────────────────────────────────────────
app.get('/api/accounts', (req, res) => {
  const accounts = loadJSON(ACCOUNTS_FILE);
  res.json(accounts);
});

app.post('/api/accounts', adminAuth, (req, res) => {
  const { username, uuid, skinUrl, rankings, leaderboardPos, region, addedDate } = req.body;
  if (!username || !uuid) return res.status(400).json({ message: 'Username and UUID required' });

  let accounts = loadJSON(ACCOUNTS_FILE);
  if (accounts.length >= 10) return res.status(400).json({ message: 'Vault is full (10/10)' });

  const exists = accounts.some(a => a.uuid.toLowerCase() === uuid.toLowerCase());
  if (exists) return res.status(400).json({ message: 'Account already in vault' });

  const account = {
    _id: Date.now().toString(),
    username,
    uuid: uuid.toLowerCase(),
    skinUrl,
    rankings: rankings || {},
    leaderboardPos,
    region,
    addedDate,
    order: accounts.length
  };

  accounts.push(account);
  saveJSON(ACCOUNTS_FILE, accounts);
  res.status(201).json(account);
});

app.put('/api/accounts/:id', adminAuth, (req, res) => {
  const { username, uuid, skinUrl, rankings, leaderboardPos, region } = req.body;
  let accounts = loadJSON(ACCOUNTS_FILE);
  const account = accounts.find(a => a._id === req.params.id);
  if (!account) return res.status(404).json({ message: 'Account not found' });

  if (username) account.username = username;
  if (uuid) account.uuid = uuid.toLowerCase();
  if (skinUrl) account.skinUrl = skinUrl;
  if (rankings) account.rankings = rankings;
  if (leaderboardPos !== undefined) account.leaderboardPos = leaderboardPos;
  if (region) account.region = region;

  saveJSON(ACCOUNTS_FILE, accounts);
  res.json(account);
});

app.delete('/api/accounts/:id', adminAuth, (req, res) => {
  let accounts = loadJSON(ACCOUNTS_FILE);
  accounts = accounts.filter(a => a._id !== req.params.id);
  saveJSON(ACCOUNTS_FILE, accounts);
  res.json({ message: 'Account deleted' });
});

app.delete('/api/accounts', adminAuth, (req, res) => {
  saveJSON(ACCOUNTS_FILE, []);
  res.json({ message: 'All accounts cleared' });
});

// ─── MINECRAFT APIs ─────────────────────────────────────────────────────────────
app.get('/api/lookup/:username', async (req, res) => {
  try {
    const axios = require('axios');
    const username = encodeURIComponent(req.params.username);
    
    // Try multiple APIs in order
    let uuid, name;
    
    // API 1: Ashcon (most reliable)
    try {
      const { data } = await axios.get(`https://api.ashcon.app/mojang/v2/user/${username}`, { timeout: 5000 });
      uuid = data.uuid.replace(/-/g, '');
      name = data.username;
    } catch {
      // API 2: Geyser
      try {
        const { data } = await axios.get(`https://api.geysermc.org/v2/xbox/xuid?gamertag=${username}`, { timeout: 5000 });
        const xuid = data.xuid;
        const { data: profileData } = await axios.get(`https://api.geysermc.org/v2/xbox/profile?xuid=${xuid}`, { timeout: 5000 });
        uuid = profileData.id;
        name = profileData.name;
      } catch {
        // API 3: Direct Mojang (fallback)
        const { data } = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`, { timeout: 5000 });
        uuid = data.id;
        name = data.name;
      }
    }

    const skinUrl = `https://crafatar.com/renders/body/${uuid}?overlay=true&scale=4&default=MHF_Steve`;
    res.json({ username: name, uuid, skinUrl });
  } catch (err) {
    console.error('Lookup error:', err.message);
    res.status(404).json({ message: 'Player not found. Try a different username or check spelling.' });
  }
});

app.get('/api/tiers/:username', async (req, res) => {
  try {
    const { data } = await require('axios').get(
      `https://mctiers.com/api/rankings/${encodeURIComponent(req.params.username)}`,
      { timeout: 8000 }
    );
    res.json(data);
  } catch (err) {
    res.status(404).json({ message: 'No tier data found' });
  }
});

// ─── HEALTH ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`MC Vault running on port ${PORT}`);
});
