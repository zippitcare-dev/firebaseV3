// balance.js
import { DB, objToArr, fmt, today, nowISO } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';

// ── LOAD BALANCE DATA ─────────────────────────────────────────
export async function loadBalance() {
  const data = await DB.get('balance');
  STATE.balance = {
    openingBalance: Number(data?.openingBalance || 0),
    transactions:   objToArr(data?.transactions),
  };
}

// ── CALCULATE CURRENT BALANCE ─────────────────────────────────
export function calcCurrentBalance() {
  if (!STATE.balance) return 0;
  const { openingBalance, transactions } = STATE.balance;
  const net = transactions.reduce((s, t) => {
    return t.type === 'in' ? s + Number(t.amount || 0) : s - Number(t.amount || 0);
  }, 0);
  return openingBalance + net;
}

// ── AUTO TRANSACTION (called by payments.js and expenses.js) ──
export async function addBalanceTransaction(type, amount, note, source) {
  if (!amount || amount <= 0) return;
  await DB.push('balance/transactions', {
    type,    // 'in' | 'out'
    amount:  Number(amount),
    note:    note || '',
    source,  // 'payment' | 'expense' | 'manual'
    date:    today(),
    createdAt: nowISO(),
    createdBy: STATE.user?.name || 'system',
  });
  // Update STATE
  if (!STATE.balance) STATE.balance = { openingBalance: 0, transactions: [] };
  STATE.balance.transactions.push({
    type, amount: Number(amount), note, source,
    date: today(), createdAt: nowISO(),
  });
}

// ── RENDER BALANCE PAGE ───────────────────────────────────────
export function renderBalance() {
  if (!STATE.balance) {
    document.getElementById('bal-list').innerHTML =
      '<div class="empty"><div class="empty-text">Loading...</div></div>';
    return;
  }

  const { openingBalance, transactions } = STATE.balance;
  const current = calcCurrentBalance();

  const totalIn  = transactions.filter(t => t.type === 'in').reduce((s,t)=>s+Number(t.amount||0),0);
  const totalOut = transactions.filter(t => t.type === 'out').reduce((s,t)=>s+Number(t.amount||0),0);

  // Opening balance setup
  const obEl = document.getElementById('bal-opening');
  if (obEl) obEl.textContent = fmt(openingBalance);

  document.getElementById('bal-current').textContent  = fmt(current);
  document.getElementById('bal-total-in').textContent  = fmt(totalIn);
  document.getElementById('bal-total-out').textContent = fmt(totalOut);

  // Color current balance
  const curEl = document.getElementById('bal-current');
  if (curEl) curEl.style.color = current >= 0 ? 'var(--green)' : 'var(--red)';

  // Transaction list — newest first
  const el = document.getElementById('bal-list');
  const sorted = [...transactions].sort((a,b) =>
    (b.createdAt || '') > (a.createdAt || '') ? 1 : -1
  );

  if (!sorted.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">💰</div>' +
        '<div class="empty-text">No transactions yet</div>' +
        '<div class="empty-sub">Transactions appear automatically when payments are collected or expenses are recorded</div>' +
      '</div>';
    return;
  }

  const sourceLabel = { payment: 'Client Payment', expense: 'Expense', manual: 'Manual' };
  const sourceIcon  = { payment: '💳', expense: '💸', manual: '✏️' };

  el.innerHTML = '<div class="card">';
  sorted.forEach(t => {
    el.innerHTML +=
      '<div class="li">' +
        '<div class="li-av" style="background:' + (t.type === 'in' ? 'var(--green-d)' : 'var(--red-d)') +
          ';color:' + (t.type === 'in' ? 'var(--green)' : 'var(--red)') + ';font-size:20px">' +
          (sourceIcon[t.source] || '✏️') +
        '</div>' +
        '<div class="li-info">' +
          '<div class="li-name">' + (t.note || t.source) + '</div>' +
          '<div class="li-sub">' + (sourceLabel[t.source] || 'Manual') + ' · ' + (t.date || '—') + ' · ' + (t.createdBy || '—') + '</div>' +
        '</div>' +
        '<div class="li-right">' +
          '<div style="font-size:15px;font-weight:800;color:' + (t.type === 'in' ? 'var(--green)' : 'var(--red)') + '">' +
            (t.type === 'in' ? '+' : '−') + fmt(t.amount) +
          '</div>' +
        '</div>' +
      '</div>';
  });
  el.innerHTML += '</div>';
}

// ── SET OPENING BALANCE ───────────────────────────────────────
export async function saveOpeningBalance() {
  const val = Number(document.getElementById('bal-opening-input')?.value || 0);
  const ok  = await showConfirm(
    'Set opening balance to ' + fmt(val) + '?',
    'This is the cash you had when the app went live. Set this only once.'
  );
  if (!ok) return;

  await DB.update('balance', { openingBalance: val });
  if (!STATE.balance) STATE.balance = { openingBalance: 0, transactions: [] };
  STATE.balance.openingBalance = val;
  toast('Opening balance set!');
  closeModal('modal-opening-balance');
  renderBalance();
  // Update dashboard card
  window.dispatchEvent(new CustomEvent('zp:balance-changed'));
}

// ── MANUAL TRANSACTION MODAL ──────────────────────────────────
export function openManualTransactionModal(type) {
  window._manualTxType = type;
  document.getElementById('mtx-title').textContent  = type === 'in' ? 'Add Money' : 'Deduct Money';
  document.getElementById('mtx-submit').textContent = type === 'in' ? 'Add to Balance' : 'Deduct from Balance';
  document.getElementById('mtx-submit').style.background = type === 'in' ? 'var(--green)' : 'var(--red)';
  document.getElementById('mtx-amount').value = '';
  document.getElementById('mtx-note').value   = '';
  document.getElementById('mtx-date').value   = today();
  openModal('modal-manual-tx');
}

export async function submitManualTransaction() {
  const type   = window._manualTxType;
  const amount = Number(document.getElementById('mtx-amount')?.value || 0);
  const note   = (document.getElementById('mtx-note')?.value || '').trim();
  const date   = document.getElementById('mtx-date')?.value;

  if (!amount) { toast('Enter amount', true); return; }
  if (!note)   { toast('Enter a note describing this transaction', true); return; }

  const btn = document.getElementById('mtx-submit');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    const tx = {
      type, amount, note, source: 'manual', date: date || today(),
      createdAt: nowISO(), createdBy: STATE.user.name,
    };
    await DB.push('balance/transactions', tx);
    if (!STATE.balance) STATE.balance = { openingBalance: 0, transactions: [] };
    STATE.balance.transactions.push(tx);

    toast(type === 'in' ? fmt(amount) + ' added to balance!' : fmt(amount) + ' deducted from balance!');
    closeModal('modal-manual-tx');
    renderBalance();
    window.dispatchEvent(new CustomEvent('zp:balance-changed'));
  } catch (err) {
    toast('Failed: ' + err.message, true);
  } finally {
    if (btn) { btn.textContent = type === 'in' ? 'Add to Balance' : 'Deduct from Balance'; btn.disabled = false; }
  }
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.saveOpeningBalance        = saveOpeningBalance;
window.openManualTransactionModal = openManualTransactionModal;
window.submitManualTransaction   = submitManualTransaction;
