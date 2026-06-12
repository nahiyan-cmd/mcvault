require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_SECRET = process.env.BOT_SECRET || 'mcvault_bot_secret';
const JWT_SECRET = process.env.JWT_SECRET || 'mcvault_jwt_secret';

// ─── Data file ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, '[]');

function loadAdmins() {
  try { return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8')); }
  catch { return []; }
}

function saveAdmins(admins) {
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth middleware ──────────────────────────────────────────────────────────
function botAuth(req, res, next) {
  const secret = req.headers['x-bot-secret'];
  if (secret !== BOT_SECRET) return res.status(403).json({ message: 'Invalid bot secret' });
  next();
}

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ─── Admin Auth API ───────────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) {
    return res.status(400).json({ message: 'All fields required' });
  }

  const admins = loadAdmins();
  const admin = admins.find(a => a.username === username);
  if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

  const validPass = await bcrypt.compare(password, admin.passwordHash);
  const validCode = await bcrypt.compare(code, admin.codeHash);

  if (!validPass || !validCode) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: admin.username });
});

// ─── Bot Admin API ────────────────────────────────────────────────────────────
app.get('/api/bot/admins', botAuth, (req, res) => {
  const admins = loadAdmins().map(a => ({
    username: a.username,
    code: a.code,
    createdAt: a.createdAt
  }));
  res.json(admins);
});

app.post('/api/bot/admins', botAuth, async (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) {
    return res.status(400).json({ message: 'Username, password, and code required' });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Code must be 6 digits' });
  }

  let admins = loadAdmins();
  if (admins.length >= 2) {
    return res.status(400).json({ error: 'max_reached', message: 'Max 2 admins allowed' });
  }
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

  saveAdmins(admins);
  res.status(201).json({ message: 'Admin created' });
});

app.delete('/api/bot/admins/:username', botAuth, (req, res) => {
  let admins = loadAdmins();
  const idx = admins.findIndex(a => a.username === req.params.username);
  if (idx === -1) return res.status(404).json({ message: 'Admin not found' });
  admins.splice(idx, 1);
  saveAdmins(admins);
  res.json({ message: 'Admin deleted' });
});

app.patch('/api/bot/admins/:username', botAuth, async (req, res) => {
  const { password, code } = req.body;
  let admins = loadAdmins();
  const admin = admins.find(a => a.username === req.params.username);
  if (!admin) return res.status(404).json({ message: 'Admin not found' });

  if (password) admin.passwordHash = await bcrypt.hash(password, 12);
  if (code) {
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Code must be 6 digits' });
    admin.code = code;
    admin.codeHash = await bcrypt.hash(code, 12);
  }

  saveAdmins(admins);
  res.json({ message: 'Admin updated' });
});

// ─── Minecraft API Proxies ────────────────────────────────────────────────────
app.get('/api/lookup/:username', async (req, res) => {
  try {
    const { data } = await axios.get(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(req.params.username)}`,
      { timeout: 5000 }
    );
    const uuid = data.id;
    const skinUrl = `https://crafatar.com/renders/body/${uuid}?overlay=true&scale=4`;
    res.json({ username: data.name, uuid, skinUrl });
  } catch (err) {
    res.status(404).json({ message: 'Player not found' });
  }
});

app.get('/api/tiers/:username', async (req, res) => {
  try {
    const { data } = await axios.get(
      `https://mctiers.com/api/rankings/${encodeURIComponent(req.params.username)}`,
      { timeout: 8000 }
    );
    res.json(data);
  } catch (err) {
    res.status(404).json({ message: 'No tier data found' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`MC Vault server running on http://localhost:${PORT}`);
});
