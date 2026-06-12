const MAX_SLOTS = 10;
const STORAGE_KEY = 'mcvault_accounts';

const grid = document.getElementById('accountGrid');
const introBlock = document.getElementById('introBlock');
const capacityCount = document.getElementById('capacityCount');
const capacityPercent = document.getElementById('capacityPercent');
const capacityFill = document.getElementById('capacityFill');
const toast = document.getElementById('toast');

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const usernameInput = document.getElementById('usernameInput');
const modalError = document.getElementById('modalError');
const modalCancel = document.getElementById('modalCancel');
const modalSubmit = document.getElementById('modalSubmit');

const GAMEMODES = ['Sword', 'UHC', 'Pot', 'NethOp', 'SMP', 'Axe', 'Mace'];

let editingIndex = null; // null = adding new, number = editing existing

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

function showToast(message, duration = 3500) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function formatTier(value) {
  if (!value) return '—';
  return value;
}

function render() {
  const accounts = loadAccounts();
  grid.innerHTML = '';

  introBlock.style.display = accounts.length === 0 ? 'block' : 'none';

  accounts.forEach((acc, index) => {
    const card = document.createElement('div');
    card.className = 'account-card';

    const tiersHtml = GAMEMODES.map(mode => {
      const rank = acc.tiers?.[mode];
      return `
        <div class="tier-badge">
          <span class="tier-badge__mode">${mode}</span>
          <span class="tier-badge__rank">${formatTier(rank)}</span>
        </div>
      `;
    }).join('');

    const testedCount = GAMEMODES.filter(mode => acc.tiers?.[mode]).length;
    const tierPercent = Math.round((testedCount / GAMEMODES.length) * 100);

    card.innerHTML = `
      <div class="account-card__skin">
        ${acc.skinUrl
          ? `<img src="${acc.skinUrl}" alt="${acc.username} skin render" />`
          : `<span style="color:var(--text-faint); font-size:12px;">No skin</span>`
        }
        <div class="tier-meter" style="--pct: ${tierPercent}">
          <span>${tierPercent}%</span>
        </div>
      </div>
      <div class="account-card__name">${acc.username}</div>
      <div class="account-card__uuid">${acc.uuid || ''}</div>
      <div class="account-card__date">Added ${acc.addedDate}</div>
      <div class="tiers">${tiersHtml}</div>
      <div class="account-card__actions">
        <button class="icon-btn" data-action="edit" data-index="${index}">Edit</button>
        <button class="icon-btn" data-action="refresh" data-index="${index}">Refresh</button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-index="${index}">Remove</button>
      </div>
    `;

    grid.appendChild(card);
  });

  if (accounts.length < MAX_SLOTS) {
    const addCard = document.createElement('div');
    addCard.className = 'add-card';
    addCard.innerHTML = `
      <div class="add-card__circle">+</div>
      <div class="add-card__title">Add account</div>
      <div class="add-card__sub">${MAX_SLOTS - accounts.length} slot${MAX_SLOTS - accounts.length === 1 ? '' : 's'} remaining</div>
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
    const data = await res.json();
    return data.tiers || null;
  } catch {
    return null;
  }
}

async function lookupUsername(username) {
  const res = await fetch(`/api/lookup/${encodeURIComponent(username)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Lookup failed.');
  }
  return data;
}

function openModal(index) {
  editingIndex = index;
  modalError.textContent = '';
  usernameInput.value = '';

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
  usernameInput.focus();
}

function closeModal() {
  modalOverlay.classList.remove('show');
  editingIndex = null;
}

async function handleModalSubmit() {
  const username = usernameInput.value.trim();

  if (!username) {
    modalError.textContent = 'Please enter a username.';
    return;
  }

  modalError.textContent = '';
  modalSubmit.disabled = true;
  modalSubmit.textContent = 'Fetching...';

  try {
    const profile = await lookupUsername(username);
    const tiers = await fetchTiers(profile.username);

    const accounts = loadAccounts();

    const duplicate = accounts.some((a, i) => a.uuid === profile.uuid && i !== editingIndex);
    if (duplicate) {
      modalError.textContent = `${profile.username} is already in your vault.`;
      modalSubmit.disabled = false;
      modalSubmit.textContent = editingIndex === null ? 'Fetch & Save' : 'Update';
      return;
    }

    const entry = {
      username: profile.username,
      uuid: profile.uuid,
      skinUrl: profile.skinUrl,
      tiers: tiers || {},
      addedDate: editingIndex === null
        ? new Date().toISOString().split('T')[0]
        : accounts[editingIndex].addedDate,
    };

    if (editingIndex === null) {
      if (accounts.length >= MAX_SLOTS) {
        modalError.textContent = 'Vault is full (10/10).';
        modalSubmit.disabled = false;
        modalSubmit.textContent = 'Fetch & Save';
        return;
      }
      accounts.push(entry);
      showToast(`${profile.username} added to your vault.`);
    } else {
      accounts[editingIndex] = entry;
      showToast(`${profile.username} updated.`);
    }

    saveAccounts(accounts);
    render();
    closeModal();
  } catch (err) {
    modalError.textContent = err.message || 'Something went wrong.';
  } finally {
    modalSubmit.disabled = false;
    modalSubmit.textContent = editingIndex === null ? 'Fetch & Save' : 'Update';
  }
}

modalCancel.addEventListener('click', closeModal);
modalSubmit.addEventListener('click', handleModalSubmit);
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleModalSubmit();
});
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

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

  if (btn.dataset.action === 'edit') {
    openModal(index);
  }

  if (btn.dataset.action === 'refresh') {
    showToast(`Refreshing tiers for ${acc.username}...`);
    const tiers = await fetchTiers(acc.username);
    if (tiers) {
      accounts[index].tiers = tiers;
      saveAccounts(accounts);
      render();
      showToast(`Tiers updated for ${acc.username}.`);
    } else {
      showToast(`Could not refresh tiers for ${acc.username}.`);
    }
  }
});

render();
