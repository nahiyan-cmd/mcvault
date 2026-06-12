const MAX_SLOTS = 10;
const STORAGE_KEY = 'mcvault_accounts';

const grid = document.getElementById('accountGrid');
const introBlock = document.getElementById('introBlock');
const capacityCount = document.getElementById('capacityCount');
const capacityPercent = document.getElementById('capacityPercent');
const capacityFill = document.getElementById('capacityFill');
const toast = document.getElementById('toast');
const adminBadge = document.getElementById('adminBadge');
const adminBadgeName = document.getElementById('adminBadgeName');
const logoutBtn = document.getElementById('logoutBtn');
const adminFooterLink = document.getElementById('adminFooterLink');

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const usernameInput = document.getElementById('usernameInput');
const modalError = document.getElementById('modalError');
const modalCancel = document.getElementById('modalCancel');
const modalSubmit = document.getElementById('modalSubmit');

const GAMEMODES = [
  { key: 'sword',     label: 'Sword'   },
  { key: 'uhc',       label: 'UHC'     },
  { key: 'pot',       label: 'DiaPot'  },
  { key: 'netherPot', label: 'NethPot' },
  { key: 'smp',       label: 'SMP'     },
  { key: 'axe',       label: 'Axe'     },
  { key: 'mace',      label: 'Mace'    },
  { key: 'vanilla',   label: 'Crystal' },
  { key: 'cart',      label: 'Cart'    },
];

function formatTier(ranking) {
  if (!ranking) return null;
  if (ranking.retired) return null;
  const ht = ranking.pos === 0 ? 'HT' : 'LT';
  return `${ht}${ranking.tier}`;
}

let editingIndex = null;
let isSubmitting = false;

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveAccounts(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

let toastTimer = null;
function showToast(message, duration = 3500) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => { toast.classList.remove('show'); toastTimer = null; }, duration);
}

function isAdmin() {
  return !!localStorage.getItem('mcvault_token');
}

function getAuthHeaders() {
  const token = localStorage.getItem('mcvault_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function updateAdminUI() {
  const token = localStorage.getItem('mcvault_token');
  const name = localStorage.getItem('mcvault_admin_name');
  if (token && name) {
    adminBadge.style.display = 'flex';
    adminBadgeName.textContent = name;
    adminFooterLink.style.display = 'none';
  } else {
    adminBadge.style.display = 'none';
    adminFooterLink.style.display = 'inline';
  }
}

function render() {
  const accounts = loadAccounts();
  grid.innerHTML = '';
  introBlock.style.display = accounts.length === 0 ? 'block' : 'none';

  accounts.forEach((acc, index) => {
    const card = document.createElement('div');
    card.className = 'account-card';

    const rankings = acc.rankings || {};

    const tiersHtml = GAMEMODES.map(({ key, label }) => {
      const ranking = rankings[key];
      const tierStr = formatTier(ranking);
      if (!tierStr) return '';
      const tierNum = ranking.tier;
      return `
        <div class="tier-badge tier-badge--ranked tier-${tierNum}">
          <span class="tier-badge__mode">${label}</span>
          <span class="tier-badge__rank">${tierStr}</span>
        </div>
      `;
    }).join('');

    const allTiers = GAMEMODES.map(({ key }) => rankings[key]).filter(Boolean).filter(r => !r.retired);
    const bestTier = allTiers.sort((a, b) => {
      const ta = Number(a.tier), tb = Number(b.tier);
      if (ta !== tb) return ta - tb;
      return Number(a.pos) - Number(b.pos);
    })[0];
    const bestTierStr = bestTier ? formatTier(bestTier) : null;
    const isGM = allTiers.some(r => Number(r.tier) === 1 && Number(r.pos) === 0);

    card.innerHTML = `
      <div class="account-card__skin">
        <img src="${acc.skinUrl || ''}" alt="${acc.username}" onerror="this.style.display='none'" />
      </div>
      <div class="account-card__name">
        ${acc.username}
        ${isGM ? `<span class="account-card__gm">GM</span>` : ''}
        ${bestTierStr ? `<span class="account-card__overall">${bestTierStr}</span>` : ''}
        ${acc.region ? `<span class="account-card__region">${acc.region}</span>` : ''}
      </div>
      <div class="account-card__uuid">${acc.uuid || ''}</div>
      <div class="account-card__date">Added ${acc.addedDate}</div>
      <div class="section-label">MCTiers</div>
      <div class="tiers">${tiersHtml || '<span class="tiers__empty">No gamemode tested</span>'}</div>
      <div class="rainbow-divider"></div>
      <div class="section-label">PvPTiers</div>
      <div class="pvptiers-status">Under Maintenance</div>
      ${isAdmin() ? `
      <div class="account-card__actions">
        <button class="icon-btn" data-action="edit" data-index="${index}">Edit</button>
        <button class="icon-btn" data-action="refresh" data-index="${index}">Refresh</button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-index="${index}">Remove</button>
      </div>` : ''}
    `;
    grid.appendChild(card);
  });

  if (accounts.length < MAX_SLOTS && isAdmin()) {
    const addCard = document.createElement('div');
    addCard.className = 'add-card';
    const remaining = MAX_SLOTS - accounts.length;
    addCard.innerHTML = `
      <div class="add-card__circle">+</div>
      <div class="add-card__title">Add account</div>
      <div class="add-card__sub">${remaining} slot${remaining === 1 ? '' : 's'} remaining</div>
    `;
    addCard.addEventListener('click', () => openModal(null));
    grid.appendChild(addCard);
  }

  const percent = Math.round((accounts.length / MAX_SLOTS) * 100);
  capacityCount.textContent = `${accounts.length}/${MAX_SLOTS} accounts`;
  capacityPercent.textContent = `${percent}% full`;
  capacityFill.style.width = `${percent}%`;
}

async function fetchTiers(username) {
  try {
    const res = await fetch(`/api/tiers/${encodeURIComponent(username)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function lookupUsername(username) {
  const res = await fetch(`/api/lookup/${encodeURIComponent(username)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Lookup failed.');
  return data;
}

function openModal(index) {
  if (!isAdmin()) return;
  editingIndex = index;
  isSubmitting = false;
  modalError.textContent = '';
  usernameInput.value = '';
  modalSubmit.disabled = false;
  if (index === null) {
    modalTitle.textContent = 'Add Account';
    modalSubmit.textContent = 'Fetch & Save';
  } else {
    const accounts = loadAccounts();
    modalTitle.textContent = 'Edit Account';
    modalSubmit.textContent = 'Update';
    usernameInput.value = accounts[index].username;
  }
  modalOverlay.classList.add('show');
  setTimeout(() => usernameInput.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.remove('show');
  editingIndex = null;
  isSubmitting = false;
}

async function handleModalSubmit() {
  if (isSubmitting || !isAdmin()) return;
  const username = usernameInput.value.trim();
  if (!username) { modalError.textContent = 'Please enter a username.'; return; }
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    modalError.textContent = 'Usernames must be 3-16 characters (letters, numbers, underscores).';
    return;
  }

  modalError.textContent = '';
  isSubmitting = true;
  modalSubmit.disabled = true;
  modalSubmit.textContent = 'Fetching...';
  const currentEditingIndex = editingIndex;

  try {
    const profile = await lookupUsername(username);
    const tierData = await fetchTiers(profile.username);

    const accounts = loadAccounts();
    const normalizedUUID = profile.uuid.toLowerCase();
    const duplicate = accounts.some((a, i) => a.uuid.toLowerCase() === normalizedUUID && i !== currentEditingIndex);
    if (duplicate) { modalError.textContent = `${profile.username} is already in your vault.`; return; }

    const entry = {
      username: profile.username,
      uuid: profile.uuid,
      skinUrl: profile.skinUrl,
      rankings: tierData?.rankings || {},
      leaderboardPos: tierData?.leaderboardPos || null,
      region: tierData?.region || null,
      addedDate: currentEditingIndex === null
        ? new Date().toISOString().split('T')[0]
        : accounts[currentEditingIndex].addedDate,
    };

    if (currentEditingIndex === null) {
      if (accounts.length >= MAX_SLOTS) { modalError.textContent = 'Vault is full (10/10).'; return; }
      accounts.push(entry);
      showToast(`${profile.username} added to your vault.`);
    } else {
      accounts[currentEditingIndex] = entry;
      showToast(`${profile.username} updated.`);
    }

    saveAccounts(accounts);
    render();
    closeModal();
  } catch (err) {
    modalError.textContent = err.message || 'Something went wrong.';
  } finally {
    isSubmitting = false;
    modalSubmit.disabled = false;
    modalSubmit.textContent = currentEditingIndex === null ? 'Fetch & Save' : 'Update';
  }
}

modalCancel.addEventListener('click', closeModal);
modalSubmit.addEventListener('click', handleModalSubmit);
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleModalSubmit(); });
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

grid.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const index = Number(btn.dataset.index);
  const accounts = loadAccounts();
  const acc = accounts[index];
  if (!acc) return;

  if (btn.dataset.action === 'delete') {
    accounts.splice(index, 1);
    saveAccounts(accounts);
    render();
    showToast(`${acc.username} removed from vault.`);
  }

  if (btn.dataset.action === 'edit') openModal(index);

  if (btn.dataset.action === 'refresh') {
    btn.disabled = true;
    btn.textContent = '...';
    showToast(`Refreshing ${acc.username}...`);
    try {
      const [profile, tierData] = await Promise.all([
        lookupUsername(acc.username).catch(() => null),
        fetchTiers(acc.username),
      ]);
      const fresh = loadAccounts();
      if (!fresh[index]) return;
      if (profile) {
        fresh[index].uuid = profile.uuid;
        fresh[index].skinUrl = profile.skinUrl;
        fresh[index].username = profile.username;
      }
      if (tierData) {
        fresh[index].rankings = tierData.rankings || {};
        fresh[index].leaderboardPos = tierData.leaderboardPos || null;
        fresh[index].region = tierData.region || null;
      }
      saveAccounts(fresh);
      render();
      showToast(`${fresh[index].username} refreshed.`);
    } catch {
      showToast(`Could not refresh ${acc.username}.`);
    }
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('mcvault_token');
  localStorage.removeItem('mcvault_admin_name');
  updateAdminUI();
  render();
  showToast('Logged out.');
});

updateAdminUI();
render();
