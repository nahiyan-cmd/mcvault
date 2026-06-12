const MAX_SLOTS = 10;

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

const adminModalOverlay = document.getElementById('adminModalOverlay');
const adminList = document.getElementById('adminList');
const createAdminForm = document.getElementById('createAdminForm');
const showCreateForm = document.getElementById('showCreateForm');
const cancelCreateAdmin = document.getElementById('cancelCreateAdmin');
const submitCreateAdmin = document.getElementById('submitCreateAdmin');
const closeAdminModal = document.getElementById('closeAdminModal');
const adminModalError = document.getElementById('adminModalError');

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

let editingId = null;
let isSubmitting = false;
let accountsCache = [];

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

function getSkinUrl(uuid) {
  if (!uuid) return '';
  return `https://crafatar.com/renders/body/${uuid}?overlay=true&scale=4&default=MHF_Steve`;
}

function handleSkinError(img) {
  img.onerror = null;
  img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%23222"/%3E%3Ctext x="32" y="36" text-anchor="middle" fill="%23666" font-size="24"%3F%3C/text%3E%3C/svg%3E';
  img.style.opacity = '0.5';
}

function render(accounts) {
  accountsCache = accounts || [];
  grid.innerHTML = '';
  introBlock.style.display = accountsCache.length === 0 ? 'block' : 'none';

  accountsCache.forEach((acc) => {
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

    const skinUrl = getSkinUrl(acc.uuid);

    card.innerHTML = `
      <div class="account-card__skin">
        <img src="${skinUrl}" alt="${acc.username}" onerror="handleSkinError(this)" />
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
        <button class="icon-btn" data-action="edit" data-id="${acc._id}">Edit</button>
        <button class="icon-btn" data-action="refresh" data-id="${acc._id}" data-username="${acc.username}">Refresh</button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${acc._id}" data-username="${acc.username}">Remove</button>
      </div>` : ''}
    `;
    grid.appendChild(card);
  });

  if (accountsCache.length < MAX_SLOTS && isAdmin()) {
    const addCard = document.createElement('div');
    addCard.className = 'add-card';
    const remaining = MAX_SLOTS - accountsCache.length;
    addCard.innerHTML = `
      <div class="add-card__circle">+</div>
      <div class="add-card__title">Add account</div>
      <div class="add-card__sub">${remaining} slot${remaining === 1 ? '' : 's'} remaining</div>
    `;
    addCard.addEventListener('click', () => openModal(null));
    grid.appendChild(addCard);
  }

  const percent = Math.round((accountsCache.length / MAX_SLOTS) * 100);
  capacityCount.textContent = `${accountsCache.length}/${MAX_SLOTS} accounts`;
  capacityPercent.textContent = `${percent}% full`;
  capacityFill.style.width = `${percent}%`;
}

async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts');
    if (!res.ok) throw new Error('Failed to load');
    const accounts = await res.json();
    render(accounts);
  } catch (err) {
    showToast('Failed to load accounts');
    render([]);
  }
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

function openModal(id) {
  if (!isAdmin()) return;
  editingId = id;
  isSubmitting = false;
  modalError.textContent = '';
  usernameInput.value = '';
  modalSubmit.disabled = false;
  if (id === null) {
    modalTitle.textContent = 'Add Account';
    modalSubmit.textContent = 'Fetch & Save';
  } else {
    const acc = accountsCache.find(a => a._id === id);
    modalTitle.textContent = 'Edit Account';
    modalSubmit.textContent = 'Update';
    usernameInput.value = acc ? acc.username : '';
  }
  modalOverlay.classList.add('show');
  setTimeout(() => usernameInput.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.remove('show');
  editingId = null;
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

  try {
    const profile = await lookupUsername(username);
    const tierData = await fetchTiers(profile.username);

    const entry = {
      username: profile.username,
      uuid: profile.uuid,
      skinUrl: profile.skinUrl,
      rankings: tierData?.rankings || {},
      leaderboardPos: tierData?.leaderboardPos || null,
      region: tierData?.region || null,
      addedDate: new Date().toISOString().split('T')[0]
    };

    if (editingId === null) {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to add');
      }
      showToast(`${profile.username} added to your vault.`);
    } else {
      const res = await fetch(`/api/accounts/${editingId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update');
      }
      showToast(`${profile.username} updated.`);
    }

    await loadAccounts();
    closeModal();
  } catch (err) {
    modalError.textContent = err.message || 'Something went wrong.';
  } finally {
    isSubmitting = false;
    modalSubmit.disabled = false;
    modalSubmit.textContent = editingId === null ? 'Fetch & Save' : 'Update';
  }
}

modalCancel.addEventListener('click', closeModal);
modalSubmit.addEventListener('click', handleModalSubmit);
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleModalSubmit(); });
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

grid.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const username = btn.dataset.username;

  if (btn.dataset.action === 'delete') {
    if (!confirm(`Remove ${username} from vault?`)) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Delete failed');
      showToast(`${username} removed from vault.`);
      await loadAccounts();
    } catch (err) {
      showToast(err.message);
    }
  }

  if (btn.dataset.action === 'edit') openModal(id);

  if (btn.dataset.action === 'refresh') {
    btn.disabled = true;
    btn.textContent = '...';
    showToast(`Refreshing ${username}...`);
    try {
      const [profile, tierData] = await Promise.all([
        lookupUsername(username).catch(() => null),
        fetchTiers(username),
      ]);
      
      const update = {};
      if (profile) {
        update.username = profile.username;
        update.uuid = profile.uuid;
        update.skinUrl = profile.skinUrl;
      }
      if (tierData) {
        update.rankings = tierData.rankings || {};
        update.leaderboardPos = tierData.leaderboardPos || null;
        update.region = tierData.region || null;
      }

      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
      });
      
      if (!res.ok) throw new Error('Refresh failed');
      showToast(`${username} refreshed.`);
      await loadAccounts();
    } catch (err) {
      showToast(`Could not refresh ${username}.`);
    }
  }
});

// ─── Admin Management ───────────────────────────────────────────────────────────

function openAdminModal() {
  if (!isAdmin()) {
    window.location.href = '/admin-login.html';
    return;
  }
  adminModalOverlay.classList.add('show');
  loadAdminList();
}

async function loadAdminList() {
  try {
    const res = await fetch('/api/admins', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load admins');
    const admins = await res.json();
    
    if (admins.length === 0) {
      adminList.innerHTML = '<div style="color: var(--text-faint); font-size: 12px; text-align: center; padding: 12px;">No admins found</div>';
      showCreateForm.style.display = 'block';
      return;
    }
    
    adminList.innerHTML = admins.map(a => `
      <div class="admin-item">
        <div class="admin-item__info">
          <strong>${a.username}</strong>
          <div class="admin-item__code">Code: ${a.code}</div>
        </div>
        ${admins.length > 1 ? `
        <div class="admin-item__actions">
          <button class="admin-item__btn" onclick="deleteAdmin('${a.username}')">Delete</button>
        </div>` : ''}
      </div>
    `).join('');
    
    const canCreate = admins.length < 2;
    showCreateForm.style.display = canCreate ? 'block' : 'none';
    if (!canCreate) createAdminForm.style.display = 'none';
  } catch (err) {
    adminList.innerHTML = `<div class="modal__error">${err.message}</div>`;
  }
}

async function deleteAdmin(username) {
  if (!confirm(`Delete admin ${username}?`)) return;
  try {
    const res = await fetch(`/api/admins/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Admin deleted');
    loadAdminList();
  } catch (err) {
    showToast(err.message);
  }
}

showCreateForm.addEventListener('click', () => {
  createAdminForm.style.display = 'block';
  showCreateForm.style.display = 'none';
  adminModalError.textContent = '';
});

cancelCreateAdmin.addEventListener('click', () => {
  createAdminForm.style.display = 'none';
  loadAdminList();
});

submitCreateAdmin.addEventListener('click', async () => {
  const username = document.getElementById('newAdminUser').value.trim();
  const password = document.getElementById('newAdminPass').value;
  const code = document.getElementById('newAdminCode').value.trim();

  if (!username || !password || !code) {
    adminModalError.textContent = 'All fields required';
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    adminModalError.textContent = 'Code must be 6 digits';
    return;
  }

  submitCreateAdmin.disabled = true;
  submitCreateAdmin.textContent = 'Creating...';
  adminModalError.textContent = '';

  try {
    const res = await fetch('/api/admins', {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    
    showToast('Admin created successfully');
    document.getElementById('newAdminUser').value = '';
    document.getElementById('newAdminPass').value = '';
    document.getElementById('newAdminCode').value = '';
    createAdminForm.style.display = 'none';
    loadAdminList();
  } catch (err) {
    adminModalError.textContent = err.message;
  } finally {
    submitCreateAdmin.disabled = false;
    submitCreateAdmin.textContent = 'Create';
  }
});

closeAdminModal.addEventListener('click', () => {
  adminModalOverlay.classList.remove('show');
});

adminModalOverlay.addEventListener('click', (e) => {
  if (e.target === adminModalOverlay) adminModalOverlay.classList.remove('show');
});

document.querySelector('.brand__mark').addEventListener('dblclick', openAdminModal);

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('mcvault_token');
  localStorage.removeItem('mcvault_admin_name');
  updateAdminUI();
  loadAccounts();
  showToast('Logged out.');
});

updateAdminUI();
loadAccounts();
