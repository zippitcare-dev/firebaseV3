// batches.js
import { DB, objToArr, fmt, today, nowISO, colorFor } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';
import { getCatName } from './settings.js';

// ── RENDER INVENTORY PAGE ─────────────────────────────────────
export function renderInventory() {
  _wireChips();

  const filter = document.querySelector('#inv-chips .chip-f.on')?.dataset.f || 'active';
  const list   = _filteredBatches(filter);

  // Summary counts
  document.getElementById('inv-batch-count').textContent = list.length;

  // Total remaining packs across filtered batches
  let totalPacks = 0;
  const catTotals = {}; // catId -> qty

  list.forEach(b => {
    Object.values(b.items || {}).forEach(it => {
      const rem = Number(it.qtyRemaining || 0);
      totalPacks += rem;
      if (rem > 0) {
        catTotals[it.categoryId] = (catTotals[it.categoryId] || 0) + rem;
      }
    });
  });

  document.getElementById('inv-pack-count').textContent = totalPacks.toLocaleString();

  // Per-category summary chips (red if < 20)
  const summaryEl = document.getElementById('inv-cat-summary');
  summaryEl.innerHTML = '';
  Object.entries(catTotals).forEach(([catId, qty]) => {
    const chip = document.createElement('div');
    chip.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 12px;font-size:12px;text-align:center;min-width:80px';
    chip.innerHTML =
      '<div style="color:var(--text2);margin-bottom:2px">' + getCatName(catId) + '</div>' +
      '<div style="font-weight:800;font-size:15px;color:' + (qty < 20 ? 'var(--red)' : 'var(--text)') + '">' +
        qty.toLocaleString() + (qty < 20 ? ' &#9888;' : '') +
      '</div>';
    summaryEl.appendChild(chip);
  });

  // Batch list
  const el = document.getElementById('inv-list');

  if (!list.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">&#128230;</div>' +
        '<div class="empty-text">No batches</div>' +
        '<div class="empty-sub">' +
          (filter === 'soldout' ? 'No sold out batches' :
           filter === 'active'  ? 'No active batches — tap + to add' :
           'No batches yet — tap + to add') +
        '</div>' +
      '</div>';
    return;
  }

  el.innerHTML = '';
  [...list].sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1).forEach(b => {
    el.appendChild(_batchCard(b));
  });
}

function _filteredBatches(filter) {
  return STATE.batches.filter(b => {
    if (b.deleted) return false;
    const so = _isSoldOut(b);
    if (filter === 'active')  return !so;
    if (filter === 'soldout') return  so;
    return true; // all
  });
}

function _isSoldOut(b) {
  const items = Object.values(b.items || {});
  if (!items.length) return false;
  return items.every(it => Number(it.qtyRemaining || 0) <= 0);
}

function _batchCard(b) {
  const items  = Object.values(b.items || {});
  const so     = _isSoldOut(b);
  const card   = document.createElement('div');
  card.className = 'card';
  card.style.cursor = 'pointer';
  card.onclick = () => openBatchDetail(b.id);

  const itemsHtml = items.map(it => {
    const rem = Number(it.qtyRemaining || 0);
    return '<div style="background:var(--surface2);border-radius:8px;padding:8px 10px">' +
      '<div style="font-size:11px;color:var(--text2);margin-bottom:2px">' + getCatName(it.categoryId) + '</div>' +
      '<div style="font-weight:800;font-size:14px;color:' + (rem < 20 ? 'var(--red)' : 'var(--text)') + '">' +
        rem.toLocaleString() + ' left' +
      '</div>' +
      '<div style="font-size:10px;color:var(--accent)">' + fmt(it.totalCostPerPack || 0) + '/pack</div>' +
    '</div>';
  }).join('');

  card.innerHTML =
    '<div class="card-header">' +
      '<div>' +
        '<div style="font-size:16px;font-weight:800;color:var(--text)">' + b.batchNo + '</div>' +
        '<div style="font-size:12px;color:var(--text2);margin-top:2px">&#128197; ' +
          (b.purchaseDate || '—') + ' &middot; By ' + (b.createdBy || '—') +
        '</div>' +
      '</div>' +
      '<span class="badge ' + (so ? 'b-red' : 'b-green') + '">' + (so ? 'Sold Out' : 'Active') + '</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-bottom:10px">' +
      itemsHtml +
    '</div>' +
    '<div style="font-size:11px;color:var(--text3)">' +
      'Delivery: ' + fmt(b.deliveryCharge || 0) +
      ' &middot; ' + Object.values(b.items || {}).reduce((s, it) => s + Number(it.qtyBought || 0), 0).toLocaleString() + ' bought' +
    '</div>';

  return card;
}

function _wireChips() {
  document.querySelectorAll('#inv-chips .chip-f').forEach(ch => {
    ch.onclick = () => {
      document.querySelectorAll('#inv-chips .chip-f').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      renderInventory();
    };
  });
}

// ── BATCH DETAIL MODAL ────────────────────────────────────────
export function openBatchDetail(batchId) {
  window._detailBatchId = batchId;
  const b = STATE.batches.find(x => x.id === batchId);
  if (!b) return;

  document.getElementById('bd-title').textContent = b.batchNo;
  document.getElementById('bd-sub').textContent   = (b.purchaseDate || '—') + ' · By ' + (b.createdBy || '—');

  const items   = Object.values(b.items || {});
  const so      = _isSoldOut(b);
  const hasSales = STATE.sales.some(s => s.batchId === batchId);

  let itemsHtml = items.map(it =>
    '<div class="info-row">' +
      '<span class="info-label">' + getCatName(it.categoryId) + '</span>' +
      '<div style="text-align:right">' +
        '<div style="font-weight:700">' + (it.qtyRemaining || 0) + ' remaining / ' + (it.qtyBought || 0) + ' bought</div>' +
        '<div style="font-size:11px;color:var(--text2)">' +
          'Sold: ' + (it.qtySold || 0) +
          ' &middot; Wasted: ' + (it.qtyWasted || 0) +
          ' &middot; ' + fmt(it.totalCostPerPack || 0) + '/pack' +
        '</div>' +
      '</div>' +
    '</div>'
  ).join('');

  itemsHtml +=
    '<div class="info-row"><span class="info-label">Delivery Charge</span><span class="info-val">' + fmt(b.deliveryCharge || 0) + '</span></div>' +
    '<div class="info-row" style="border:none"><span class="info-label">Notes</span><span class="info-val">' + (b.notes || '—') + '</span></div>';

  const soLabel = so ? 'Mark Active' : 'Mark Sold Out';

  const deleteSection = hasSales
    ? '<div style="background:var(--amber-d);border-radius:var(--r8);padding:10px 12px;font-size:12px;color:var(--amber);margin-top:12px">' +
        '&#9888; Cannot delete — sales have been recorded from this batch.' +
      '</div>'
    : '<div class="divider"></div>' +
      '<div class="form-group">' +
        '<label class="form-label">Delete Reason (required)</label>' +
        '<input class="form-input" id="bd-delete-note" placeholder="Reason for deletion..."/>' +
      '</div>' +
      '<button class="btn-danger" style="width:100%" onclick="window.deleteBatch()">Delete Batch</button>';

  document.getElementById('bd-body').innerHTML =
    '<div class="card-sm" style="margin-bottom:12px">' + itemsHtml + '</div>' +
    '<button class="btn-secondary" style="width:100%;margin-bottom:10px" onclick="window.openBatchWastageModal(\'' + batchId + '\')">' +
      'Mark Pack Wastage' +
    '</button>' +
    '<button class="btn-secondary" style="width:100%;margin-bottom:10px" onclick="window.toggleSoldOut(\'' + batchId + '\')">' +
      soLabel +
    '</button>' +
    deleteSection;

  openModal('modal-batch-detail');
}

// ── TOGGLE SOLD OUT ───────────────────────────────────────────
export async function toggleSoldOut(batchId) {
  const b  = STATE.batches.find(x => x.id === batchId);
  if (!b) return;
  const so = _isSoldOut(b);

  const updates = {};
  Object.keys(b.items || {}).forEach(catId => {
    if (so) {
      // Restore: remaining = bought - sold - wasted
      const it  = b.items[catId];
      const rem = Math.max(0, Number(it.qtyBought || 0) - Number(it.qtySold || 0) - Number(it.qtyWasted || 0));
      updates['batches/' + batchId + '/items/' + catId + '/qtyRemaining'] = rem;
    } else {
      updates['batches/' + batchId + '/items/' + catId + '/qtyRemaining'] = 0;
    }
  });

  await DB.multiUpdate(updates);
  toast(so ? 'Batch marked Active' : 'Batch marked Sold Out');
  closeModal('modal-batch-detail');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
}

// ── DELETE BATCH ──────────────────────────────────────────────
export async function deleteBatch() {
  const batchId = window._detailBatchId;
  const b       = STATE.batches.find(x => x.id === batchId);
  if (!b) return;

  const note = (document.getElementById('bd-delete-note')?.value || '').trim();
  if (!note) { toast('Enter a reason before deleting', true); return; }

  const ok = await showConfirm('Delete batch ' + b.batchNo + '?', 'Reason: "' + note + '"\n\nThis cannot be undone.');
  if (!ok) return;

  await DB.update('batches/' + batchId, {
    deleted: true, deletedNote: note,
    deletedAt: nowISO(), deletedBy: STATE.user.name,
  });

  toast('Batch deleted');
  closeModal('modal-batch-detail');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
}

// ── OPEN ADD BATCH MODAL ──────────────────────────────────────
export function openBatchModal() {
  document.getElementById('b-no').value       = '';
  document.getElementById('b-date').value     = today();
  document.getElementById('b-delivery').value = '';
  document.getElementById('b-notes').value    = '';
  _buildBatchItemRows();
  _updateBatchPreview();
  openModal('modal-batch');
}

function _buildBatchItemRows() {
  const el = document.getElementById('batch-item-rows');
  if (!el) return;
  el.innerHTML = '';

  STATE.settings.packCategories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'pack-card';
    row.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<span style="font-size:14px;font-weight:700">' + cat.model + ' ' + cat.size + '</span>' +
        '<span style="font-size:11px;color:var(--text2)">' + cat.bottlesPerPack + ' bottles/pack</span>' +
      '</div>' +
      '<div class="form-row">' +
        '<div>' +
          '<label class="form-label">Qty (packs)</label>' +
          '<input class="pack-input" type="number" inputmode="numeric" id="bq_' + cat.id + '" placeholder="0" oninput="window._updateBatchPreview()"/>' +
        '</div>' +
        '<div>' +
          '<label class="form-label">Buy cost/pack (&#8377;)</label>' +
          '<input class="pack-input" type="number" inputmode="numeric" id="bc_' + cat.id + '" placeholder="0" oninput="window._updateBatchPreview()"/>' +
        '</div>' +
      '</div>' +
      '<div class="pack-preview" id="bprev_' + cat.id + '"></div>';
    el.appendChild(row);
  });
}

export function _updateBatchPreview() {
  const delivery = Number(document.getElementById('b-delivery')?.value || 0);
  let totalPacks = 0;
  STATE.settings.packCategories.forEach(c => {
    totalPacks += Number(document.getElementById('bq_' + c.id)?.value || 0);
  });
  const dpb = totalPacks > 0 ? delivery / totalPacks : 0;

  STATE.settings.packCategories.forEach(c => {
    const qty  = Number(document.getElementById('bq_' + c.id)?.value || 0);
    const cost = Number(document.getElementById('bc_' + c.id)?.value || 0);
    const prev = document.getElementById('bprev_' + c.id);
    if (!prev) return;
    if (qty > 0 && cost > 0) {
      prev.textContent = 'Buy ' + fmt(cost) + ' + delivery ' + fmt(dpb) + ' = ' + fmt(cost + dpb) + '/pack';
    } else {
      prev.textContent = '';
    }
  });
}

// ── SUBMIT BATCH ──────────────────────────────────────────────
export async function submitBatch() {
  const batchNo  = document.getElementById('b-no').value.trim();
  const date     = document.getElementById('b-date').value;
  const delivery = Number(document.getElementById('b-delivery').value || 0);
  const notes    = document.getElementById('b-notes').value.trim();

  if (!batchNo) { toast('Enter batch number', true); return; }
  if (!date)    { toast('Select purchase date', true); return; }

  // Collect items
  let totalPacks = 0;
  const items    = {};

  STATE.settings.packCategories.forEach(cat => {
    const qty  = Number(document.getElementById('bq_' + cat.id)?.value || 0);
    const cost = Number(document.getElementById('bc_' + cat.id)?.value || 0);
    if (qty > 0) {
      totalPacks += qty;
      items[cat.id] = {
        categoryId:       cat.id,
        qtyBought:        qty,
        buyingCostPerPack: cost,
        qtySold:          0,
        qtyWasted:        0,
        qtyRemaining:     qty,
        deliveryShare:    0,        // calculated below
        totalCostPerPack: 0,        // calculated below
      };
    }
  });

  if (!totalPacks) { toast('Add at least one pack type with quantity', true); return; }

  // Apply delivery share
  const dpb = totalPacks > 0 ? delivery / totalPacks : 0;
  Object.keys(items).forEach(catId => {
    items[catId].deliveryShare    = dpb;
    items[catId].totalCostPerPack = items[catId].buyingCostPerPack + dpb;
  });

  const btn = document.querySelector('#modal-batch .btn-primary');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    await DB.push('batches', {
      batchNo, purchaseDate: date,
      deliveryCharge: delivery, totalPacks, items, notes,
      deleted: false,
      createdAt:  nowISO(), createdBy:  STATE.user.name,
      modifiedAt: nowISO(), modifiedBy: STATE.user.name,
    });

    toast('Batch saved!');
    closeModal('modal-batch');
    window.dispatchEvent(new CustomEvent('zp:data-changed'));
  } catch (err) {
    toast('Failed to save: ' + err.message, true);
  } finally {
    if (btn) { btn.textContent = 'Save Batch'; btn.disabled = false; }
  }
}

// ── WASTAGE MODAL ─────────────────────────────────────────────
export function openBatchWastageModal(batchId) {
  window._wasteBatchId = batchId;
  const b = STATE.batches.find(x => x.id === batchId);
  if (!b) return;

  const sel = document.getElementById('w-cat');
  sel.innerHTML = '<option value="">— Select pack type —</option>' +
    Object.values(b.items || {})
      .filter(it => Number(it.qtyRemaining || 0) > 0)
      .map(it =>
        '<option value="' + it.categoryId + '">' +
          getCatName(it.categoryId) + ' (' + it.qtyRemaining + ' remaining)' +
        '</option>'
      ).join('');

  document.getElementById('w-qty').value  = '';
  document.getElementById('w-note').value = '';

  closeModal('modal-batch-detail');
  openModal('modal-wastage');
}

export async function submitBatchWastage() {
  const batchId = window._wasteBatchId;
  const catId   = document.getElementById('w-cat').value;
  const qty     = Number(document.getElementById('w-qty').value || 0);
  const note    = document.getElementById('w-note').value.trim();

  if (!catId) { toast('Select a pack type', true); return; }
  if (!qty)   { toast('Enter quantity',     true); return; }
  if (!note)  { toast('Enter a reason — it is required', true); return; }

  const b  = STATE.batches.find(x => x.id === batchId);
  const it = b?.items?.[catId];
  if (!it) { toast('Pack type not found in batch', true); return; }

  const remaining = Number(it.qtyRemaining || 0);
  if (qty > remaining) { toast('Only ' + remaining + ' packs remaining', true); return; }

  const ok = await showConfirm(
    'Mark ' + qty + ' packs as wastage?',
    getCatName(catId) + ' from batch ' + b.batchNo + '\nReason: "' + note + '"'
  );
  if (!ok) return;

  await DB.multiUpdate({
    ['batches/' + batchId + '/items/' + catId + '/qtyRemaining']: remaining - qty,
    ['batches/' + batchId + '/items/' + catId + '/qtyWasted']:    Number(it.qtyWasted || 0) + qty,
  });

  await DB.push('wastage', {
    type:       'pack',
    batchId,
    batchNo:    b.batchNo,
    categoryId: catId,
    qty, note,
    cost:       (it.totalCostPerPack || 0) * qty,
    createdAt:  nowISO(),
    createdBy:  STATE.user.name,
  });

  toast('Wastage recorded');
  closeModal('modal-wastage');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.openBatchDetail       = openBatchDetail;
window.openBatchWastageModal = openBatchWastageModal;
window.submitBatchWastage    = submitBatchWastage;
window.toggleSoldOut         = toggleSoldOut;
window.deleteBatch           = deleteBatch;
window._updateBatchPreview   = _updateBatchPreview;
