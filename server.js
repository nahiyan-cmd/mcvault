require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const { PORT = 3000 } = process.env;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Look up a Minecraft username -> uuid (and skin url via crafatar)
app.get('/api/lookup/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const mojangRes = await axios.get(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
    );

    const uuid = mojangRes.data.id;
    const correctUsername = mojangRes.data.name;
    const skinUrl = `https://crafatar.com/renders/body/${uuid}`;

    res.json({ username: correctUsername, uuid, skinUrl });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'not_found', message: 'No Minecraft account found with that username.' });
    }
    console.error('Lookup failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'lookup_failed', message: 'Could not look up that username.' });
  }
});

// Fetch MCTiers / PvP tier data for a username
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
