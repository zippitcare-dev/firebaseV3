// sales.js
import { DB, objToArr, fmt, today, nowISO, colorFor, initials } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';
import { getCatName, labelCostPerPack } from './settings.js';
import { getLabelsRemaining } from './labels.js';

// ── HELPERS ───────────────────────────────────────────────────
function _activeBatches() {
  return STATE.batches.filter(b => {
    if (b.deleted) return false;
    const items = Object.values(b.items || {});
    return items.some(it => Number(it.qtyRemaining || 0) > 0);
  });
}

// ── RENDER SALES PAGE ─────────────────────────────────────────
export function renderSales() {
  _wireChips();

  const filter = document.querySelector('#sale-chips .chip-f.on')?.dataset.s || '';
  let   list   = filter
    ? STATE.sales.filter(s => s.paymentStatus === filter)
    : [...STATE.sales];

  list.sort((a, b) => (b.saleDate || '') > (a.saleDate || '') ? 1 : -1);

  const rev  = list.reduce((s, r) => s + Number(r.totalRevenue  || 0), 0);
  const pend = list.reduce((s, r) => s + Number(r.amountPending || 0), 0);

  document.getElementById('sale-rev').textContent   = fmt(rev);
  document.getElementById('sale-pend').textContent  = fmt(pend);
  document.getElementById('sale-count').textContent = list.length + ' Sales';

  const el = document.getElementById('sale-list');

  if (!list.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">&#129534;</div>' +
        '<div class="empty-text">No sales yet</div>' +
        '<div class="empty-sub">Tap + to record a sale</div>' +
      '</div>';
    updateSaleDot();
    return;
  }

  el.innerHTML = '<div class="card">';
  list.forEach(s => {
    const badge = s.paymentStatus === 'paid'    ? 'b-green' :
                  s.paymentStatus === 'partial'  ? 'b-amber' : 'b-red';
    const label = s.paymentStatus === 'paid'    ? 'Paid' :
                  s.paymentStatus === 'partial'  ? 'Partial' : 'Pending';

    el.innerHTML +=
      '<div class="li" onclick="window.openSaleDetail(\'' + s.id + '\')" style="cursor:pointer">' +
        '<div class="li-av" style="background:' + colorFor(s.clientId || 'x') + '">' +
          initials(s.clientName || '?') +
        '</div>' +
        '<div class="li-info">' +
          '<div class="li-name">' + (s.clientName || s.clientId) + '</div>' +
          '<div class="li-sub">' + (s.saleDate || '—') + ' &middot; Batch: ' + (s.batchNo || '—') + ' &middot; ' + (s.totalPacks || 0) + ' packs</div>' +
        '</div>' +
        '<div class="li-right">' +
          '<div class="li-amt">' + fmt(s.totalRevenue) + '</div>' +
          '<span class="badge ' + badge + '">' + label + '</span>' +
        '</div>' +
      '</div>';
  });
  el.innerHTML += '</div>';

  updateSaleDot();
}

export function updateSaleDot() {
  const has = STATE.sales.some(
    s => s.paymentStatus !== 'paid' && Number(s.amountPending || 0) > 0
  );
  document.getElementById('sale-dot')?.classList.toggle('show', has);
}

function _wireChips() {
  document.querySelectorAll('#sale-chips .chip-f').forEach(ch => {
    ch.onclick = () => {
      document.querySelectorAll('#sale-chips .chip-f').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      renderSales();
    };
  });
}

// ── OPEN SALE MODAL ───────────────────────────────────────────
export function openSaleModal() {
  // Build sale form dynamically
  const saleBody = document.getElementById('sale-body');

  // Client select options
  const clientOpts = '<option value="">— Select client —</option>' +
    STATE.clients.map(c =>
      '<option value="' + c.id + '">' + c.name + '</option>'
    ).join('');

  // Active batch options
  const batchOpts = '<option value="">— Select batch —</option>' +
    _activeBatches().map(b => {
      const rem = Object.values(b.items || {}).reduce((s, it) => s + Number(it.qtyRemaining || 0), 0);
      return '<option value="' + b.id + '">' + b.batchNo + ' (' + rem + ' packs left)</option>';
    }).join('');

  saleBody.innerHTML =
    '<div class="form-group">' +
      '<label class="form-label">Client *</label>' +
      '<select class="form-select" id="s-client" onchange="window._loadSaleRows()">' +
        clientOpts +
      '</select>' +
    '</div>' +

    '<div class="form-row">' +
      '<div class="form-group">' +
        '<label class="form-label">Sale Date *</label>' +
        '<input class="form-input" type="date" id="s-date" value="' + today() + '"/>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Batch *</label>' +
        '<select class="form-select" id="s-batch" onchange="window._loadSaleRows()">' +
          batchOpts +
        '</select>' +
      '</div>' +
    '</div>' +

    '<div class="sec-hdr"><span class="sec-title">Packs Sold</span></div>' +
    '<div id="sale-pack-rows">' +
      '<div style="color:var(--text3);font-size:13px;padding:10px 0">Select client and batch to continue</div>' +
    '</div>' +

    // Live cost preview
    '<div style="background:var(--surface2);border-radius:var(--r12);padding:14px;margin-bottom:14px">' +
      '<div class="info-row"><span class="info-label">Total Revenue</span><span class="info-val" id="s-prev-rev">&#8377;0</span></div>' +
      '<div class="info-row"><span class="info-label">Total Cost</span><span class="info-val" id="s-prev-cost">&#8377;0</span></div>' +
      '<div class="info-row" style="border:none"><span class="info-label">Gross Profit</span>' +
        '<span class="info-val" style="color:var(--green)" id="s-prev-profit">&#8377;0</span>' +
      '</div>' +
    '</div>' +

    '<div class="form-group">' +
      '<label class="form-label">Payment Status</label>' +
      '<select class="form-select" id="s-pay-status" onchange="window._togglePaidField()">' +
        '<option value="paid">Paid in Full</option>' +
        '<option value="partial">Partial</option>' +
        '<option value="pending">Pending</option>' +
      '</select>' +
    '</div>' +

    '<div class="form-group" id="s-paid-wrap" style="display:none">' +
      '<label class="form-label">Amount Paid Now (&#8377;)</label>' +
      '<input class="form-input" type="number" inputmode="numeric" id="s-paid" placeholder="0"/>' +
    '</div>' +

    '<div style="font-size:11px;color:var(--text3);margin-bottom:14px">' +
      'Entered by: <strong style="color:var(--text2)">' + STATE.user.name + '</strong>' +
    '</div>' +

    '<button class="btn-primary" onclick="window.submitSale()">Save Sale</button>';

  openModal('modal-sale');
}

// ── LOAD PACK ROWS WHEN CLIENT + BATCH SELECTED ───────────────
export function _loadSaleRows() {
  const clientId = document.getElementById('s-client')?.value;
  const batchId  = document.getElementById('s-batch')?.value;
  const el       = document.getElementById('sale-pack-rows');

  if (!clientId || !batchId) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:10px 0">Select client and batch to continue</div>';
    _resetCalc();
    return;
  }

  const c = STATE.clients.find(x => x.id === clientId);
  const b = STATE.batches.find(x => x.id === batchId);
  if (!c || !b) return;

  // Only show categories that client has a price for AND batch has stock for
  const rows = [];
  Object.entries(c.categories || {}).forEach(([catId, cat]) => {
    const bItem = b.items?.[catId];
    if (!bItem || Number(bItem.qtyRemaining || 0) <= 0) return;
    rows.push({ catId, cat, bItem });
  });

  if (!rows.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:10px 0">No matching pack types between this client and batch</div>';
    _resetCalc();
    return;
  }

  el.innerHTML = '';
  rows.forEach(({ catId, cat, bItem }) => {
    const lblCost   = labelCostPerPack(catId);
    const totalCost = Number(bItem.totalCostPerPack || 0) + lblCost;
    const profit    = cat.sellingPrice - totalCost;

    el.innerHTML +=
      '<div class="pack-card">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
          '<span style="font-size:14px;font-weight:700">' + getCatName(catId) + '</span>' +
          '<div style="text-align:right;font-size:11px">' +
            '<div>Sell: <span style="color:var(--green);font-weight:700">' + fmt(cat.sellingPrice) + '/pack</span></div>' +
            '<div>Cost: <span style="font-weight:700">' + fmt(totalCost) + '/pack</span></div>' +
            '<div style="color:' + (profit >= 0 ? 'var(--green)' : 'var(--red)') + ';font-weight:700">Profit: ' + fmt(profit) + '/pack</div>' +
          '</div>' +
        '</div>' +
        '<label class="form-label">Qty (max ' + bItem.qtyRemaining + ' packs)</label>' +
        '<input class="pack-input" type="number" inputmode="numeric"' +
          ' id="sq_' + catId + '"' +
          ' min="0" max="' + bItem.qtyRemaining + '"' +
          ' placeholder="0"' +
          ' data-sell="' + cat.sellingPrice + '"' +
          ' data-bcost="' + bItem.totalCostPerPack + '"' +
          ' data-lcost="' + lblCost + '"' +
          ' oninput="window._calcSaleTotal()"/>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:6px">' +
          'Batch: ' + fmt(bItem.totalCostPerPack) + ' + Labels: ' + fmt(lblCost) + ' = ' +
          '<span style="color:var(--accent);font-weight:700">' + fmt(totalCost) + '/pack</span>' +
        '</div>' +
      '</div>';
  });

  _calcSaleTotal();
}

export function _calcSaleTotal() {
  let rev = 0, cost = 0, packs = 0;
  document.querySelectorAll('#sale-pack-rows .pack-input').forEach(inp => {
    const qty = Number(inp.value || 0);
    if (!qty) return;
    rev   += qty * Number(inp.dataset.sell  || 0);
    cost  += qty * (Number(inp.dataset.bcost || 0) + Number(inp.dataset.lcost || 0));
    packs += qty;
  });
  const revEl    = document.getElementById('s-prev-rev');
  const costEl   = document.getElementById('s-prev-cost');
  const profitEl = document.getElementById('s-prev-profit');
  if (revEl)    revEl.textContent    = fmt(rev);
  if (costEl)   costEl.textContent   = fmt(cost);
  if (profitEl) profitEl.textContent = fmt(rev - cost);
}

function _resetCalc() {
  ['s-prev-rev','s-prev-cost','s-prev-profit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '₹0';
  });
}

export function _togglePaidField() {
  const v    = document.getElementById('s-pay-status')?.value;
  const wrap = document.getElementById('s-paid-wrap');
  if (wrap) wrap.style.display = (v === 'partial' || v === 'pending') ? 'block' : 'none';
}

// ── SUBMIT SALE ───────────────────────────────────────────────
export async function submitSale() {
  const clientId = document.getElementById('s-client')?.value;
  const batchId  = document.getElementById('s-batch')?.value;
  const saleDate = document.getElementById('s-date')?.value;

  if (!clientId) { toast('Select a client', true); return; }
  if (!batchId)  { toast('Select a batch',  true); return; }
  if (!saleDate) { toast('Select sale date', true); return; }

  const c = STATE.clients.find(x => x.id === clientId);
  const b = STATE.batches.find(x => x.id === batchId);

  // Collect items
  const items = {};
  let totalRevenue = 0, totalCost = 0, totalPacks = 0;

  document.querySelectorAll('#sale-pack-rows .pack-input').forEach(inp => {
    const catId = inp.id.replace('sq_', '');
    const qty   = Number(inp.value || 0);
    if (!qty) return;

    const sell      = Number(inp.dataset.sell  || 0);
    const bCost     = Number(inp.dataset.bcost || 0);
    const lCost     = Number(inp.dataset.lcost || 0);
    const totalCPP  = bCost + lCost;
    const lineRev   = qty * sell;
    const lineCost  = qty * totalCPP;

    items[catId] = {
      categoryId:       catId,
      categoryName:     getCatName(catId),
      qty,
      sellingPrice:     sell,
      batchCostPerPack: bCost,
      labelCostPerPack: lCost,
      totalCostPerPack: totalCPP,
      lineRevenue:      lineRev,
      lineCost,
      lineProfit:       lineRev - lineCost,
    };

    totalRevenue += lineRev;
    totalCost    += lineCost;
    totalPacks   += qty;
  });

  if (!totalPacks) { toast('Enter at least one quantity', true); return; }

  const grossProfit   = totalRevenue - totalCost;
  const payStatus     = document.getElementById('s-pay-status')?.value || 'paid';
  const amountPaid    = payStatus === 'paid'
    ? totalRevenue
    : Number(document.getElementById('s-paid')?.value || 0);
  const amountPending = Math.max(0, totalRevenue - amountPaid);

  const btn = document.querySelector('#modal-sale .btn-primary');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    // Save sale
    await DB.push('sales', {
      clientId, clientName: c?.name || '',
      batchId,  batchNo:    b?.batchNo || '',
      saleDate, items, totalPacks,
      totalRevenue, totalCost, grossProfit,
      paymentStatus: payStatus, amountPaid, amountPending,
      createdAt:  nowISO(), createdBy:  STATE.user.name,
      modifiedAt: nowISO(), modifiedBy: STATE.user.name,
    });

    // Update batch stock
    const stockUpdates = {};
    Object.entries(items).forEach(([catId, it]) => {
      const bItem = b?.items?.[catId];
      if (!bItem) return;
      stockUpdates['batches/' + batchId + '/items/' + catId + '/qtyRemaining'] =
        Math.max(0, Number(bItem.qtyRemaining || 0) - it.qty);
      stockUpdates['batches/' + batchId + '/items/' + catId + '/qtySold'] =
        Number(bItem.qtySold || 0) + it.qty;
    });

    // Update label usage
    Object.entries(items).forEach(([catId, it]) => {
      const cat         = STATE.settings.packCategories.find(x => x.id === catId);
      const labelsUsed  = it.qty * (cat?.bottlesPerPack || 0);
      const existing    = Number(c?.labels?.[catId]?.labelsUsed || 0);
      stockUpdates['clients/' + clientId + '/labels/' + catId + '/labelsUsed'] =
        existing + labelsUsed;
    });

    await DB.multiUpdate(stockUpdates);

    toast('Sale saved! Revenue: ' + fmt(totalRevenue) + ' · Profit: ' + fmt(grossProfit));
    closeModal('modal-sale');
    window.dispatchEvent(new CustomEvent('zp:data-changed'));
  } catch (err) {
    toast('Failed: ' + err.message, true);
  } finally {
    if (btn) { btn.textContent = 'Save Sale'; btn.disabled = false; }
  }
}

// ── SALE DETAIL MODAL ─────────────────────────────────────────
export function openSaleDetail(saleId) {
  window._editSaleId = saleId;
  const s = STATE.sales.find(x => x.id === saleId);
  if (!s) return;

  const badge = s.paymentStatus === 'paid'   ? 'b-green' :
                s.paymentStatus === 'partial' ? 'b-amber' : 'b-red';
  const label = s.paymentStatus === 'paid'   ? 'Paid' :
                s.paymentStatus === 'partial' ? 'Partial' : 'Pending';

  const itemRows = Object.values(s.items || {}).map(it =>
    '<div class="info-row">' +
      '<span class="info-label">' + it.categoryName + ' &times; ' + it.qty + '</span>' +
      '<div style="text-align:right">' +
        '<div style="font-weight:700">' + fmt(it.lineRevenue) + '</div>' +
        '<div style="font-size:11px;color:var(--green)">Profit: ' + fmt(it.lineProfit) + '</div>' +
      '</div>' +
    '</div>'
  ).join('');

  document.getElementById('sale-detail-body').innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:17px;font-weight:800">' + s.clientName + '</div>' +
      '<div style="font-size:12px;color:var(--text2)">&#128197; ' + s.saleDate + ' &middot; Batch: ' + s.batchNo + ' &middot; ' + s.totalPacks + ' packs</div>' +
    '</div>' +

    '<div class="card-sm" style="margin-bottom:12px">' + itemRows + '</div>' +

    '<div class="info-row"><span class="info-label">Revenue</span><span class="info-val">' + fmt(s.totalRevenue) + '</span></div>' +
    '<div class="info-row"><span class="info-label">Cost</span><span class="info-val">' + fmt(s.totalCost) + '</span></div>' +
    '<div class="info-row"><span class="info-label">Gross Profit</span><span class="info-val" style="color:var(--green)">' + fmt(s.grossProfit) + '</span></div>' +
    '<div class="info-row"><span class="info-label">Payment</span><span class="info-val"><span class="badge ' + badge + '">' + label + '</span> ' + fmt(s.amountPaid) + ' paid</span></div>' +
    '<div class="info-row"><span class="info-label">Pending</span><span class="info-val" style="color:var(--red)">' + fmt(s.amountPending) + '</span></div>' +
    '<div class="info-row" style="border:none"><span class="info-label">Entered by</span><span class="info-val">' + (s.createdBy || '—') + '</span></div>' +

    '<div style="display:flex;gap:10px;margin-top:16px">' +
      '<button class="btn-secondary" style="flex:1" onclick="window.openUpdatePayment()">Update Payment</button>' +
      '<button class="btn-danger"    style="flex:1" onclick="window.deleteSale()">Delete</button>' +
    '</div>';

  openModal('modal-sale-detail');
}

// ── UPDATE PAYMENT STATUS ─────────────────────────────────────
export async function openUpdatePayment() {
  const s = STATE.sales.find(x => x.id === window._editSaleId);
  if (!s) return;

  // Simple inline prompt via confirm-style
  const status = prompt(
    'Update payment status\nCurrent: ' + s.paymentStatus +
    '\n\nType: paid / partial / pending'
  );
  if (!['paid','partial','pending'].includes(status)) return;

  let paid = s.totalRevenue;
  if (status === 'partial') {
    const amt = prompt('Amount paid so far (₹)?');
    if (!amt) return;
    paid = Math.min(Number(amt), s.totalRevenue);
  }
  if (status === 'pending') paid = 0;

  const pending = Math.max(0, s.totalRevenue - paid);

  await DB.update('sales/' + window._editSaleId, {
    paymentStatus: status,
    amountPaid:    paid,
    amountPending: pending,
    modifiedAt:    nowISO(),
    modifiedBy:    STATE.user.name,
  });

  toast('Payment updated!');
  closeModal('modal-sale-detail');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
}

// ── DELETE SALE ───────────────────────────────────────────────
export async function deleteSale() {
  const s  = STATE.sales.find(x => x.id === window._editSaleId);
  if (!s) return;

  const ok = await showConfirm(
    'Delete this sale?',
    s.clientName + ' — ' + fmt(s.totalRevenue) + '\nThis cannot be undone.'
  );
  if (!ok) return;

  await DB.remove('sales/' + window._editSaleId);
  toast('Sale deleted');
  closeModal('modal-sale-detail');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.openSaleDetail    = openSaleDetail;
window.openSaleModal     = openSaleModal;
window.submitSale        = submitSale;
window.openUpdatePayment = openUpdatePayment;
window.deleteSale        = deleteSale;
window._loadSaleRows     = _loadSaleRows;
window._calcSaleTotal    = _calcSaleTotal;
window._togglePaidField  = _togglePaidField;