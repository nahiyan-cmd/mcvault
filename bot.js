require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');

// ─── Config ───────────────────────────────────────────────────────────────────
const ALLOWED_USERS = ['1272203577158533255', '705047923137970226'];
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;
const API_BASE  = process.env.API_BASE || 'http://localhost:3000';
const BOT_SECRET = process.env.BOT_SECRET || 'mcvault_bot_secret';

const headers = { 'x-bot-secret': BOT_SECRET };

// ─── Slash command definitions ──────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('admin-list')
    .setDescription('List all MC Vault admins'),

  new SlashCommandBuilder()
    .setName('admin-create')
    .setDescription('Create a new MC Vault admin (max 2)')
    .addStringOption(o => o.setName('username').setDescription('Admin username').setRequired(true))
    .addStringOption(o => o.setName('password').setDescription('Admin password').setRequired(true))
    .addStringOption(o => o.setName('code').setDescription('Secret 6-digit code').setRequired(true)),

  new SlashCommandBuilder()
    .setName('admin-delete')
    .setDescription('Remove an MC Vault admin')
    .addStringOption(o => o.setName('username').setDescription('Admin username to remove').setRequired(true)),

  new SlashCommandBuilder()
    .setName('admin-edit')
    .setDescription('Edit an existing admin (password or code)')
    .addStringOption(o => o.setName('username').setDescription('Admin username to edit').setRequired(true))
    .addStringOption(o => o.setName('password').setDescription('New password').setRequired(false))
    .addStringOption(o => o.setName('code').setDescription('New 6-digit code').setRequired(false)),
].map(c => c.toJSON());

// ─── Register slash commands ──────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    console.log('Registering slash commands...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`Commands registered to guild ${GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Commands registered globally');
    }
  } catch (err) {
    console.error('Failed to register commands:', err.message);
  }
}

function isAllowed(userId) {
  return ALLOWED_USERS.includes(userId);
}

function denyEmbed() {
  return new EmbedBuilder()
    .setColor(0xd9534f)
    .setTitle('Access Denied')
    .setDescription('You are not authorized to use MC Vault admin commands.');
}

// ─── Bot setup ────────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`MC Vault Bot ready as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!isAllowed(interaction.user.id)) {
    return interaction.reply({ embeds: [denyEmbed()], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const { commandName } = interaction;

  // ── admin-list ──────────────────────────────────────────────────────────────
  if (commandName === 'admin-list') {
    try {
      const { data } = await axios.get(`${API_BASE}/api/bot/admins`, { headers });
      if (!data.length) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('MC Vault Admins').setDescription('No admins created yet.')]
        });
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('MC Vault Admins')
        .setDescription(`${data.length}/2 admin slots used`)
        .setTimestamp();
      data.forEach((a, i) => {
        embed.addFields({
          name: `Admin ${i + 1} — ${a.username}`,
          value: `Code: ${a.code}\nCreated: ${a.createdAt ? a.createdAt.split('T')[0] : 'unknown'}`,
          inline: false
        });
      });
      interaction.editReply({ embeds: [embed] });
    } catch (err) {
      interaction.editReply({ content: `Error: ${err.response?.data?.message || err.message}` });
    }
  }

  // ── admin-create ────────────────────────────────────────────────────────────
  if (commandName === 'admin-create') {
    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');
    const code = interaction.options.getString('code');

    if (!/^\d{6}$/.test(code)) {
      return interaction.editReply({ content: 'Code must be exactly 6 digits (e.g. 123456).' });
    }

    try {
      await axios.post(`${API_BASE}/api/bot/admins`, { username, password, code }, { headers });
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Admin Created')
        .addFields(
          { name: 'Username', value: username, inline: true },
          { name: 'Code', value: code, inline: true }
        )
        .setFooter({ text: 'Password stored securely (hashed)' })
        .setTimestamp();
      interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      if (err.response?.data?.error === 'max_reached') {
        interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Max Limit Reached').setDescription('MC Vault only allows 2 admins. Delete one first.')]
        });
      } else {
        interaction.editReply({ content: `Error: ${msg}` });
      }
    }
  }

  // ── admin-delete ────────────────────────────────────────────────────────────
  if (commandName === 'admin-delete') {
    const username = interaction.options.getString('username');
    try {
      await axios.delete(`${API_BASE}/api/bot/admins/${encodeURIComponent(username)}`, { headers });
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Admin Removed')
        .setDescription(`Admin ${username} has been deleted.`)
        .setTimestamp();
      interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      interaction.editReply({ content: `Error: ${msg}` });
    }
  }

  // ── admin-edit ──────────────────────────────────────────────────────────────
  if (commandName === 'admin-edit') {
    const username = interaction.options.getString('username');
    const newPassword = interaction.options.getString('password');
    const newCode = interaction.options.getString('code');

    if (!newPassword && !newCode) {
      return interaction.editReply({ content: 'Provide at least a new password or a new code.' });
    }
    if (newCode && !/^\d{6}$/.test(newCode)) {
      return interaction.editReply({ content: 'Code must be exactly 6 digits.' });
    }

    try {
      await axios.patch(`${API_BASE}/api/bot/admins/${encodeURIComponent(username)}`, {
        password: newPassword || undefined,
        code: newCode || undefined
      }, { headers });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Admin Updated')
        .addFields(
          { name: 'Username', value: username, inline: true },
          { name: 'Password', value: newPassword ? 'updated' : 'unchanged', inline: true },
          { name: 'Code', value: newCode ? 'updated' : 'unchanged', inline: true }
        )
        .setTimestamp();
      interaction.editReply({ embeds: [embed] });
    } catch (err) {
      interaction.editReply({ content: `Error: ${err.response?.data?.message || err.message}` });
    }
  }
});

registerCommands().then(() => client.login(BOT_TOKEN));
