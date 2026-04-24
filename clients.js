// clients.js
import { DB, objToArr, fmt, today, nowISO, colorFor, initials } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';
import { getCatName } from './settings.js';

// ── RENDER CLIENTS PAGE ───────────────────────────────────────
export function renderClients() {
  _wireChips();

  const filter = document.querySelector('#cli-chips .chip-f.on')?.dataset.f || 'all';
  const sort   = document.getElementById('cli-sort')?.value || 'recent';
  const search = (document.getElementById('cli-search')?.value || '').toLowerCase();

  let list = STATE.clients.filter(c => {
    if (search && !c.name?.toLowerCase().includes(search) &&
        !c.location?.toLowerCase().includes(search)) return false;
    if (filter === 'pending') {
      const owes = STATE.sales.some(
        s => s.clientId === c.id && s.paymentStatus !== 'paid' && Number(s.amountPending || 0) > 0
      );
      if (!owes) return false;
    }
    return true;
  });

  // Sort
  if (sort === 'alpha') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // recent — newest createdAt first
    list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
  }

  document.getElementById('cli-count').textContent = list.length + ' Clients';
  const el = document.getElementById('cli-list');

  if (!list.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">&#128101;</div>' +
        '<div class="empty-text">No clients yet</div>' +
        '<div class="empty-sub">Tap + to add your first client</div>' +
      '</div>';
    return;
  }

  el.innerHTML = '<div class="card">';
  list.forEach(c => {
    const totalPending = STATE.sales
      .filter(s => s.clientId === c.id && s.paymentStatus !== 'paid')
      .reduce((s, r) => s + Number(r.amountPending || 0), 0);
    const orderCount = STATE.sales.filter(s => s.clientId === c.id).length;

    const payBadge = totalPending > 0
      ? '<div style="font-size:13px;font-weight:800;color:var(--red)">' + fmt(totalPending) + ' due</div>'
      : '<span class="badge b-green">Clear</span>';

    el.innerHTML +=
      '<div class="li" onclick="window.openClientDetail(\'' + c.id + '\')" style="cursor:pointer">' +
        '<div class="li-av" style="background:' + colorFor(c.id) + '">' + initials(c.name) + '</div>' +
        '<div class="li-info">' +
          '<div class="li-name">' + c.name + '</div>' +
          '<div class="li-sub">&#128205; ' + (c.location || '—') + ' &middot; ' + orderCount + ' orders</div>' +
        '</div>' +
        '<div class="li-right">' + payBadge + '</div>' +
      '</div>';
  });
  el.innerHTML += '</div>';
}

function _wireChips() {
  document.querySelectorAll('#cli-chips .chip-f').forEach(ch => {
    ch.onclick = () => {
      document.querySelectorAll('#cli-chips .chip-f').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      renderClients();
    };
  });
}

// ── OPEN CLIENT MODAL (add / edit) ────────────────────────────
export function openClientModal(editId = null) {
  window._editCliId = editId || null;
  const c = editId ? STATE.clients.find(x => x.id === editId) : null;

  document.getElementById('cli-modal-title').textContent = editId ? 'Edit Client' : 'New Client';

  // Build form first — this creates the input elements
  _buildPriceRows(c);

  // Now set values after inputs exist in the DOM
  document.getElementById('c-name').value  = c?.name     || '';
  document.getElementById('c-loc').value   = c?.location || '';
  document.getElementById('c-phone').value = c?.phone    || '';
  document.getElementById('c-notes').value = c?.notes    || '';

  if (editId) closeModal('modal-cli-detail');
  openModal('modal-client');
}

function _buildPriceRows(c = null) {
  const el = document.getElementById('client-body');
  if (!el) return;

  el.innerHTML =
    '<div class="form-group"><label class="form-label">Client Name *</label>' +
      '<input class="form-input" id="c-name" placeholder="e.g. Royal Sweets"/></div>' +
    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Location *</label>' +
        '<input class="form-input" id="c-loc" placeholder="Area / City"/></div>' +
      '<div class="form-group"><label class="form-label">Phone *</label>' +
        '<input class="form-input" id="c-phone" placeholder="+91..."/></div>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">Notes (optional)</label>' +
      '<input class="form-input" id="c-notes" placeholder="Any remarks..."/></div>' +
    '<div class="sec-hdr"><span class="sec-title">Selling Price per Pack &#8377; (set at least one)</span></div>';

  STATE.settings.packCategories.forEach(cat => {
    const existing = c?.categories?.[cat.id]?.sellingPrice || '';
    el.innerHTML +=
      '<div class="pack-card">' +
        '<div class="pack-card-title">' + cat.model + ' ' + cat.size + '</div>' +
        '<label class="form-label">Selling Price / Pack (&#8377;)</label>' +
        '<input class="pack-input" type="number" inputmode="numeric"' +
          ' id="csp_' + cat.id + '" placeholder="0 = not sold to this client"' +
          ' value="' + existing + '"/>' +
      '</div>';
  });

  el.innerHTML +=
    '<button class="btn-primary" style="margin-top:16px" onclick="submitClient()">Save Client</button>';

  // Restore values if editing
  if (c) {
    document.getElementById('c-name').value  = c.name     || '';
    document.getElementById('c-loc').value   = c.location || '';
    document.getElementById('c-phone').value = c.phone    || '';
    document.getElementById('c-notes').value = c.notes    || '';
  }
}

// ── SUBMIT CLIENT ─────────────────────────────────────────────
export async function submitClient() {
  const name  = document.getElementById('c-name')?.value.trim();
  const loc   = document.getElementById('c-loc')?.value.trim();
  const phone = document.getElementById('c-phone')?.value.trim();

  if (!name)  { toast('Client name is required', true); return; }
  if (!loc)   { toast('Location is required',    true); return; }
  if (!phone) { toast('Phone is required',       true); return; }

  // Collect selling prices
  const categories = {};
  let hasPrices = false;
  STATE.settings.packCategories.forEach(cat => {
    const price = Number(document.getElementById('csp_' + cat.id)?.value || 0);
    if (price > 0) {
      const existing = window._editCliId
        ? STATE.clients.find(x => x.id === window._editCliId)?.categories?.[cat.id]
        : null;
      categories[cat.id] = {
        sellingPrice:  price,
        priceHistory:  existing?.priceHistory || [],
      };
      hasPrices = true;
    }
  });

  if (!hasPrices) { toast('Set at least one selling price', true); return; }

  // Build labels structure — auto-create entry for each category with price
  const existingLabels = window._editCliId
    ? STATE.clients.find(x => x.id === window._editCliId)?.labels || {}
    : {};
  const labels = { ...existingLabels };
  Object.keys(categories).forEach(catId => {
    if (!labels[catId]) {
      labels[catId] = { totalLabels: 0, sheetsAdded: 0, labelsUsed: 0, labelsWasted: 0 };
    }
  });

  const data = {
    name, location: loc, phone,
    notes:      document.getElementById('c-notes')?.value || '',
    categories, labels,
    active:     true,
    createdAt:  window._editCliId
      ? STATE.clients.find(x => x.id === window._editCliId)?.createdAt || nowISO()
      : nowISO(),
    createdBy:  window._editCliId
      ? STATE.clients.find(x => x.id === window._editCliId)?.createdBy || STATE.user.name
      : STATE.user.name,
    modifiedAt: nowISO(),
    modifiedBy: STATE.user.name,
  };

  const btn = document.querySelector('#modal-client .btn-primary');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    if (window._editCliId) {
      await DB.update('clients/' + window._editCliId, data);
      toast('Client updated!');
    } else {
      await DB.push('clients', data);
      toast('Client added!');
    }
    closeModal('modal-client');
    window.dispatchEvent(new CustomEvent('zp:data-changed'));
  } catch (err) {
    toast('Failed: ' + err.message, true);
  } finally {
    if (btn) { btn.textContent = 'Save Client'; btn.disabled = false; }
  }
}

// ── CLIENT DETAIL MODAL ───────────────────────────────────────
export function openClientDetail(clientId) {
  window._editCliId = clientId;
  const c = STATE.clients.find(x => x.id === clientId);
  if (!c) return;

  // Header
  const av = document.getElementById('cdet-av');
  av.textContent   = initials(c.name);
  av.style.background = colorFor(c.id);
  document.getElementById('cdet-name').textContent = c.name;
  document.getElementById('cdet-sub').textContent  = '📍 ' + (c.location || '—') + '  📞 ' + (c.phone || '—');

  // Body
  const cSales   = STATE.sales.filter(s => s.clientId === clientId);
  const totalRev = cSales.reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
  const pending  = cSales.filter(s => s.paymentStatus !== 'paid')
                         .reduce((s, r) => s + Number(r.amountPending || 0), 0);

  let priceRows = '';
  Object.entries(c.categories || {}).forEach(([catId, cat]) => {
    priceRows +=
      '<div class="info-row">' +
        '<span class="info-label">' + getCatName(catId) + '</span>' +
        '<span class="info-val">' + fmt(cat.sellingPrice) + '/pack</span>' +
      '</div>';
  });

  // Price update select
  const catOpts = Object.keys(c.categories || {}).map(catId =>
    '<option value="' + catId + '">' + getCatName(catId) + '</option>'
  ).join('');

  document.getElementById('cdet-body').innerHTML =
    '<div class="card-sm" style="margin-bottom:12px">' +
      '<div class="sec-title" style="margin-bottom:8px">Selling Prices</div>' +
      (priceRows || '<div style="font-size:13px;color:var(--text3)">No prices set</div>') +
    '</div>' +

    '<div class="card-sm" style="margin-bottom:12px">' +
      '<div class="sec-title" style="margin-bottom:8px">Orders Summary</div>' +
      '<div class="info-row"><span class="info-label">Total Orders</span><span class="info-val">' + cSales.length + '</span></div>' +
      '<div class="info-row"><span class="info-label">Total Revenue</span><span class="info-val">' + fmt(totalRev) + '</span></div>' +
      '<div class="info-row" style="border:none"><span class="info-label">Pending Amount</span>' +
        '<span class="info-val" style="color:var(--red)">' + fmt(pending) + '</span></div>' +
    '</div>' +

    '<div class="card-sm" style="margin-bottom:16px">' +
      '<div class="sec-title" style="margin-bottom:10px">Update Selling Price</div>' +
      '<div class="form-row" style="margin-bottom:10px">' +
        '<div class="form-group" style="margin-bottom:0">' +
          '<label class="form-label">Pack Type</label>' +
          '<select class="form-select" id="cdet-cat-sel">' + catOpts + '</select>' +
        '</div>' +
        '<div class="form-group" style="margin-bottom:0">' +
          '<label class="form-label">New Price (&#8377;)</label>' +
          '<input class="form-input" type="number" inputmode="numeric" id="cdet-new-price" placeholder="0"/>' +
        '</div>' +
      '</div>' +
      '<button class="btn-primary" style="padding:11px" onclick="window.submitPriceUpdate()">Update Price</button>' +
    '</div>' +

    '<div style="display:flex;gap:10px">' +
      '<button class="btn-secondary" style="flex:1" onclick="window.openClientModal(\'' + clientId + '\')">Edit</button>' +
      '<button class="btn-danger"    style="flex:1" onclick="window.deleteClient()">Delete</button>' +
    '</div>';

  openModal('modal-cli-detail');
}

// ── UPDATE PRICE ──────────────────────────────────────────────
export async function submitPriceUpdate() {
  const clientId = window._editCliId;
  const catId    = document.getElementById('cdet-cat-sel')?.value;
  const newPrice = Number(document.getElementById('cdet-new-price')?.value || 0);

  if (!newPrice) { toast('Enter new price', true); return; }

  const c        = STATE.clients.find(x => x.id === clientId);
  const oldPrice = c?.categories?.[catId]?.sellingPrice || 0;
  const history  = [
    ...(c?.categories?.[catId]?.priceHistory || []),
    { oldPrice, newPrice, date: today(), changedBy: STATE.user.name },
  ];

  await DB.update('clients/' + clientId + '/categories/' + catId, {
    sellingPrice: newPrice,
    priceHistory: history,
  });

  toast('Price updated!');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
  // Reopen detail with fresh data after reload
  setTimeout(() => openClientDetail(clientId), 600);
}

// ── DELETE CLIENT ─────────────────────────────────────────────
export async function deleteClient() {
  const clientId = window._editCliId;
  const c        = STATE.clients.find(x => x.id === clientId);
  if (!c) return;

  const ok = await showConfirm('Delete ' + c.name + '?', 'This client will be removed from the app.');
  if (!ok) return;

  await DB.update('clients/' + clientId, { active: false });
  toast('Client deleted');
  closeModal('modal-cli-detail');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.openClientDetail  = openClientDetail;
window.openClientModal   = openClientModal;
window.submitClient      = submitClient;
window.submitPriceUpdate = submitPriceUpdate;
window.deleteClient      = deleteClient;
