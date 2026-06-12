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

const GAMEMODES = [
  { key: 'sword',        label: 'Sword'   },
  { key: 'uhc',          label: 'UHC'     },
  { key: 'diamondPot',   label: 'DiaPot'  },
  { key: 'netheritePot', label: 'NethPot' },
  { key: 'smp',          label: 'SMP'     },
  { key: 'diamondSmp',   label: 'DiaSMP'  },
  { key: 'axe',          label: 'Axe'     },
  { key: 'mace',         label: 'Mace'    },
  { key: 'crystal',      label: 'Crystal' },
  { key: 'cart',         label: 'Cart'    },
];

let editingIndex = null;
let isSubmitting = false;

// Track all skinview3d instances so we can dispose them on re-render
const skinViewers = [];

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
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

function render() {
  // Dispose existing 3D viewers before wiping the DOM
  skinViewers.forEach(v => { try { v.dispose(); } catch {} });
  skinViewers.length = 0;

  const accounts = loadAccounts();
  grid.innerHTML = '';

  introBlock.style.display = accounts.length === 0 ? 'block' : 'none';

  accounts.forEach((acc, index) => {
    const card = document.createElement('div');
    card.className = 'account-card';

    const gameModes = acc.gameModes || {};

    const tiersHtml = GAMEMODES.map(({ key, label }) => {
      const entry = gameModes[key];
      const tier = entry?.tier;
      // Colour the badge if ranked
      const ranked = !!tier;
      return `
        <div class="tier-badge${ranked ? ' tier-badge--ranked' : ''}">
          <span class="tier-badge__mode">${label}</span>
          <span class="tier-badge__rank">${tier || '—'}</span>
        </div>
      `;
    }).join('');

    const canvasId = `skin-canvas-${index}`;

    card.innerHTML = `
      <div class="account-card__skin">
        <canvas id="${canvasId}" class="skin-canvas"></canvas>
      </div>
      <div class="account-card__name">${acc.username}${acc.overall ? ` <span class="account-card__overall">(${acc.overall})</span>` : ''}</div>
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

    // Boot 3D skin viewer after the canvas is in the DOM
    requestAnimationFrame(() => {
      const canvas = document.getElementById(canvasId);
      if (!canvas || !window.skinview3d) return;

      const viewer = new skinview3d.SkinViewer({
        canvas,
        width: canvas.parentElement.clientWidth || 200,
        height: 200,
        skin: acc.skinUrl || 'https://mc-heads.net/skin/MHF_Steve',
      });

      viewer.controls.enableRotate = true;
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;
      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.8;
      viewer.animation = new skinview3d.IdleAnimation();
      viewer.renderer.setClearColor(0x000000, 0); // transparent background

      // Stop auto-rotate while user drags
      canvas.addEventListener('mousedown', () => { viewer.autoRotate = false; });
      canvas.addEventListener('touchstart', () => { viewer.autoRotate = false; }, { passive: true });

      skinViewers.push(viewer);
    });
  });

  if (accounts.length < MAX_SLOTS) {
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
  if (isSubmitting) return;
  const username = usernameInput.value.trim();
  if (!username) { modalError.textContent = 'Please enter a username.'; return; }
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    modalError.textContent = 'Usernames must be 3–16 characters (letters, numbers, underscores).';
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
    if (duplicate) {
      modalError.textContent = `${profile.username} is already in your vault.`;
      return;
    }

    const entry = {
      username: profile.username,
      uuid: profile.uuid,
      skinUrl: profile.skinUrl,
      gameModes: tierData?.gameModes || {},
      overall: tierData?.overall || null,
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
      const freshAccounts = loadAccounts();
      if (!freshAccounts[index]) return;
      if (profile) {
        freshAccounts[index].uuid = profile.uuid;
        freshAccounts[index].skinUrl = profile.skinUrl;
        freshAccounts[index].username = profile.username;
      }
      if (tierData) {
        freshAccounts[index].gameModes = tierData.gameModes || {};
        freshAccounts[index].overall = tierData.overall || null;
      }
      saveAccounts(freshAccounts);
      render();
      showToast(`${freshAccounts[index].username} refreshed.`);
    } catch {
      showToast(`Could not refresh ${acc.username}.`);
    }
  }
});

render();
