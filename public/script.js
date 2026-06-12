const MAX_SLOTS = 10;
const STORAGE_KEY = 'mcvault_accounts';

const grid = document.getElementById('accountGrid');
const introBlock = document.getElementById('introBlock');
const capacityCount = document.getElementById('capacityCount');
const capacityPercent = document.getElementById('capacityPercent');
const capacityFill = document.getElementById('capacityFill');
const toast = document.getElementById('toast');

const GAMEMODES = ['Sword', 'UHC', 'Pot', 'NethOp', 'SMP', 'Axe', 'Mace'];

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
        <button class="icon-btn" data-action="refresh" data-index="${index}">Refresh Tiers</button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-index="${index}">Remove</button>
      </div>
    `;

    grid.appendChild(card);
  });

  if (accounts.length < MAX_SLOTS) {
    const addCard = document.createElement('div');
    addCard.className = 'add-card';
    addCard.id = 'addCard';
    addCard.innerHTML = `
      <div class="add-card__circle">+</div>
      <div class="add-card__title">Add account</div>
      <div class="add-card__sub">${MAX_SLOTS - accounts.length} slot${MAX_SLOTS - accounts.length === 1 ? '' : 's'} remaining</div>
    `;
    addCard.addEventListener('click', handleAddAccount);
    grid.appendChild(addCard);
  }

  const percent = Math.round((accounts.length / MAX_SLOTS) * 100);
  capacityCount.textContent = `${accounts.length}/${MAX_SLOTS} accounts`;
  capacityPercent.textContent = `${percent}% full`;
  capacityFill.style.width = `${percent}%`;
}

function handleAddAccount() {
  window.location.href = '/api/auth/login';
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

async function checkPendingLogin() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('auth_error')) {
    const reasons = {
      no_minecraft_profile: "That Microsoft account doesn't own Minecraft, or has no profile set up.",
      unauthorized: 'Login was not authorized. Please try again.',
      missing_code: 'Login was cancelled.',
    };
    showToast(reasons[params.get('auth_error')] || 'Login failed. Please try again.');
    history.replaceState({}, '', window.location.pathname);
    return;
  }

  if (params.get('login') !== 'success') return;

  history.replaceState({}, '', window.location.pathname);

  const res = await fetch('/api/auth/pending');
  const data = await res.json();

  if (!data.profile) {
    showToast('Could not retrieve account info. Please try again.');
    return;
  }

  const accounts = loadAccounts();

  if (accounts.length >= MAX_SLOTS) {
    showToast('Vault is full (10/10). Remove an account before adding another.');
    return;
  }

  if (accounts.some(a => a.uuid === data.profile.uuid)) {
    showToast(`${data.profile.username} is already in your vault.`);
    return;
  }

  showToast(`Fetching tier data for ${data.profile.username}...`);

  const tiers = await fetchTiers(data.profile.username);

  accounts.push({
    username: data.profile.username,
    uuid: data.profile.uuid,
    skinUrl: data.profile.skinUrl,
    tiers: tiers || {},
    addedDate: new Date().toISOString().split('T')[0],
  });

  saveAccounts(accounts);
  render();
  showToast(`${data.profile.username} added to your vault.`);
}

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
checkPendingLogin();
