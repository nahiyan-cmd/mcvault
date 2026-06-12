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
    const skinUrl = `https://crafatar.com/renders/body/${uuid}?overlay`;
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

    const uuidDashed = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
    console.log(`[tiers] ${username} => ${uuidDashed}`);

    const tiersRes = await axios.get(`https://mctiers.com/api/profile/${uuidDashed}`);
    const data = tiersRes.data;
    console.log(`[tiers] raw response for ${username}:`, JSON.stringify(data));

    res.json({
      uuid,
      rankings: data.rankings || {},
      leaderboardPos: data.overall || null,
      region: data.region || null,
    });
  } catch (err) {
    if (err.response?.status === 404) {
      console.log(`[tiers] ${username} not ranked on MCTiers`);
      return res.json({ uuid: null, rankings: {}, leaderboardPos: null, region: null });
    }
    console.error('[tiers] failed:', err.response?.status, err.response?.data || err.message);
    res.status(500).json({ error: 'tier_lookup_failed', message: 'Could not fetch tier data.' });
  }
});

app.listen(PORT, () => {
  console.log(`MC Vault server running on port ${PORT}`);
});
