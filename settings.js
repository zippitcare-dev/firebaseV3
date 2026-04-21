// settings.js
import { DB, nowISO } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal } from './ui.js';

// ── OPEN SETTINGS MODAL ───────────────────────────────────────
export function openSettingsModal() {
  _renderPackList();
  _renderSheetList();
  _renderExpCatList();
  _populateSheetCatSelect();
  document.getElementById('low-label-threshold').value = STATE.settings.lowLabelAlertPacks ?? 5;
  openModal('modal-settings');
}

// ── RENDER LISTS ──────────────────────────────────────────────
function _renderPackList() {
  const el = document.getElementById('s-pack-list');
  if (!el) return;
  if (!STATE.settings.packCategories.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:6px 0">No pack categories yet</div>';
    return;
  }
  el.innerHTML = STATE.settings.packCategories.map((c, i) =>
    '<div class="settings-row">' +
      '<span>' + c.model + ' ' + c.size +
        ' <span style="color:var(--text3)">(' + c.bottlesPerPack + ' bottles/pack)</span>' +
      '</span>' +
      '<button onclick="window.sRemovePack(' + i + ')">&#10005;</button>' +
    '</div>'
  ).join('');
}

function _renderSheetList() {
  const el = document.getElementById('s-sheet-list');
  if (!el) return;
  if (!STATE.settings.labelSheets.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:6px 0">No label sheets configured yet</div>';
    return;
  }
  el.innerHTML = STATE.settings.labelSheets.map((s, i) => {
    const cat = STATE.settings.packCategories.find(c => c.id === s.catId);
    const catName = cat ? cat.model + ' ' + cat.size : s.catId;
    return '<div class="settings-row">' +
      '<span>' + catName + ': ' + s.labelsPerSheet + ' labels/sheet @ &#8377;' + s.pricePerSheet + '</span>' +
      '<button onclick="window.sRemoveSheet(' + i + ')">&#10005;</button>' +
    '</div>';
  }).join('');
}

function _renderExpCatList() {
  const el = document.getElementById('s-expcat-list');
  if (!el) return;
  if (!STATE.settings.expenseCategories.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:6px 0">No categories yet</div>';
    return;
  }
  el.innerHTML = STATE.settings.expenseCategories.map((c, i) =>
    '<div class="settings-row">' +
      '<span>' + c + '</span>' +
      '<button onclick="window.sRemoveExpCat(' + i + ')">&#10005;</button>' +
    '</div>'
  ).join('');
}

function _populateSheetCatSelect() {
  const sel = document.getElementById('new-sheet-cat');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select category —</option>' +
    STATE.settings.packCategories.map(c =>
      '<option value="' + c.id + '">' + c.model + ' ' + c.size + '</option>'
    ).join('');
}

// ── SAVE TO FIREBASE ──────────────────────────────────────────
async function _saveSettings(successMsg) {
  await DB.set('settings', {
    packCategories:     STATE.settings.packCategories,
    labelSheets:        STATE.settings.labelSheets,
    expenseCategories:  STATE.settings.expenseCategories,
    lowLabelAlertPacks: STATE.settings.lowLabelAlertPacks,
  });
  toast(successMsg || 'Saved!');
}

// ── PACK CATEGORIES ───────────────────────────────────────────
export async function sAddPack() {
  const model   = document.getElementById('new-pack-model').value.trim();
  const size    = document.getElementById('new-pack-size').value.trim();
  const bottles = Number(document.getElementById('new-pack-bottles').value || 0);

  if (!model)   { toast('Enter model name (e.g. Square)', true); return; }
  if (!size)    { toast('Enter size (e.g. 1L)',            true); return; }
  if (!bottles) { toast('Enter bottles per pack',          true); return; }

  // Prevent duplicate id
  const id = model.toLowerCase().replace(/\s+/g,'') + size.toLowerCase().replace(/[^a-z0-9]/g,'') + '_' + Date.now();

  STATE.settings.packCategories.push({ id, model, size, bottlesPerPack: bottles });

  document.getElementById('new-pack-model').value   = '';
  document.getElementById('new-pack-size').value    = '';
  document.getElementById('new-pack-bottles').value = '';

  await _saveSettings('Pack category added!');
  _renderPackList();
  _populateSheetCatSelect();

  // Notify other modules that settings changed
  window.dispatchEvent(new CustomEvent('zp:settings-changed'));
}

export async function sRemovePack(index) {
  const cat = STATE.settings.packCategories[index];
  if (!cat) return;
  const ok = await showConfirm('Remove ' + cat.model + ' ' + cat.size + '?', 'This will also remove its label sheet configuration.');
  if (!ok) return;

  // Remove associated label sheet too
  STATE.settings.labelSheets = STATE.settings.labelSheets.filter(s => s.catId !== cat.id);
  STATE.settings.packCategories.splice(index, 1);

  await _saveSettings('Pack category removed');
  _renderPackList();
  _renderSheetList();
  _populateSheetCatSelect();
  window.dispatchEvent(new CustomEvent('zp:settings-changed'));
}

// ── LABEL SHEETS ──────────────────────────────────────────────
export async function sAddSheet() {
  const catId  = document.getElementById('new-sheet-cat').value;
  const labels = Number(document.getElementById('new-sheet-labels').value || 0);
  const price  = Number(document.getElementById('new-sheet-price').value  || 25);

  if (!catId)  { toast('Select a pack category', true); return; }
  if (!labels) { toast('Enter labels per sheet',  true); return; }
  if (!price)  { toast('Enter price per sheet',   true); return; }

  // Remove existing sheet for this category (one sheet config per category)
  STATE.settings.labelSheets = STATE.settings.labelSheets.filter(s => s.catId !== catId);

  STATE.settings.labelSheets.push({
    id:            'ls_' + catId + '_' + Date.now(),
    catId,
    labelsPerSheet: labels,
    pricePerSheet:  price,
  });

  document.getElementById('new-sheet-labels').value = '';
  document.getElementById('new-sheet-price').value  = '25';

  await _saveSettings('Label sheet saved!');
  _renderSheetList();
  window.dispatchEvent(new CustomEvent('zp:settings-changed'));
}

export async function sRemoveSheet(index) {
  const sheet = STATE.settings.labelSheets[index];
  if (!sheet) return;
  const cat = STATE.settings.packCategories.find(c => c.id === sheet.catId);
  const ok  = await showConfirm('Remove label sheet for ' + (cat ? cat.model + ' ' + cat.size : sheet.catId) + '?', '');
  if (!ok) return;

  STATE.settings.labelSheets.splice(index, 1);
  await _saveSettings('Label sheet removed');
  _renderSheetList();
  window.dispatchEvent(new CustomEvent('zp:settings-changed'));
}

// ── EXPENSE CATEGORIES ────────────────────────────────────────
export async function sAddExpCat() {
  const val = document.getElementById('new-expcat').value.trim();
  if (!val) { toast('Enter category name', true); return; }

  if (STATE.settings.expenseCategories.includes(val)) {
    toast('Category already exists', true); return;
  }

  STATE.settings.expenseCategories.push(val);
  document.getElementById('new-expcat').value = '';

  await _saveSettings('Category added!');
  _renderExpCatList();
}

export async function sRemoveExpCat(index) {
  const cat = STATE.settings.expenseCategories[index];
  if (!cat) return;
  const ok = await showConfirm('Remove "' + cat + '" category?', '');
  if (!ok) return;

  STATE.settings.expenseCategories.splice(index, 1);
  await _saveSettings('Category removed');
  _renderExpCatList();
}

// ── LOW LABEL ALERT THRESHOLD ─────────────────────────────────
export async function saveLowLabelThreshold() {
  const val = Number(document.getElementById('low-label-threshold').value || 5);
  if (val < 1) { toast('Threshold must be at least 1', true); return; }

  STATE.settings.lowLabelAlertPacks = val;
  await _saveSettings('Alert threshold updated!');
}

// ── HELPERS USED BY OTHER MODULES ─────────────────────────────
export function getCatName(catId) {
  const cat = STATE.settings.packCategories.find(c => c.id === catId);
  return cat ? cat.model + ' ' + cat.size : catId;
}

export function getSheet(catId) {
  return STATE.settings.labelSheets.find(s => s.catId === catId) || null;
}

export function labelCostPerPack(catId) {
  const sheet = getSheet(catId);
  const cat   = STATE.settings.packCategories.find(c => c.id === catId);
  if (!sheet || !cat) return 0;
  return (sheet.pricePerSheet / sheet.labelsPerSheet) * cat.bottlesPerPack;
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.sRemovePack   = sRemovePack;
window.sRemoveSheet  = sRemoveSheet;
window.sRemoveExpCat = sRemoveExpCat;
