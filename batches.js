// batches.js
import { DB, objToArr, fmt, today, nowISO } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';
import { getCatName } from './settings.js';

// ── HELPERS ───────────────────────────────────────────────────
export function isBatchSoldOut(b) {
  return Number(b.qtyRemaining || 0) <= 0;
}

export function hasSales(batchId) {
  return STATE.sales.some(s => s.batchId === batchId);
}

// ── RENDER INVENTORY PAGE ─────────────────────────────────────
export function renderInventory() {
  _wireChips();

  const filter = document.querySelector('#inv-chips .chip-f.on')?.dataset.f || 'active';

  const list = STATE.batches.filter(b => {
    if (b.deleted) return false;
    const so = isBatchSoldOut(b);
    if (filter === 'active')  return !so;
    if (filter === 'soldout') return  so;
    return true;
  });

  document.getElementById('inv-batch-count').textContent = list.length;

  // Per-category pack summary across filtered batches
  const catTotals = {};
  list.forEach(b => {
    const catId = b.categoryId;
    const rem   = Number(b.qtyRemaining || 0);
    if (catId && rem > 0) {
      catTotals[catId] = (catTotals[catId] || 0) + rem;
    }
  });
  const totalPacks = Object.values(catTotals).reduce((s, v) => s + v, 0);
  document.getElementById('inv-pack-count').textContent = totalPacks.toLocaleString();

  // Category summary chips
  const summaryEl = document.getElementById('inv-cat-summary');
  summaryEl.innerHTML = '';
  Object.entries(catTotals).forEach(([catId, qty]) => {
    const chip = document.createElement('div');
    chip.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 12px;font-size:12px;text-align:center;min-width:90px';
    chip.innerHTML =
      '<div style="color:var(--text2);margin-bottom:2px;font-size:11px">' + getCatName(catId) + '</div>' +
      '<div style="font-weight:800;font-size:15px;color:' + (qty < 20 ? 'var(--red)' : 'var(--text)') + '">' +
        qty.toLocaleString() + (qty < 20 ? ' ⚠️' : '') +
      '</div>';
    summaryEl.appendChild(chip);
  });

  // Batch list
  const el = document.getElementById('inv-list');
  if (!list.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">📦</div>' +
        '<div class="empty-text">No batches</div>' +
        '<div class="empty-sub">' +
          (filter === 'soldout' ? 'No sold out batches' :
           filter === 'active'  ? 'No active batches — tap + to add' :
           'No batches yet') +
        '</div>' +
      '</div>';
    return;
  }

  el.innerHTML = '';
  [...list].sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1)
    .forEach(b => el.appendChild(_batchCard(b)));
}

function _batchCard(b) {
  const so       = isBatchSoldOut(b);
  const card     = document.createElement('div');
  card.className = 'card';
  card.style.cursor = 'pointer';
  card.onclick   = () => openBatchDetail(b.id);

  const editBadge = b.isEditable
    ? '<span class="badge b-blue" style="margin-left:6px">Editable</span>'
    : '';

  card.innerHTML =
    '<div class="card-header">' +
      '<div>' +
        '<div style="font-size:16px;font-weight:800;color:var(--text)">' + b.batchNo + editBadge + '</div>' +
        '<div style="font-size:12px;color:var(--text2);margin-top:2px">' +
          '📅 ' + (b.purchaseDate || '—') + ' · ' + getCatName(b.categoryId) + ' · By ' + (b.createdBy || '—') +
        '</div>' +
      '</div>' +
      '<span class="badge ' + (so ? 'b-red' : 'b-green') + '">' + (so ? 'Sold Out' : 'Active') + '</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">' +
      '<div style="background:var(--surface2);border-radius:8px;padding:8px;text-align:center">' +
        '<div style="font-size:11px;color:var(--text2)">Remaining</div>' +
        '<div style="font-weight:800;font-size:16px;color:' + (Number(b.qtyRemaining||0) < 20 ? 'var(--red)' : 'var(--text)') + '">' + (b.qtyRemaining || 0) + '</div>' +
      '</div>' +
      '<div style="background:var(--surface2);border-radius:8px;padding:8px;text-align:center">' +
        '<div style="font-size:11px;color:var(--text2)">Sold</div>' +
        '<div style="font-weight:800;font-size:16px;color:var(--green)">' + (b.qtySold || 0) + '</div>' +
      '</div>' +
      '<div style="background:var(--surface2);border-radius:8px;padding:8px;text-align:center">' +
        '<div style="font-size:11px;color:var(--text2)">Wasted</div>' +
        '<div style="font-weight:800;font-size:16px;color:var(--red)">' + (b.qtyWasted || 0) + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--text2)">' +
      'Cost: ' + fmt(b.totalCostPerPack || 0) + '/pack · ' +
      'Delivery: ' + fmt(b.deliveryCharge || 0) + ' · ' +
      (b.qtyBought || 0) + ' bought total' +
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
  document.getElementById('bd-sub').textContent   = (b.purchaseDate || '—') + ' · ' + getCatName(b.categoryId) + ' · By ' + (b.createdBy || '—');

  const so       = isBatchSoldOut(b);
  const canDel   = !hasSales(batchId);
  const totalBought = Number(b.qtyBought || 0);
  const totalCost   = totalBought * Number(b.buyingCostPerPack || 0) + Number(b.deliveryCharge || 0);

  const detailHtml =
    '<div class="info-row"><span class="info-label">Pack Type</span><span class="info-val">' + getCatName(b.categoryId) + '</span></div>' +
    '<div class="info-row"><span class="info-label">Total Bought</span><span class="info-val">' + totalBought + ' packs</span></div>' +
    '<div class="info-row"><span class="info-label">Remaining</span><span class="info-val" style="color:' + (Number(b.qtyRemaining||0)<20?'var(--red)':'var(--text)') + '">' + (b.qtyRemaining || 0) + ' packs</span></div>' +
    '<div class="info-row"><span class="info-label">Sold</span><span class="info-val" style="color:var(--green)">' + (b.qtySold || 0) + ' packs</span></div>' +
    '<div class="info-row"><span class="info-label">Wasted</span><span class="info-val" style="color:var(--red)">' + (b.qtyWasted || 0) + ' packs</span></div>' +
    '<div class="divider"></div>' +
    '<div class="info-row"><span class="info-label">Buying Cost/Pack</span><span class="info-val">' + fmt(b.buyingCostPerPack || 0) + '</span></div>' +
    '<div class="info-row"><span class="info-label">Delivery/Pack</span><span class="info-val">' + fmt(b.deliveryShare || 0) + '</span></div>' +
    '<div class="info-row"><span class="info-label">Total Cost/Pack</span><span class="info-val" style="color:var(--accent)">' + fmt(b.totalCostPerPack || 0) + '</span></div>' +
    '<div class="info-row"><span class="info-label">Total Batch Cost</span><span class="info-val">' + fmt(totalCost) + '</span></div>' +
    (b.notes ? '<div class="info-row" style="border:none"><span class="info-label">Notes</span><span class="info-val">' + b.notes + '</span></div>' : '');

  const addStockSection = b.isEditable
    ? '<div class="divider"></div>' +
      '<div class="sec-title" style="margin-bottom:10px">Add More Stock</div>' +
      '<div class="form-row" style="margin-bottom:10px">' +
        '<div class="form-group" style="margin-bottom:0">' +
          '<label class="form-label">Packs to Add</label>' +
          '<input class="form-input" type="number" inputmode="numeric" id="bd-add-qty" placeholder="0"/>' +
        '</div>' +
        '<div class="form-group" style="margin-bottom:0">' +
          '<label class="form-label">New Delivery (₹)</label>' +
          '<input class="form-input" type="number" inputmode="numeric" id="bd-add-delivery" placeholder="0"/>' +
        '</div>' +
      '</div>' +
      '<button class="btn-primary" style="padding:11px;margin-bottom:12px" onclick="window.addStockToBatch()">Add Stock</button>'
    : '';

  const soLabel = so ? 'Mark Active' : 'Mark Sold Out';

  const deleteSection = canDel
    ? '<div class="divider"></div>' +
      '<div class="form-group">' +
        '<label class="form-label">Delete Reason (required)</label>' +
        '<input class="form-input" id="bd-delete-note" placeholder="Reason for deletion..."/>' +
      '</div>' +
      '<button class="btn-danger" style="width:100%" onclick="window.deleteBatch()">Delete Batch</button>'
    : '<div style="background:var(--amber-d);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--amber);margin-top:12px">' +
        '⚠️ Cannot delete — sales have been made from this batch.' +
      '</div>';

  document.getElementById('bd-body').innerHTML =
    '<div class="card-sm" style="margin-bottom:12px">' + detailHtml + '</div>' +
    addStockSection +
    '<button class="btn-secondary" style="width:100%;margin-bottom:10px" onclick="window.openBatchWastageModal(\'' + batchId + '\')">' +
      'Mark Pack Wastage' +
    '</button>' +
    '<button class="btn-secondary" style="width:100%;margin-bottom:10px" onclick="window.toggleSoldOut(\'' + batchId + '\')">' +
      soLabel +
    '</button>' +
    deleteSection;

  openModal('modal-batch-detail');
}

// ── ADD STOCK TO EDITABLE BATCH ───────────────────────────────
export async function addStockToBatch() {
  const batchId = window._detailBatchId;
  const b       = STATE.batches.find(x => x.id === batchId);
  if (!b) return;

  const addQty      = Number(document.getElementById('bd-add-qty')?.value || 0);
  const addDelivery = Number(document.getElementById('bd-add-delivery')?.value || 0);

  if (!addQty) { toast('Enter quantity to add', true); return; }

  const ok = await showConfirm(
    'Add ' + addQty + ' packs to ' + b.batchNo + '?',
    getCatName(b.categoryId) + ' · ' + addQty + ' packs'
  );
  if (!ok) return;

  const newQtyBought    = Number(b.qtyBought    || 0) + addQty;
  const newQtyRemaining = Number(b.qtyRemaining || 0) + addQty;
  const newDelivery     = Number(b.deliveryCharge || 0) + addDelivery;
  const newDeliveryPerPack = newQtyBought > 0 ? newDelivery / newQtyBought : 0;
  const newTotalCostPerPack = Number(b.buyingCostPerPack || 0) + newDeliveryPerPack;

  await DB.update('batches/' + batchId, {
    qtyBought:        newQtyBought,
    qtyRemaining:     newQtyRemaining,
    deliveryCharge:   newDelivery,
    deliveryShare:    newDeliveryPerPack,
    totalCostPerPack: newTotalCostPerPack,
    modifiedAt:       nowISO(),
    modifiedBy:       STATE.user.name,
  });

  toast(addQty + ' packs added!');
  closeModal('modal-batch-detail');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
}

// ── TOGGLE SOLD OUT ───────────────────────────────────────────
export async function toggleSoldOut(batchId) {
  const b  = STATE.batches.find(x => x.id === batchId);
  if (!b) return;
  const so = isBatchSoldOut(b);

  if (!so) {
    // Mark sold out
    await DB.update('batches/' + batchId, { qtyRemaining: 0 });
    toast('Batch marked Sold Out');
  } else {
    // Restore remaining
    const rem = Math.max(0,
      Number(b.qtyBought || 0) - Number(b.qtySold || 0) - Number(b.qtyWasted || 0)
    );
    await DB.update('batches/' + batchId, { qtyRemaining: rem });
    toast('Batch marked Active');
  }

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

  const ok = await showConfirm('Delete batch ' + b.batchNo + '?', 'Reason: "' + note + '"\nThis cannot be undone.');
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
  // Reset form
  document.getElementById('b-no').value         = '';
  document.getElementById('b-date').value        = today();
  document.getElementById('b-delivery').value    = '';
  document.getElementById('b-notes').value       = '';
  document.getElementById('b-qty').value         = '';
  document.getElementById('b-cost').value        = '';
  document.getElementById('b-preview').textContent = '';

  // Populate pack type dropdown
  const sel = document.getElementById('b-cat');
  sel.innerHTML = '<option value="">— Select pack type —</option>' +
    STATE.settings.packCategories.map(c =>
      '<option value="' + c.id + '">' + c.model + ' ' + c.size + ' (' + c.bottlesPerPack + ' bottles/pack)</option>'
    ).join('');

  openModal('modal-batch');
}

export function _updateBatchPreview() {
  const qty      = Number(document.getElementById('b-qty')?.value      || 0);
  const cost     = Number(document.getElementById('b-cost')?.value     || 0);
  const delivery = Number(document.getElementById('b-delivery')?.value || 0);
  const prev     = document.getElementById('b-preview');
  if (!prev) return;

  if (qty > 0 && cost > 0) {
    const dpb   = delivery / qty;
    const total = cost + dpb;
    prev.textContent = 'Buy ' + fmt(cost) + ' + delivery ' + fmt(dpb) + ' = ' + fmt(total) + '/pack · Total batch cost: ' + fmt(qty * total);
  } else {
    prev.textContent = '';
  }
}

// ── SUBMIT BATCH ──────────────────────────────────────────────
export async function submitBatch() {
  const batchNo    = document.getElementById('b-no').value.trim();
  const date       = document.getElementById('b-date').value;
  const catId      = document.getElementById('b-cat').value;
  const qty        = Number(document.getElementById('b-qty').value     || 0);
  const cost       = Number(document.getElementById('b-cost').value    || 0);
  const delivery   = Number(document.getElementById('b-delivery').value || 0);
  const notes      = document.getElementById('b-notes').value.trim();
  const isEditable = document.getElementById('b-editable').checked;

  if (!batchNo) { toast('Enter batch number',       true); return; }
  if (!date)    { toast('Select purchase date',     true); return; }
  if (!catId)   { toast('Select a pack type',       true); return; }
  if (!qty)     { toast('Enter quantity',           true); return; }
  if (!cost)    { toast('Enter buying cost per pack', true); return; }

  const deliveryPerPack = qty > 0 ? delivery / qty : 0;
  const totalCostPerPack = cost + deliveryPerPack;

  const btn = document.querySelector('#modal-batch .btn-primary');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    await DB.push('batches', {
      batchNo, purchaseDate: date,
      categoryId:       catId,
      qtyBought:        qty,
      qtySold:          0,
      qtyWasted:        0,
      qtyRemaining:     qty,
      buyingCostPerPack: cost,
      deliveryCharge:   delivery,
      deliveryShare:    deliveryPerPack,
      totalCostPerPack,
      notes,
      isEditable,
      deleted:    false,
      createdAt:  nowISO(), createdBy:  STATE.user.name,
      modifiedAt: nowISO(), modifiedBy: STATE.user.name,
    });

    toast('Batch saved!');
    closeModal('modal-batch');
    window.dispatchEvent(new CustomEvent('zp:data-changed'));
  } catch (err) {
    toast('Failed: ' + err.message, true);
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
  sel.innerHTML = '<option value="' + b.categoryId + '">' + getCatName(b.categoryId) + ' (' + (b.qtyRemaining || 0) + ' remaining)</option>';

  document.getElementById('w-qty').value  = '';
  document.getElementById('w-note').value = '';

  closeModal('modal-batch-detail');
  openModal('modal-wastage');
}

export async function submitBatchWastage() {
  const batchId = window._wasteBatchId;
  const qty     = Number(document.getElementById('w-qty').value  || 0);
  const note    = (document.getElementById('w-note').value || '').trim();

  if (!qty)  { toast('Enter quantity',     true); return; }
  if (!note) { toast('Enter a reason',     true); return; }

  const b         = STATE.batches.find(x => x.id === batchId);
  const remaining = Number(b?.qtyRemaining || 0);

  if (qty > remaining) { toast('Only ' + remaining + ' packs remaining', true); return; }

  const ok = await showConfirm(
    'Mark ' + qty + ' packs as wastage?',
    'Batch: ' + b.batchNo + '\nReason: "' + note + '"'
  );
  if (!ok) return;

  await DB.update('batches/' + batchId, {
    qtyRemaining: remaining - qty,
    qtyWasted:    Number(b.qtyWasted || 0) + qty,
  });

  await DB.push('wastage', {
    type:       'pack',
    batchId,    batchNo: b.batchNo,
    categoryId: b.categoryId,
    qty, note,
    cost:      (b.totalCostPerPack || 0) * qty,
    createdAt:  nowISO(), createdBy: STATE.user.name,
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
window.addStockToBatch       = addStockToBatch;
