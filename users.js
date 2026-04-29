// users.js — Login, PIN numpad, user management
import { DB, objToArr, colorFor, initials, nowISO } from './firebase.js';
import { STATE } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

let _selectedUser = null;
let _pinBuffer    = '';

// ── PIN HASHING (fix #4 — real hash, not plaintext token) ─────
// Simple but effective: SHA-256 via SubtleCrypto, falls back to
// a djb2-based string if SubtleCrypto is unavailable.
async function _hashPin(pin) {
  try {
    const buf    = new TextEncoder().encode('ZP_SALT_' + String(pin));
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (_) {
    // Fallback (very old browser): simple djb2 — still beats plain PIN_XXXX
    let h = 5381;
    for (const c of ('ZP_SALT_' + pin)) h = ((h << 5) + h) ^ c.charCodeAt(0);
    return 'fb_' + Math.abs(h).toString(36);
  }
}

// Legacy format check (old plain-text PIN_XXXX tokens)
function _isLegacyPin(pin) {
  return typeof pin === 'string' && pin.startsWith('PIN_');
}

// ── LOAD USERS FROM FIREBASE ──────────────────────────────────
export async function loadUsers() {
  const data = await DB.get('users');

  if (data) {
    const arr = objToArr(data).filter(u => u.active !== false);

    // Detect old plain-text hash format — re-seed if found (fix #4)
    const hasOldHash = arr.some(u => u.pin && _isLegacyPin(u.pin));
    if (hasOldHash) {
      await DB.set('users', null);
      await _seedOwner();
      return;
    }

    STATE.users = arr;
  } else {
    await _seedOwner();
  }

  _buildUserGrid();
}

async function _seedOwner() {
  const owner = {
    name:      'Owner',
    initials:  'OW',
    role:      'owner',
    pin:       await _hashPin('1234'),
    color:     '#6c63ff',
    active:    true,
    createdAt: new Date().toISOString(),
  };
  await DB.set('users/USR001', owner);
  STATE.users = [{ id: 'USR001', ...owner }];
  _buildUserGrid();
}

// ── BUILD USER PICKER GRID ────────────────────────────────────
function _buildUserGrid() {
  const grid = document.getElementById('user-grid');
  if (!grid) return;
  grid.innerHTML = '';

  STATE.users.forEach(u => {
    const btn = document.createElement('button');
    btn.className = 'user-btn';
    btn.innerHTML =
      '<div class="user-av" style="background:' + (u.color || colorFor(u.name)) + '">' +
        (u.initials || initials(u.name)) +
      '</div>' +
      '<div class="user-nm">' + u.name + '</div>' +
      '<div class="user-role">' + u.role + '</div>';

    btn.addEventListener('click', () => _selectUser(u, btn));
    grid.appendChild(btn);
  });
}

function _selectUser(u, btn) {
  _selectedUser = u;
  document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');

  setTimeout(() => {
    document.getElementById('step-user').style.display = 'none';
    document.getElementById('step-pin').style.display  = 'block';
    document.getElementById('ls2').classList.add('on');
    document.getElementById('pin-for').textContent = 'PIN for ' + u.name;
    _pinBuffer = '';
    _updatePinUI();
  }, 180);
}

export function goStep1() {
  document.getElementById('step-user').style.display = 'block';
  document.getElementById('step-pin').style.display  = 'none';
  document.getElementById('ls2').classList.remove('on');
  _pinBuffer = '';
  _updatePinUI();
  document.getElementById('pin-err').textContent = '';
}

// ── NUMPAD ────────────────────────────────────────────────────
export function buildNumpad() {
  const grid = document.getElementById('numpad');
  if (!grid) return;
  grid.innerHTML = '';

  [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].forEach(k => {
    const div = document.createElement('div');
    div.className = 'num-key' + (k === '⌫' ? ' del' : '');
    div.textContent = k;

    if (k === '') {
      div.style.visibility = 'hidden';
      grid.appendChild(div);
      return;
    }

    div.addEventListener('click', () => {
      if (k === '⌫') {
        _pinBuffer = _pinBuffer.slice(0, -1);
      } else if (_pinBuffer.length < 4) {
        _pinBuffer += String(k);
      }
      _updatePinUI();
      document.getElementById('pin-err').textContent = '';
    });

    grid.appendChild(div);
  });
}

function _updatePinUI() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('pd' + i)?.classList.toggle('on', i < _pinBuffer.length);
  }
  const goBtn = document.getElementById('go-btn');
  if (goBtn) goBtn.classList.toggle('ready', _pinBuffer.length === 4);
}

// ── CHECK PIN ─────────────────────────────────────────────────
export async function checkPin() {
  if (_pinBuffer.length !== 4) return;

  const entered = await _hashPin(_pinBuffer);

  if (entered === _selectedUser.pin) {
    STATE.user = _selectedUser;
    window.dispatchEvent(new CustomEvent('zp:login', { detail: _selectedUser }));
  } else {
    document.getElementById('pin-err').textContent = 'Incorrect PIN. Try again.';
    document.getElementById('step-pin').classList.add('shake');
    setTimeout(() => document.getElementById('step-pin').classList.remove('shake'), 350);
    _pinBuffer = '';
    _updatePinUI();
  }
}

// ── USERS MODAL (add/remove team members) ────────────────────
export async function openUsersModal() {
  const data  = await DB.get('users');
  STATE.users = objToArr(data).filter(u => u.active !== false);

  const list = document.getElementById('users-list');
  list.innerHTML = STATE.users.map(u =>
    '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">' +
      '<div class="user-av" style="background:' + (u.color || colorFor(u.name)) + ';width:38px;height:38px;font-size:13px">' +
        (u.initials || initials(u.name)) +
      '</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:14px;font-weight:700;color:var(--text)">' + u.name + '</div>' +
        '<span class="role-' + u.role + '">' + u.role + '</span>' +
      '</div>' +
      (u.id !== STATE.user.id
        ? '<button onclick="window.removeUser(\'' + u.id + '\',\'' + u.name + '\')" class="btn-danger" style="padding:5px 12px;font-size:12px">Remove</button>'
        : '<span style="font-size:11px;color:var(--text3)">You</span>') +
    '</div>'
  ).join('');

  openModal('modal-users');
}

export async function addUser() {
  const name = document.getElementById('nu-name').value.trim();
  const ini  = document.getElementById('nu-init').value.trim().toUpperCase();
  const role = document.getElementById('nu-role').value;
  const pin  = document.getElementById('nu-pin').value.trim();

  if (!name)            { toast('Enter user name',              true); return; }
  if (!ini)             { toast('Enter initials',               true); return; }
  if (pin.length !== 4) { toast('PIN must be exactly 4 digits', true); return; }
  if (!/^\d{4}$/.test(pin)) { toast('PIN must be 4 numbers',   true); return; }

  const colors = ['#6c63ff','#00c896','#ff4d6d','#ffaa00','#4da6ff'];
  const color  = colors[Math.floor(Math.random() * colors.length)];
  const id     = 'USR' + Date.now();

  await DB.set('users/' + id, {
    name, initials: ini, role,
    pin:       await _hashPin(pin),   // fix #4 — real hash
    color,
    active:    true,
    createdAt: new Date().toISOString(),
  });

  toast('User added!');
  document.getElementById('nu-name').value = '';
  document.getElementById('nu-pin').value  = '';
  await openUsersModal();
}

export async function removeUser(id, name) {
  const ok = await import('./ui.js').then(m => m.showConfirm('Remove ' + name + '?', 'They will no longer be able to log in.'));
  if (!ok) return;
  await DB.update('users/' + id, { active: false });
  toast(name + ' removed');
  await openUsersModal();
}

window.removeUser = removeUser;
