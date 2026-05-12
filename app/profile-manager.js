// profile-manager.js
// Manages user profile selection, creation, and switching
// @ts-check
import { getCurrentUser, setCurrentUser, clearCurrentUser } from './schema-registry.js';

const PROFILES_KEY = 'jb-profiles';

// ── Storage helpers ───────────────────────────────────────────────────────────

function getAllProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveProfiles(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

/**
 * Adds a new profile. Returns { success, error }.
 * @param {string} name
 * @returns {{ success: boolean, error?: string }}
 */
function addProfile(name) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized) return { success: false, error: 'Name cannot be empty.' };
  if (normalized.length < 2) return { success: false, error: 'Name must be at least 2 characters.' };

  const profiles = getAllProfiles();
  if (profiles.includes(normalized)) {
    return { success: false, error: `Profile "${normalized}" already exists. Please choose a different name.` };
  }

  profiles.push(normalized);
  saveProfiles(profiles);
  return { success: true, name: normalized };
}

// ── UI ────────────────────────────────────────────────────────────────────────

/**
 * Call once on DOMContentLoaded.
 * Ensures current user is in the profiles list, renders the button,
 * and — if no user is set — opens the first-run modal immediately.
 */
export function initProfileManager() {
  // Sync current user into profiles list (migration / first run)
  const current = getCurrentUser();
  if (current) {
    const profiles = getAllProfiles();
    if (!profiles.includes(current)) {
      profiles.push(current);
      saveProfiles(profiles);
    }
  }

  renderProfileButton();

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#profileBtn') && !e.target.closest('#profileDropdown')) {
      closeDropdown();
    }
  });

  // If no user yet, show the first-run overlay
  if (!getCurrentUser()) {
    showFirstRunModal();
  }
}

/** Re-renders the button label / avatar. */
export function renderProfileButton() {
  const btn = document.getElementById('profileBtn');
  if (!btn) return;

  const current = getCurrentUser();
  const initials = current
    ? current.replace(/_/g, ' ').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  btn.innerHTML = `
    <span class="profile-avatar">${initials}</span>
    <span class="profile-btn-name">${current ? current.replace(/_/g, ' ') : 'Profile'}</span>
    <span class="profile-chevron">▾</span>
  `;
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

function toggleDropdown() {
  if (document.getElementById('profileDropdown')) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function closeDropdown() {
  document.getElementById('profileDropdown')?.remove();
}

function openDropdown() {
  const btn = document.getElementById('profileBtn');
  if (!btn) return;

  const current   = getCurrentUser();
  const profiles  = getAllProfiles();
  const rect      = btn.getBoundingClientRect();

  const panel = document.createElement('div');
  panel.id        = 'profileDropdown';
  panel.className = 'profile-dropdown';
  panel.style.top   = (rect.bottom + window.scrollY + 6) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';

  // ── Header ────────────────────────────────────────────────────────────────
  const initials = current
    ? current.replace(/_/g, ' ').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  panel.innerHTML = `
    <div class="profile-dd-header">
      <div class="profile-dd-avatar">${initials}</div>
      <div>
        <div class="profile-dd-name">${current ? current.replace(/_/g, ' ') : 'No profile selected'}</div>
        <div class="profile-dd-sub">Active profile</div>
      </div>
    </div>
    <hr class="profile-divider">
  `;

  // ── Profile list ──────────────────────────────────────────────────────────
  if (profiles.length > 0) {
    const listWrap = document.createElement('div');
    listWrap.innerHTML = `<div class="profile-section-label">Switch Profile</div>`;

    profiles.forEach(profile => {
      const displayName = profile.replace(/_/g, ' ');
      const av = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const isActive = profile === current;

      const item = document.createElement('div');
      item.className = 'profile-list-item' + (isActive ? ' active' : '');
      item.innerHTML = `
        <span class="profile-list-avatar">${av}</span>
        <span class="profile-list-name">${displayName}</span>
        ${isActive ? '<span class="profile-list-check">✓</span>' : ''}
      `;
      if (!isActive) {
        item.addEventListener('click', () => switchProfile(profile));
      }
      listWrap.appendChild(item);
    });

    panel.appendChild(listWrap);

    const div = document.createElement('hr');
    div.className = 'profile-divider';
    panel.appendChild(div);
  }

  // ── New profile form ──────────────────────────────────────────────────────
  const newWrap = document.createElement('div');
  newWrap.className = 'profile-new-section';
  newWrap.innerHTML = `
    <div class="profile-section-label">New Profile</div>
    <div class="profile-new-row">
      <input type="text" id="profileNewInput" class="profile-new-input"
             placeholder="Enter username" maxlength="30"
             autocomplete="off" spellcheck="false">
      <button id="profileAddBtn" class="profile-add-btn">Add</button>
    </div>
    <div id="profileAddError" class="profile-add-error" style="display:none;"></div>
  `;
  panel.appendChild(newWrap);

  document.body.appendChild(panel);

  // Focus the input
  setTimeout(() => document.getElementById('profileNewInput')?.focus(), 60);

  // Event listeners
  document.getElementById('profileAddBtn').addEventListener('click', handleAddProfile);
  document.getElementById('profileNewInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  handleAddProfile();
    if (e.key === 'Escape') closeDropdown();
    // Clear error on typing
    document.getElementById('profileAddError').style.display = 'none';
  });
}

function handleAddProfile() {
  const input    = document.getElementById('profileNewInput');
  const errorEl  = document.getElementById('profileAddError');
  if (!input || !errorEl) return;

  const result = addProfile(input.value);

  if (!result.success) {
    errorEl.textContent   = result.error;
    errorEl.style.display = 'block';
    input.focus();
    input.select();
    return;
  }

  switchProfile(result.name);
}

function switchProfile(name) {
  setCurrentUser(name);
  closeDropdown();
  // Reload so schema/form state is clean for the new user
  window.location.reload();
}

// ── First-run overlay ─────────────────────────────────────────────────────────

/**
 * Blocking overlay shown when the app has no current user.
 * Lets the user pick an existing profile or create a new one.
 */
function showFirstRunModal() {
  const overlay = document.createElement('div');
  overlay.id        = 'profileFirstRun';
  overlay.className = 'profile-firstrun-overlay';

  function buildContent() {
    const profiles = getAllProfiles();

    overlay.innerHTML = `
      <div class="profile-firstrun-box">
        <div class="profile-firstrun-header">
          <div class="profile-firstrun-icon">👤</div>
          <h2>Welcome to JSON Data Builder</h2>
          <p>Select a profile or create one to get started.</p>
        </div>

        ${profiles.length > 0 ? `
          <div class="profile-firstrun-section">
            <div class="profile-section-label">Existing Profiles</div>
            <div id="frProfileList" class="profile-firstrun-list">
              ${profiles.map(p => {
                const dn = p.replace(/_/g, ' ');
                const av = dn.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                return `
                  <div class="profile-firstrun-item" data-profile="${p}">
                    <span class="profile-list-avatar">${av}</span>
                    <span class="profile-list-name">${dn}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>
          <hr class="profile-divider" style="margin: 0 20px;">
        ` : ''}

        <div class="profile-firstrun-section">
          <div class="profile-section-label">Create New Profile</div>
          <div class="profile-new-row" style="padding: 4px 20px 0;">
            <input type="text" id="frNewInput" class="profile-new-input"
                   placeholder="Enter username" maxlength="30"
                   autocomplete="off" spellcheck="false">
            <button id="frAddBtn" class="profile-add-btn">Create</button>
          </div>
          <div id="frError" class="profile-add-error" style="display:none; margin: 6px 20px 0;"></div>
        </div>

        <div class="profile-firstrun-footer">
          <small>Profiles are stored locally in your browser.</small>
        </div>
      </div>
    `;

    // Existing profile clicks
    overlay.querySelectorAll('.profile-firstrun-item').forEach(item => {
      item.addEventListener('click', () => {
        setCurrentUser(item.dataset.profile);
        overlay.remove();
        renderProfileButton();
        // Optionally reload to ensure clean state:
        // window.location.reload();
      });
    });

    // Create new profile
    const addBtn  = overlay.querySelector('#frAddBtn');
    const input   = overlay.querySelector('#frNewInput');
    const errorEl = overlay.querySelector('#frError');

    addBtn.addEventListener('click', () => {
      const result = addProfile(input.value);
      if (!result.success) {
        errorEl.textContent   = result.error;
        errorEl.style.display = 'block';
        input.focus();
        input.select();
        return;
      }
      setCurrentUser(result.name);
      overlay.remove();
      renderProfileButton();
      // Rebuild so it shows the new profile in future dropdowns
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBtn.click();
      errorEl.style.display = 'none';
    });

    // Auto-focus
    setTimeout(() => input?.focus(), 80);
  }

  buildContent();
  document.body.appendChild(overlay);
}

// ── Wire the button ───────────────────────────────────────────────────────────

// Called from data-builder.js after DOM is ready
export function attachProfileButton() {
  document.getElementById('profileBtn')?.addEventListener('click', toggleDropdown);
}