// payments.js
import { DB, objToArr, fmt, today, nowISO, colorFor, initials } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';

// ── RENDER PAYMENTS PAGE ──────────────────────────────────────
export function renderPayments() {
  // Build per-client pending map
  const clientMap = {};
  STATE.sales
    .filter(s => s.paymentStatus !== 'paid' && Number(s.amountPending || 0) > 0)
    .forEach(s => {
      if (!clientMap[s.clientId]) {
        const cl = STATE.clients.find(c => c.id === s.clientId);
        clientMap[s.clientId] = {
          clientId: s.clientId,
          name:     cl?.name || s.clientId,
          total:    0,
          orders:   [],
        };
      }
      clientMap[s.clientId].total += Number(s.amountPending || 0);
      clientMap[s.clientId].orders.push(s);
    });

  const list  = Object.values(clientMap).sort((a, b) => b.total - a.total);
  const grand = list.reduce((s, c) => s + c.total, 0);

  document.getElementById('pay-grand').textContent = fmt(grand);
  document.getElementById('pay-count').textContent = list.length;

  const el = document.getElementById('pay-list');

  if (!list.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">&#9989;</div>' +
        '<div class="empty-text">All payments cleared!</div>' +
        '<div class="empty-sub">No outstanding dues</div>' +
      '</div>';
    return;
  }

  el.innerHTML = '';
  list.forEach(c => {
    // Sort orders oldest first for FIFO display
    const sorted = [...c.orders].sort((a, b) =>
      (a.saleDate || '') > (b.saleDate || '') ? 1 : -1
    );

    const orderRows = sorted.slice(0, 4).map(o =>
      '<div class="pay-row">' +
        '<span style="color:var(--text2)">' + (o.saleDate || '—') + ' · ' + (o.batchNo || '') + '</span>' +
        '<span class="badge ' + (o.paymentStatus === 'pending' ? 'b-red' : 'b-amber') + '">' +
          fmt(o.amountPending) + ' due' +
        '</span>' +
      '</div>'
    ).join('');

    const moreRow = sorted.length > 4
      ? '<div style="text-align:center;font-size:11px;color:var(--text3);padding:6px">+' + (sorted.length - 4) + ' more orders</div>'
      : '';

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
        '<div class="li-av" style="background:' + colorFor(c.clientId) + '">' + initials(c.name) + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:15px;font-weight:800">' + c.name + '</div>' +
          '<div style="font-size:12px;color:var(--text2)">' + c.orders.length + ' orders pending</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:18px;font-weight:800;color:var(--red)">' + fmt(c.total) + '</div>' +
          '<button class="btn-sm" style="margin-top:6px" onclick="window.openPayModal(\'' + c.clientId + '\')">' +
            'Collect' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:8px">' +
        orderRows + moreRow +
      '</div>';

    el.appendChild(card);
  });
}

// ── OPEN COLLECT PAYMENT MODAL ────────────────────────────────
export function openPayModal(clientId) {
  // Pending orders for this client, sorted oldest first (FIFO)
  const orders = STATE.sales
    .filter(s => s.clientId === clientId && s.paymentStatus !== 'paid' && Number(s.amountPending || 0) > 0)
    .sort((a, b) => (a.saleDate || '') > (b.saleDate || '') ? 1 : -1);

  window._payClientId = clientId;
  window._payOrders   = orders;

  const cl          = STATE.clients.find(c => c.id === clientId);
  const outstanding = orders.reduce((s, o) => s + Number(o.amountPending || 0), 0);

  document.getElementById('pay-modal-title').textContent  = 'Collect — ' + (cl?.name || clientId);
  document.getElementById('pay-outstanding').textContent  = fmt(outstanding);
  document.getElementById('pay-order-count').textContent  = orders.length + ' orders';
  document.getElementById('pay-amt').value                = '';
  document.getElementById('pay-date').value               = today();
  document.getElementById('pay-notes').value              = '';
  document.getElementById('pay-preview-wrap').style.display = 'none';

  // Store outstanding for cap validation
  window._payOutstanding = outstanding;

  openModal('modal-payment');
}

// ── PREVIEW PAYMENT DISTRIBUTION ─────────────────────────────
export function previewPayment() {
  const raw         = Number(document.getElementById('pay-amt')?.value || 0);
  const outstanding = window._payOutstanding || 0;
  const orders      = window._payOrders || [];

  // Cap at outstanding
  if (raw > outstanding) {
    document.getElementById('pay-amt').value = outstanding.toFixed(0);
  }

  const amt = Math.min(raw, outstanding);

  if (amt <= 0) {
    document.getElementById('pay-preview-wrap').style.display = 'none';
    return;
  }

  document.getElementById('pay-preview-wrap').style.display = 'block';

  let rem  = amt;
  let html = '';

  orders.forEach(o => {
    const pend = Number(o.amountPending || 0);
    if (rem >= pend) {
      html +=
        '<div class="pay-row">' +
          '<span style="color:var(--text2)">' + o.saleDate + ' (' + fmt(o.totalRevenue) + ')</span>' +
          '<span class="badge b-green">Fully Paid</span>' +
        '</div>';
      rem -= pend;
    } else if (rem > 0) {
      html +=
        '<div class="pay-row">' +
          '<span style="color:var(--text2)">' + o.saleDate + ' (' + fmt(o.totalRevenue) + ')</span>' +
          '<span class="badge b-amber">' + fmt(rem) + ' paid · ' + fmt(pend - rem) + ' left</span>' +
        '</div>';
      rem = 0;
    } else {
      html +=
        '<div class="pay-row">' +
          '<span style="color:var(--text3)">' + o.saleDate + ' (' + fmt(o.totalRevenue) + ')</span>' +
          '<span class="badge b-red">Still pending</span>' +
        '</div>';
    }
  });

  document.getElementById('pay-preview-rows').innerHTML = html;
  document.getElementById('pay-still').textContent = fmt(Math.max(0, outstanding - amt));
}

// ── SUBMIT PAYMENT ────────────────────────────────────────────
export async function submitPayment() {
  const amt         = Number(document.getElementById('pay-amt')?.value || 0);
  const date        = document.getElementById('pay-date')?.value;
  const notes       = document.getElementById('pay-notes')?.value || '';
  const outstanding = window._payOutstanding || 0;
  const orders      = window._payOrders || [];
  const clientId    = window._payClientId;

  if (!amt || amt <= 0)     { toast('Enter a valid amount', true); return; }
  if (!date)                { toast('Select payment date',  true); return; }
  if (amt > outstanding)    { toast('Amount exceeds total outstanding of ' + fmt(outstanding), true); return; }

  const btn = document.getElementById('pay-submit-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    // Distribute FIFO — oldest order first
    let rem     = amt;
    const updates = {};

    orders.forEach(o => {
      if (rem <= 0) return;
      const pend    = Number(o.amountPending || 0);
      const paid    = Number(o.amountPaid    || 0);
      const paying  = Math.min(rem, pend);
      rem          -= paying;

      const newPaid    = paid + paying;
      const newPending = pend - paying;
      const newStatus  = newPending <= 0 ? 'paid' : 'partial';

      updates['sales/' + o.id + '/paymentStatus']  = newStatus;
      updates['sales/' + o.id + '/amountPaid']     = newPaid;
      updates['sales/' + o.id + '/amountPending']  = newPending;
      updates['sales/' + o.id + '/modifiedAt']     = nowISO();
      updates['sales/' + o.id + '/modifiedBy']     = STATE.user.name;
    });

    // Save payment record
    await DB.push('payments', {
      clientId, date, amount: amt, notes,
      createdAt: nowISO(), createdBy: STATE.user.name,
    });

    // Apply all sale updates atomically
    await DB.multiUpdate(updates);

    toast('Payment of ' + fmt(amt) + ' recorded!');
    closeModal('modal-payment');
    window.dispatchEvent(new CustomEvent('zp:data-changed'));
  } catch (err) {
    toast('Failed: ' + err.message, true);
  } finally {
    if (btn) { btn.textContent = 'Confirm Payment'; btn.disabled = false; }
  }
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.openPayModal    = openPayModal;
window.previewPayment  = previewPayment;
window.submitPayment   = submitPayment;
