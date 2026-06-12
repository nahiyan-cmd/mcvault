require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const { PORT = 3000 } = process.env;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/lookup/:username', async (req, res) => {
  const { username } = req.params;

  if (!username || username.length < 3 || username.length > 16 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'invalid_username', message: 'Invalid Minecraft username format.' });
  }

  try {
    const mojangRes = await axios.get(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
    );

    const uuid = mojangRes.data.id;
    const correctUsername = mojangRes.data.name;
    const skinUrl = `https://mc-heads.net/body/${uuid}`;

    res.json({ username: correctUsername, uuid, skinUrl });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'not_found', message: 'No Minecraft account found with that username.' });
    }
    console.error('Lookup failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'lookup_failed', message: 'Could not look up that username.' });
  }
});

app.get('/api/tiers/:username', async (req, res) => {
  const { username } = req.params;

  if (!username || username.length < 3 || username.length > 16 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'invalid_username', message: 'Invalid Minecraft username format.' });
  }

  try {
    const mojangRes = await axios.get(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
    );
    const uuid = mojangRes.data.id;

    // FIX: Mojang returns UUID without dashes — MCTiers requires dashes (8-4-4-4-12)
    const uuidDashed = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;

    const tiersRes = await axios.get(`https://mctiers.com/api/profile/${uuidDashed}`);
    const data = tiersRes.data;

    res.json({
      uuid,
      overall: data.tier || null,
      gameModes: data.gameModes || {},
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.json({ uuid: null, overall: null, gameModes: {}, unranked: true });
    }
    console.error('Tier lookup failed:', err.response?.data || err.message);
    res.status(500).json({
      error: 'tier_lookup_failed',
      message: 'Could not fetch tier data for this player.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`MC Vault server running on port ${PORT}`);
});
