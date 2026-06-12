require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

// ─── MongoDB Connection ─────────────────────────────────────────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

// ─── Schemas ────────────────────────────────────────────────────────────────────
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  codeHash: { type: String, required: true },
  code: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const accountSchema = new mongoose.Schema({
  username: { type: String, required: true },
  uuid: { type: String, required: true },
  skinUrl: String,
  rankings: { type: Object, default: {} },
  leaderboardPos: Number,
  region: String,
  addedDate: String,
  order: { type: Number, default: 0 }
});

const Admin = mongoose.model('Admin', adminSchema);
const Account = mongoose.model('Account', accountSchema);

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

// ─── SETUP: Create first admin ──────────────────────────────────────────────────
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

  const existingCount = await Admin.countDocuments();
  
  // Remove existing same username
  await Admin.deleteOne({ username });

  const passwordHash = await bcrypt.hash(password, 12);
  const codeHash = await bcrypt.hash(code, 12);

  const admin = new Admin({
    username,
    passwordHash,
    codeHash,
    code
  });

  await admin.save();

  // Keep only 2 max
  const allAdmins = await Admin.find().sort({ createdAt: 1 });
  if (allAdmins.length > 2) {
    const toDelete = allAdmins.slice(0, allAdmins.length - 2);
    for (const a of toDelete) {
      await Admin.deleteOne({ _id: a._id });
    }
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, message: 'Admin created' });
});

// ─── LOGIN ──────────────────────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) {
    return res.status(400).json({ message: 'All fields required' });
  }

  const admin = await Admin.findOne({ username });
  if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

  const validPass = await bcrypt.compare(password, admin.passwordHash);
  const validCode = await bcrypt.compare(code, admin.codeHash);

  if (!validPass || !validCode) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ username: admin.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

// ─── LIST ADMINS ────────────────────────────────────────────────────────────────
app.get('/api/admins', adminAuth, async (req, res) => {
  const admins = await Admin.find({}, { passwordHash: 0, codeHash: 0 });
  res.json(admins.map(a => ({
    username: a.username,
    code: a.code,
    createdAt: a.createdAt
  })));
});

// ─── CREATE ADMIN ─────────────────────────────────────────────────────────────────
app.post('/api/admins', adminAuth, async (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password || !code) {
    return res.status(400).json({ message: 'All fields required' });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Code must be 6 digits' });
  }

  const count = await Admin.countDocuments();
  if (count >= 2) {
    return res.status(400).json({ message: 'Max 2 admins reached' });
  }

  const exists = await Admin.findOne({ username });
  if (exists) {
    return res.status(400).json({ message: 'Admin already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const codeHash = await bcrypt.hash(code, 12);

  const admin = new Admin({
    username,
    passwordHash,
    codeHash,
    code
  });

  await admin.save();
  res.status(201).json({ message: 'Admin created' });
});

// ─── DELETE ADMIN ─────────────────────────────────────────────────────────────────
app.delete('/api/admins/:username', adminAuth, async (req, res) => {
  const count = await Admin.countDocuments();
  if (count <= 1) {
    return res.status(400).json({ message: 'Cannot delete the last admin' });
  }

  const result = await Admin.deleteOne({ username: req.params.username });
  if (result.deletedCount === 0) {
    return res.status(404).json({ message: 'Admin not found' });
  }

  res.json({ message: 'Admin deleted' });
});

// ─── EDIT ADMIN ───────────────────────────────────────────────────────────────────
app.patch('/api/admins/:username', adminAuth, async (req, res) => {
  const { password, code } = req.body;
  const admin = await Admin.findOne({ username: req.params.username });
  if (!admin) return res.status(404).json({ message: 'Admin not found' });

  if (password) admin.passwordHash = await bcrypt.hash(password, 12);
  if (code) {
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Code must be 6 digits' });
    admin.code = code;
    admin.codeHash = await bcrypt.hash(code, 12);
  }

  await admin.save();
  res.json({ message: 'Admin updated' });
});

// ─── CHECK SETUP STATUS ───────────────────────────────────────────────────────────
app.get('/api/setup-status', async (req, res) => {
  const count = await Admin.countDocuments();
  res.json({ setupComplete: count > 0, adminCount: count });
});

// ─── RESET ALL ADMINS (temporary, remove after use) ───────────────────────────────
app.get('/api/reset-admins', async (req, res) => {
  await Admin.deleteMany({});
  await Account.deleteMany({});
  res.json({ message: 'All data cleared' });
});

// ─── ACCOUNTS API (cloud synced) ──────────────────────────────────────────────────
app.get('/api/accounts', async (req, res) => {
  const accounts = await Account.find().sort({ order: 1 });
  res.json(accounts);
});

app.post('/api/accounts', adminAuth, async (req, res) => {
  const { username, uuid, skinUrl, rankings, leaderboardPos, region, addedDate } = req.body;
  if (!username || !uuid) {
    return res.status(400).json({ message: 'Username and UUID required' });
  }

  const count = await Account.countDocuments();
  if (count >= 10) {
    return res.status(400).json({ message: 'Vault is full (10/10)' });
  }

  const exists = await Account.findOne({ uuid: uuid.toLowerCase() });
  if (exists) {
    return res.status(400).json({ message: 'Account already in vault' });
  }

  const account = new Account({
    username,
    uuid: uuid.toLowerCase(),
    skinUrl,
    rankings: rankings || {},
    leaderboardPos,
    region,
    addedDate,
    order: count
  });

  await account.save();
  res.status(201).json(account);
});

app.put('/api/accounts/:id', adminAuth, async (req, res) => {
  const { username, uuid, skinUrl, rankings, leaderboardPos, region } = req.body;
  const account = await Account.findById(req.params.id);
  if (!account) return res.status(404).json({ message: 'Account not found' });

  if (username) account.username = username;
  if (uuid) account.uuid = uuid.toLowerCase();
  if (skinUrl) account.skinUrl = skinUrl;
  if (rankings) account.rankings = rankings;
  if (leaderboardPos !== undefined) account.leaderboardPos = leaderboardPos;
  if (region) account.region = region;

  await account.save();
  res.json(account);
});

app.delete('/api/accounts/:id', adminAuth, async (req, res) => {
  await Account.findByIdAndDelete(req.params.id);
  res.json({ message: 'Account deleted' });
});

app.delete('/api/accounts', adminAuth, async (req, res) => {
  await Account.deleteMany({});
  res.json({ message: 'All accounts cleared' });
});

// ─── MINECRAFT API PROXIES ────────────────────────────────────────────────────────
app.get('/api/lookup/:username', async (req, res) => {
  try {
    const { data } = await require('axios').get(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(req.params.username)}`,
      { timeout: 5000 }
    );
    const uuid = data.id;
    const skinUrl = `https://crafatar.com/renders/body/${uuid}?overlay=true&scale=4&default=MHF_Steve`;
    res.json({ username: data.name, uuid, skinUrl });
  } catch (err) {
    res.status(404).json({ message: 'Player not found' });
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

// ─── HEALTH ───────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`MC Vault running on port ${PORT}`);
});
