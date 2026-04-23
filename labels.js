// labels.js
import { DB, objToArr, fmt, nowISO, colorFor, initials } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';
import { getCatName, getSheet } from './settings.js';

// ── HELPERS ───────────────────────────────────────────────────
export function getLabelsRemaining(client, catId) {
  const l = client.labels?.[catId] || {};
  return Math.max(0,
    Number(l.totalLabels  || 0) -
    Number(l.labelsUsed   || 0) -
    Number(l.labelsWasted || 0)
  );
}

export function getPacksReady(client, catId) {
  const cat = STATE.settings.packCategories.find(c => c.id === catId);
  if (!cat || !cat.bottlesPerPack) return 0;
  return Math.floor(getLabelsRemaining(client, catId) / cat.bottlesPerPack);
}

export function getMinPacksReady(client) {
  const cats = Object.keys(client.categories || {});
  if (!cats.length) return 0;
  return Math.min(...cats.map(catId => getPacksReady(client, catId)));
}

// ── RENDER LABELS PAGE ────────────────────────────────────────
export function renderLabels() {
  _wireChips();

  const sort      = document.querySelector('#lbl-chips .chip-f.on')?.dataset.s || 'alpha';
  const threshold = STATE.settings.lowLabelAlertPacks || 5;

  let list = STATE.clients.filter(c =>
    c.active !== false && Object.keys(c.categories || {}).length > 0
  );

  if (sort === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'low')   list.sort((a, b) => getMinPacksReady(a) - getMinPacksReady(b));
  if (sort === 'high')  list.sort((a, b) => getMinPacksReady(b) - getMinPacksReady(a));

  const el = document.getElementById('lbl-list');

  if (!list.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">&#127991;</div>' +
        '<div class="empty-text">No clients yet</div>' +
        '<div class="empty-sub">Add clients first to manage labels</div>' +
      '</div>';
    return;
  }

  // Compact list — client name + one line per category
  el.innerHTML = '<div class="card">';
  list.forEach(c => {
    const cats  = Object.keys(c.categories || {});
    const lines = cats.map(catId => {
      const ready = getPacksReady(c, catId);
      const isLow = ready <= threshold;
      return (
        '<span style="color:' + (isLow ? 'var(--red)' : 'var(--text2)') + '">' +
          getCatName(catId) + ': ' +
          '<strong style="color:' + (isLow ? 'var(--red)' : 'var(--text)') + '">' +
            ready + ' packs' +
          '</strong>' +
          (isLow ? ' &#9888;' : '') +
        '</span>'
      );
    }).join(' &nbsp;&middot;&nbsp; ');

    el.innerHTML +=
      '<div class="li" onclick="window.openLabelDetail(\'' + c.id + '\')" style="cursor:pointer">' +
        '<div class="li-av" style="background:' + colorFor(c.id) + '">' + initials(c.name) + '</div>' +
        '<div class="li-info">' +
          '<div class="li-name">' + c.name + '</div>' +
          '<div class="li-sub" style="white-space:normal;line-height:1.6">' + lines + '</div>' +
        '</div>' +
        '<div style="color:var(--text3);font-size:18px">&rsaquo;</div>' +
      '</div>';
  });
  el.innerHTML += '</div>';
}

function _wireChips() {
  document.querySelectorAll('#lbl-chips .chip-f').forEach(ch => {
    ch.onclick = () => {
      document.querySelectorAll('#lbl-chips .chip-f').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      renderLabels();
    };
  });
}

// ── LABEL DETAIL MODAL ────────────────────────────────────────
export function openLabelDetail(clientId) {
  window._lblClientId = clientId;
  const c         = STATE.clients.find(x => x.id === clientId);
  if (!c) return;

  const threshold = STATE.settings.lowLabelAlertPacks || 5;
  const cats      = Object.keys(c.categories || {});

  document.getElementById('lbl-detail-name').textContent = c.name;

  let html = '';
  cats.forEach(catId => {
    const l         = c.labels?.[catId] || {};
    const remaining = getLabelsRemaining(c, catId);
    const ready     = getPacksReady(c, catId);
    const total     = Number(l.totalLabels || 0);
    const pct       = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
    const sheet     = getSheet(catId);
    const isLow     = ready <= threshold;
    const barColor  = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--amber)' : 'var(--red)';

    html +=
      '<div style="background:var(--surface2);border-radius:12px;padding:14px;margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<span style="font-size:14px;font-weight:700">' + getCatName(catId) + '</span>' +
          '<span class="badge ' + (isLow ? 'b-red' : ready < 20 ? 'b-amber' : 'b-green') + '">' +
            ready + ' packs ready' + (isLow ? ' &#9888;' : '') +
          '</span>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;text-align:center;font-size:11px">' +
          '<div style="background:var(--surface);border-radius:7px;padding:7px">' +
            '<div style="color:var(--text2)">Total</div>' +
            '<div style="font-weight:800">' + total + '</div>' +
          '</div>' +
          '<div style="background:var(--surface);border-radius:7px;padding:7px">' +
            '<div style="color:var(--text2)">Left</div>' +
            '<div style="font-weight:800;color:var(--green)">' + remaining + '</div>' +
          '</div>' +
          '<div style="background:var(--surface);border-radius:7px;padding:7px">' +
            '<div style="color:var(--text2)">Used</div>' +
            '<div style="font-weight:800;color:var(--accent)">' + (l.labelsUsed || 0) + '</div>' +
          '</div>' +
          '<div style="background:var(--surface);border-radius:7px;padding:7px">' +
            '<div style="color:var(--text2)">Wasted</div>' +
            '<div style="font-weight:800;color:var(--red)">' + (l.labelsWasted || 0) + '</div>' +
          '</div>' +
        '</div>' +

        '<div style="height:5px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:8px">' +
          '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:99px"></div>' +
        '</div>' +

        '<div style="font-size:11px;color:var(--text2);margin-bottom:12px">' +
          (l.sheetsAdded || 0) + ' sheets added &middot; ' +
          (sheet ? sheet.labelsPerSheet + ' labels/sheet &middot; &#8377;' + sheet.pricePerSheet + '/sheet' : 'No sheet configured in Settings') +
        '</div>' +

        '<div style="display:flex;gap:8px">' +
          '<button class="btn-sm" style="flex:1" ' +
            'onclick="window.openAddSheetModal(\'' + clientId + '\',\'' + catId + '\')">' +
            '+ Add Sheets' +
          '</button>' +
          '<button class="btn-sm" style="flex:1;background:var(--red-d);color:var(--red);border:1px solid rgba(255,77,109,.2)" ' +
            'onclick="window.openLabelWastageModal(\'' + clientId + '\',\'' + catId + '\')">' +
            'Mark Wastage' +
          '</button>' +
        '</div>' +
      '</div>';
  });

  document.getElementById('lbl-detail-body').innerHTML = html ||
    '<div class="empty"><div class="empty-text">No pack categories for this client</div></div>';

  openModal('modal-label-detail');
}

// ── ADD SHEETS MODAL ──────────────────────────────────────────
export function openAddSheetModal(clientId, catId) {
  window._sheetCliId = clientId;
  window._sheetCatId = catId;

  const c     = STATE.clients.find(x => x.id === clientId);
  const sheet = getSheet(catId);

  document.getElementById('sheet-client-name').textContent = c?.name || '';
  document.getElementById('sheet-cat-name').textContent    = getCatName(catId);
  document.getElementById('sheet-info').textContent        = sheet
    ? sheet.labelsPerSheet + ' labels/sheet · ₹' + sheet.pricePerSheet + '/sheet'
    : 'No sheet configured — go to Settings first';
  document.getElementById('add-sheet-count').value = '';

  closeModal('modal-label-detail');
  openModal('modal-add-sheets');
}

export async function submitAddSheets() {
  const clientId = window._sheetCliId;
  const catId    = window._sheetCatId;
  const count    = Number(document.getElementById('add-sheet-count')?.value || 0);

  if (!count || count <= 0) { toast('Enter number of sheets', true); return; }

  const sheet = getSheet(catId);
  if (!sheet) { toast('Configure label sheet in Settings first', true); return; }

  const c         = STATE.clients.find(x => x.id === clientId);
  const existing  = c?.labels?.[catId] || { totalLabels: 0, sheetsAdded: 0, labelsUsed: 0, labelsWasted: 0 };
  const newLabels = count * sheet.labelsPerSheet;

  const ok = await showConfirm(
    'Add ' + count + ' sheets?',
    'Adds ' + newLabels + ' labels for ' + getCatName(catId) + ' — ' + (c?.name || '')
  );
  if (!ok) return;

  await DB.update('clients/' + clientId + '/labels/' + catId, {
    totalLabels:  Number(existing.totalLabels  || 0) + newLabels,
    sheetsAdded:  Number(existing.sheetsAdded  || 0) + count,
    labelsUsed:   Number(existing.labelsUsed   || 0),
    labelsWasted: Number(existing.labelsWasted || 0),
  });

  toast('Added ' + newLabels + ' labels!');
  closeModal('modal-add-sheets');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
  setTimeout(() => openLabelDetail(clientId), 600);
}

// ── LABEL WASTAGE MODAL ───────────────────────────────────────
export function openLabelWastageModal(clientId, catId) {
  window._lwCliId = clientId;
  window._lwCatId = catId;

  const c         = STATE.clients.find(x => x.id === clientId);
  const remaining = getLabelsRemaining(c, catId);

  document.getElementById('lw-client-name').textContent = c?.name || '';
  document.getElementById('lw-cat-name').textContent    = getCatName(catId);
  document.getElementById('lw-remaining').textContent   = remaining + ' labels remaining';
  document.getElementById('lw-qty').value  = '';
  document.getElementById('lw-note').value = '';

  closeModal('modal-label-detail');
  openModal('modal-label-wastage');
}

export async function submitLabelWastage() {
  const clientId = window._lwCliId;
  const catId    = window._lwCatId;
  const qty      = Number(document.getElementById('lw-qty')?.value  || 0);
  const note     = (document.getElementById('lw-note')?.value || '').trim();

  if (!qty)  { toast('Enter quantity',           true); return; }
  if (!note) { toast('Reason is required',       true); return; }

  const c         = STATE.clients.find(x => x.id === clientId);
  const remaining = getLabelsRemaining(c, catId);

  if (qty > remaining) { toast('Only ' + remaining + ' labels remaining', true); return; }

  const ok = await showConfirm(
    'Mark ' + qty + ' labels as wastage?',
    getCatName(catId) + ' — ' + (c?.name || '') + '\nReason: "' + note + '"'
  );
  if (!ok) return;

  const existing = c?.labels?.[catId] || {};
  await DB.update('clients/' + clientId + '/labels/' + catId, {
    labelsWasted: Number(existing.labelsWasted || 0) + qty,
  });

  await DB.push('wastage', {
    type:       'label',
    clientId,
    clientName: c?.name || '',
    categoryId: catId,
    qty, note,
    createdAt:  nowISO(),
    createdBy:  STATE.user.name,
  });

  toast('Label wastage recorded');
  closeModal('modal-label-wastage');
  window.dispatchEvent(new CustomEvent('zp:data-changed'));
  setTimeout(() => openLabelDetail(clientId), 600);
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.openLabelDetail       = openLabelDetail;
window.openAddSheetModal     = openAddSheetModal;
window.submitAddSheets       = submitAddSheets;
window.openLabelWastageModal = openLabelWastageModal;
window.submitLabelWastage    = submitLabelWastage;
