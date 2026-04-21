// ui.js — Shared UI utilities
import { STATE } from './state.js';

// ── TOAST ─────────────────────────────────────────────────────
let _toastTimer = null;

export function toast(msg, isErr = false) {
  // Never show toast during login
  if (!STATE.user) return;
  if (!msg) return;

  const el = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (!el || !msgEl) return;

  msgEl.textContent = msg;
  el.className = 'toast' + (isErr ? ' toast-err' : '');
  el.classList.add('show');

  // Clear any existing timer
  if (_toastTimer) clearTimeout(_toastTimer);

  // Auto-dismiss after 3 seconds
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
    _toastTimer = null;
  }, 3000);
}

// ── CONFIRM DIALOG ────────────────────────────────────────────
export function showConfirm(title, msg) {
  return new Promise(resolve => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent   = msg;
    document.getElementById('confirm-modal').classList.add('show');

    // Store resolver on window temporarily
    window._confirmResolve = val => {
      document.getElementById('confirm-modal').classList.remove('show');
      window._confirmResolve = null;
      resolve(val);
    };
  });
}

// ── MODAL HELPERS ─────────────────────────────────────────────
export function openModal(id)  {
  document.getElementById(id)?.classList.add('show');
}
export function closeModal(id) {
  document.getElementById(id)?.classList.remove('show');
}

// Close modal when clicking the dark backdrop
export function initBackdropClose() {
  document.querySelectorAll('.modal-bg').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) m.classList.remove('show');
    });
  });
}
