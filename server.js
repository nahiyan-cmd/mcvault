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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, '[]');

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
  res.json({ message: 'All data cleared' });
});

// ─── MINECRAFT APIs ─────────────────────────────────────────────────────────────
// Original Mojang API from your files
app.get('/api/lookup/:username', async (req, res) => {
  try {
    const { data } = await require('axios').get(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(req.params.username)}`,
      { timeout: 5000 }
    );
    const uuid = data.id;
    // Original skin URL from your files
    const skinUrl = `https://crafatar.com/renders/body/${uuid}?overlay=true&scale=4`;
    res.json({ username: data.name, uuid, skinUrl });
  } catch (err) {
    res.status(404).json({ message: 'Player not found' });
  }
});

// Original MCTiers API from your files
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
