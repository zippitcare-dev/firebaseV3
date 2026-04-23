// expenses.js
import { DB, objToArr, fmt, today, nowISO } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';

let _expChart = null;

// ── RENDER EXPENSES PAGE ──────────────────────────────────────
export function renderExpenses() {
  _wireChips();

  const period = document.querySelector('#exp-period-chips .chip-f.on')?.dataset.p || 'month';
  const now    = new Date();
  const prefix = period === 'month'
    ? now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    : period === 'year'
    ? String(now.getFullYear())
    : '';

  const filtered = prefix
    ? STATE.expenses.filter(e => (e.date || '').startsWith(prefix))
    : [...STATE.expenses];

  const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);

  document.getElementById('exp-total').textContent       = fmt(total);
  document.getElementById('exp-period-label').textContent =
    period === 'month' ? 'This Month' : period === 'year' ? 'This Year' : 'All Time';
  document.getElementById('exp-count').textContent = filtered.length + ' Expenses';

  // Donut chart by category
  const catTotals = {};
  filtered.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount || 0);
  });
  const cats   = Object.keys(catTotals);
  const COLORS = ['#6c63ff','#00c896','#ff4d6d','#ffaa00','#4da6ff','#ff7043','#26c6da','#ab47bc'];

  if (_expChart) { _expChart.destroy(); _expChart = null; }
  const ctx = document.getElementById('chart-exp')?.getContext('2d');
  if (ctx && cats.length) {
    _expChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels:   cats,
        datasets: [{ data: cats.map(c => catTotals[c]), backgroundColor: COLORS, borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#8888aa', font: { size: 10 }, boxWidth: 10 } } },
      },
    });
  }

  // List
  const el     = document.getElementById('exp-list');
  const sorted = [...filtered].sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);
  const icons  = { Vehicle:'🛵', Salary:'💼', Utilities:'💡', Packaging:'📦', Maintenance:'🔧', Other:'📌' };

  if (!sorted.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">&#128184;</div>' +
        '<div class="empty-text">No expenses yet</div>' +
        '<div class="empty-sub">Tap + to add an expense</div>' +
      '</div>';
    return;
  }

  el.innerHTML = '<div class="card">';
  sorted.forEach(e => {
    el.innerHTML +=
      '<div class="li" onclick="window.openEditExp(\'' + e.id + '\')" style="cursor:pointer">' +
        '<div class="li-av" style="background:var(--amber);font-size:20px">' + (icons[e.category] || '💸') + '</div>' +
        '<div class="li-info">' +
          '<div class="li-name">' + (e.reason || e.category) + '</div>' +
          '<div class="li-sub">' + (e.category || '—') + ' &middot; ' + (e.date || '—') + ' &middot; ' + (e.createdBy || '—') + '</div>' +
        '</div>' +
        '<div class="li-right">' +
          '<div class="li-amt" style="color:var(--red)">' + fmt(e.amount) + '</div>' +
        '</div>' +
      '</div>';
  });
  el.innerHTML += '</div>';
}

function _wireChips() {
  document.querySelectorAll('#exp-period-chips .chip-f').forEach(ch => {
    ch.onclick = () => {
      document.querySelectorAll('#exp-period-chips .chip-f').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      renderExpenses();
    };
  });
}

// ── OPEN EXPENSE MODAL ────────────────────────────────────────
export function openExpModal(editId = null) {
  window._editExpId = editId || null;
  const e = editId ? STATE.expenses.find(x => x.id === editId) : null;

  document.getElementById('exp-modal-title').textContent = editId ? 'Edit Expense' : 'New Expense';
  document.getElementById('e-date').value   = e?.date   || today();
  document.getElementById('e-amount').value = e?.amount || '';
  document.getElementById('e-reason').value = e?.reason || '';

  // Populate category select
  const sel = document.getElementById('e-cat');
  sel.innerHTML = STATE.settings.expenseCategories.map(c =>
    '<option value="' + c + '"' + (e?.category === c ? ' selected' : '') + '>' + c + '</option>'
  ).join('');

  // Show/hide delete button
  const delBtn = document.getElementById('exp-delete-btn');
  if (delBtn) delBtn.style.display = editId ? 'block' : 'none';

  openModal('modal-expense');
}

// ── SUBMIT EXPENSE ────────────────────────────────────────────
export async function submitExpense() {
  const date   = document.getElementById('e-date')?.value;
  const amount = Number(document.getElementById('e-amount')?.value || 0);
  const reason = (document.getElementById('e-reason')?.value || '').trim();
  const cat    = document.getElementById('e-cat')?.value;

  if (!date)   { toast('Select a date',       true); return; }
  if (!amount) { toast('Enter amount',         true); return; }
  if (!reason) { toast('Enter a reason',       true); return; }

  const data = {
    date, amount, category: cat, reason,
    modifiedAt: nowISO(), modifiedBy: STATE.user.name,
  };

  const btn = document.querySelector('#modal-expense .btn-primary');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    if (window._editExpId) {
      await DB.update('expenses/' + window._editExpId, data);
      toast('Expense updated!');
    } else {
      await DB.push('expenses', { ...data, createdAt: nowISO(), createdBy: STATE.user.name });
      toast('Expense saved!');
    }
    closeModal('modal-expense');
    window.dispatchEvent(new CustomEvent('zp:data-changed'));
  } catch (err) {
    toast('Failed: ' + err.message, true);
  } finally {
    if (btn) { btn.textContent = 'Save Expense'; btn.disabled = false; }
  }
}

// ── DELETE EXPENSE ────────────────────────────────────────────
export async function deleteExpense() {
  const ok = await showConfirm('Delete this expense?', 'This cannot be undone.');
  if (!ok) return;
  await DB.remove('expenses/' + window._editExpId);
  toast('Expense deleted');
  closeModal('modal-expense');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.openExpModal   = openExpModal;
window.openEditExp    = (id) => openExpModal(id);
window.submitExpense  = submitExpense;
window.deleteExpense  = deleteExpense;
