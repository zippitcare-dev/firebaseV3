// app.js — Main orchestrator
import { DB, objToArr, colorFor, initials } from './firebase.js';
import { STATE } from './state.js';
import { toast, showConfirm, openModal, closeModal, initBackdropClose } from './ui.js';
import { loadUsers, buildNumpad, checkPin, goStep1, openUsersModal, addUser } from './users.js';
import { openSettingsModal, sAddPack, sRemovePack, sAddSheet, sRemoveSheet,
         sAddExpCat, sRemoveExpCat, saveLowLabelThreshold } from './settings.js';
import { renderInventory, openBatchModal, submitBatch, openBatchDetail,
         toggleSoldOut, deleteBatch, openBatchWastageModal,
         submitBatchWastage, _updateBatchPreview } from './batches.js';
import { renderClients, openClientModal, submitClient, openClientDetail,
         submitPriceUpdate, deleteClient } from './clients.js';
import { renderLabels, openLabelDetail, openAddSheetModal, submitAddSheets,
         openLabelWastageModal, submitLabelWastage } from './labels.js';
import { renderSales, openSaleModal, submitSale, openSaleDetail,
         openUpdatePayment, deleteSale, updateSaleDot,
         _loadSaleRows, _calcSaleTotal, _togglePaidField } from './sales.js';

// ── EXPOSE GLOBALS FOR HTML onclick ───────────────────────────
window.checkPin      = checkPin;
window.goStep1       = goStep1;
window.addUser       = addUser;
window.openUsersModal = openUsersModal;
window.showPage      = showPage;
window.openAddModal  = openAddModal;
window.logout        = logout;
window.toggleTheme   = toggleTheme;
window.openLogoModal = openLogoModal;
window.saveLogo      = saveLogo;
window.removeLogo    = removeLogo;
window.previewLogo   = previewLogo;

// Confirm dialog buttons
window._confirmOk     = () => window._confirmResolve?.(true);
window._confirmCancel = () => window._confirmResolve?.(false);

// Settings
window.openSettingsModal     = openSettingsModal;

// Clients
window.openClientModal   = openClientModal;
window.submitClient      = submitClient;
window.openClientDetail  = openClientDetail;
window.submitPriceUpdate = submitPriceUpdate;
window.deleteClient      = deleteClient;

// Sales
window.openSaleModal      = openSaleModal;
window.submitSale         = submitSale;
window.openSaleDetail     = openSaleDetail;
window.openUpdatePayment  = openUpdatePayment;
window.deleteSale         = deleteSale;
window._loadSaleRows      = _loadSaleRows;
window._calcSaleTotal     = _calcSaleTotal;
window._togglePaidField   = _togglePaidField;

// Labels
window.openLabelDetail       = openLabelDetail;
window.openAddSheetModal     = openAddSheetModal;
window.submitAddSheets       = submitAddSheets;
window.openLabelWastageModal = openLabelWastageModal;
window.submitLabelWastage    = submitLabelWastage;

// Batches
window.openBatchModal        = openBatchModal;
window.submitBatch           = submitBatch;
window.openBatchDetail       = openBatchDetail;
window.toggleSoldOut         = toggleSoldOut;
window.deleteBatch           = deleteBatch;
window.openBatchWastageModal = openBatchWastageModal;
window.submitBatchWastage    = submitBatchWastage;
window._updateBatchPreview   = _updateBatchPreview;
window.sAddPack              = sAddPack;
window.sAddSheet             = sAddSheet;
window.sAddExpCat            = sAddExpCat;
window.saveLowLabelThreshold = saveLowLabelThreshold;

// ── THEME ─────────────────────────────────────────────────────
let _isLight = false;
function toggleTheme() {
  _isLight = !_isLight;
  document.body.classList.toggle('light', _isLight);
  document.getElementById('theme-btn').textContent = _isLight ? '🌙' : '☀️';
  localStorage.setItem('zp-theme', _isLight ? 'light' : 'dark');
}

function _applyTheme() {
  if (localStorage.getItem('zp-theme') === 'light') {
    _isLight = true;
    document.body.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '🌙';
  }
}

// ── LOGO ──────────────────────────────────────────────────────
let _pendingLogoDataUrl = null;

function openLogoModal() {
  const saved = localStorage.getItem('zp-logo');
  document.getElementById('logo-prev-text').style.display = saved ? 'none'  : 'block';
  document.getElementById('logo-prev-img').style.display  = saved ? 'block' : 'none';
  if (saved) document.getElementById('logo-prev-img').src = saved;
  openModal('modal-logo');
}

function previewLogo(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _pendingLogoDataUrl = e.target.result;
    document.getElementById('logo-prev-text').style.display = 'none';
    document.getElementById('logo-prev-img').style.display  = 'block';
    document.getElementById('logo-prev-img').src = _pendingLogoDataUrl;
  };
  reader.readAsDataURL(file);
}

function saveLogo() {
  if (!_pendingLogoDataUrl) { toast('Choose an image first', true); return; }
  localStorage.setItem('zp-logo', _pendingLogoDataUrl);
  _applyLogo(_pendingLogoDataUrl);
  closeModal('modal-logo');
  toast('Logo saved!');
}

function removeLogo() {
  localStorage.removeItem('zp-logo');
  _pendingLogoDataUrl = null;
  _applyLogo(null);
  closeModal('modal-logo');
  toast('Logo removed');
}

function _applyLogo(url) {
  // Topbar
  const tbText = document.getElementById('tb-logo-text');
  const tbImg  = document.getElementById('tb-logo-img');
  if (tbText) tbText.style.display = url ? 'none'  : 'block';
  if (tbImg)  { tbImg.style.display = url ? 'block' : 'none'; if (url) tbImg.src = url; }

  // Login screen
  const lgText = document.getElementById('login-logo-text');
  const lgImg  = document.getElementById('login-logo-img');
  if (lgText) lgText.style.display = url ? 'none'  : 'block';
  if (lgImg)  { lgImg.style.display = url ? 'block' : 'none'; if (url) lgImg.src = url; }
}

// ── NAVIGATION ────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  inventory: 'Stock',
  clients:   'Clients',
  sales:     'Sales',
  labels:    'Labels',
  more:      'More',
  payments:  'Payments',
  expenses:  'Expenses',
  profit:    'Profit Report',
};

// Pages where the FAB (+) button is shown
const FAB_PAGES = new Set(['inventory','clients','sales','expenses']);

let _currentPage = 'dashboard';

function showPage(name) {
  _currentPage = name;

  // Switch page visibility
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.getElementById('pg-' + name)?.classList.add('on');

  // Update bottom nav highlight
  document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('on'));
  document.querySelector('.bnav-item[data-p="' + name + '"]')?.classList.add('on');

  // Update topbar title
  const titleEl = document.getElementById('tb-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[name] || name;

  // Show/hide FAB
  const fab = document.getElementById('fab');
  if (fab) fab.classList.toggle('hide', !FAB_PAGES.has(name));

  // Render page — these functions will be added in later steps
  // For now only dashboard exists
  if (name === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (name === 'inventory') renderInventory();
  if (name === 'clients')   renderClients();
  if (name === 'labels')    renderLabels();
  if (name === 'sales')     renderSales();
}

function openAddModal() {
  // Context-aware — will be filled in per step
  const handlers = {
    inventory: () => window.openBatchModal?.(),
    clients:   () => openClientModal(),
    sales:     () => openSaleModal(),
    expenses:  () => window.openExpModal?.(),
  };
  handlers[_currentPage]?.();
}

// ── ROLE-BASED VISIBILITY ─────────────────────────────────────
function _setupRoles() {
  const role = STATE.user?.role;

  // Staff cannot see: payments, expenses, profit, owner tools
  const staffHidden = ['menu-pay','menu-exp','menu-profit','owner-tools'];
  // Partner cannot see: owner tools
  const partnerHidden = ['owner-tools'];

  if (role === 'staff') {
    staffHidden.forEach(id => document.getElementById(id)?.classList.add('hide'));
  } else if (role === 'partner') {
    partnerHidden.forEach(id => document.getElementById(id)?.classList.add('hide'));
  }
}

// ── LOAD ALL DATA ─────────────────────────────────────────────
export async function loadAll() {
  const [batches, clients, sales, expenses, payments] = await Promise.all([
    DB.get('batches'),
    DB.get('clients'),
    DB.get('sales'),
    DB.get('expenses'),
    DB.get('payments'),
  ]);

  STATE.batches  = objToArr(batches).filter(b => !b.deleted);
  STATE.clients  = objToArr(clients).filter(c => c.active !== false);
  STATE.sales    = objToArr(sales);
  STATE.expenses = objToArr(expenses);
  STATE.payments = objToArr(payments);
}

// ── LOGOUT ────────────────────────────────────────────────────
function logout() {
  STATE.user = null;

  // Reset login UI
  document.getElementById('app').classList.remove('show');
  document.getElementById('login').style.display = '';
  document.getElementById('login').classList.remove('out');
  document.getElementById('step-user').style.display = 'block';
  document.getElementById('step-pin').style.display  = 'none';
  document.getElementById('ls2').classList.remove('on');
  document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('sel'));

  // Re-enable all role-hidden elements for next login
  document.querySelectorAll('.role-hidden').forEach(el => el.classList.remove('hide'));
}

// ── BOOT ──────────────────────────────────────────────────────
async function boot() {
  _applyTheme();

  const savedLogo = localStorage.getItem('zp-logo');
  if (savedLogo) _applyLogo(savedLogo);

  initBackdropClose();

  // Run splash timer (2s) AND data load in parallel
  const [_] = await Promise.all([
    new Promise(r => setTimeout(r, 2000)),
    loadSettings(),
    loadUsers(),
  ]);

  // Hide splash
  const splash = document.getElementById('splash');
  splash.classList.add('out');
  setTimeout(() => { splash.style.display = 'none'; }, 450);

  buildNumpad();
  _initMonthPicker();
}

// ── LOGIN SUCCESS ─────────────────────────────────────────────
window.addEventListener('zp:login', async e => {
  const user = e.detail;

  // Animate login out
  document.getElementById('login').classList.add('out');
  setTimeout(() => { document.getElementById('login').style.display = 'none'; }, 400);

  // Show app
  document.getElementById('app').classList.add('show');

  // Update topbar chip
  document.getElementById('chip-av').textContent   = user.initials || initials(user.name);
  document.getElementById('chip-av').style.background = user.color || '#6c63ff';
  document.getElementById('chip-name').textContent    = user.name;
  document.getElementById('logout-sub').textContent   = user.name + ' · ' + user.role;

  _setupRoles();

  // Load all data then render dashboard
  await loadAll();

  updateSaleDot();

  // Render dashboard if the function exists (added in step 8)
  if (typeof renderDashboard === 'function') renderDashboard();
});

// ── DATA-CHANGED EVENT ────────────────────────────────────────
// Other modules dispatch this after saving — we reload everything
window.addEventListener('zp:data-changed', async () => {
  await loadAll();
  // Re-render current page
  const renders = {
    dashboard: 'renderDashboard',
    inventory: 'renderInventory',
    clients:   'renderClients',
    sales:     'renderSales',
    labels:    'renderLabels',
    payments:  'renderPayments',
    expenses:  'renderExpenses',
    profit:    'renderProfit',
  };
  // reload batches specifically before rendering inventory
  const fn = window[renders[_currentPage]];
  if (typeof fn === 'function') fn();
});

// ── SETTINGS LOADER (needed at boot before login) ─────────────
async function loadSettings() {
  const data = await DB.get('settings');
  if (data) {
    STATE.settings.packCategories     = data.packCategories     || _defaultPackCats();
    STATE.settings.labelSheets        = data.labelSheets        || _defaultSheets();
    STATE.settings.expenseCategories  = data.expenseCategories  || _defaultExpCats();
    STATE.settings.lowLabelAlertPacks = data.lowLabelAlertPacks ?? 5;
  } else {
    STATE.settings.packCategories    = _defaultPackCats();
    STATE.settings.labelSheets       = _defaultSheets();
    STATE.settings.expenseCategories = _defaultExpCats();
    STATE.settings.lowLabelAlertPacks = 5;
    await DB.set('settings', STATE.settings);
  }
}

function _defaultPackCats() {
  return [
    { id: 'sq1l',  model: 'Square',  size: '1L',    bottlesPerPack: 12 },
    { id: 'sq500', model: 'Square',  size: '500ml', bottlesPerPack: 24 },
    { id: 'sq250', model: 'Square',  size: '250ml', bottlesPerPack: 35 },
    { id: 'pr1l',  model: 'Premium', size: '1L',    bottlesPerPack: 12 },
    { id: 'pr500', model: 'Premium', size: '500ml', bottlesPerPack: 24 },
    { id: 'pr250', model: 'Premium', size: '250ml', bottlesPerPack: 35 },
  ];
}
function _defaultSheets() {
  return [
    { id: 'ls_sq1l',  catId: 'sq1l',  labelsPerSheet: 24, pricePerSheet: 25 },
    { id: 'ls_sq500', catId: 'sq500', labelsPerSheet: 44, pricePerSheet: 25 },
    { id: 'ls_sq250', catId: 'sq250', labelsPerSheet: 60, pricePerSheet: 25 },
    { id: 'ls_pr1l',  catId: 'pr1l',  labelsPerSheet: 15, pricePerSheet: 25 },
    { id: 'ls_pr500', catId: 'pr500', labelsPerSheet: 30, pricePerSheet: 25 },
    { id: 'ls_pr250', catId: 'pr250', labelsPerSheet: 48, pricePerSheet: 25 },
  ];
}
function _defaultExpCats() {
  return ['Vehicle','Salary','Utilities','Packaging','Maintenance','Other'];
}

// ── MONTH/YEAR PICKER (dashboard) ─────────────────────────────
function _initMonthPicker() {
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const now = new Date();

  const mSel = document.getElementById('dash-month');
  const ySel = document.getElementById('dash-year');
  if (!mSel || !ySel) return;

  mSel.innerHTML = '<option value="all">All Months</option>';
  months.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = m;
    if (i + 1 === now.getMonth() + 1) opt.selected = true;
    mSel.appendChild(opt);
  });

  ySel.innerHTML = '<option value="all">All Years</option>';
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === now.getFullYear()) opt.selected = true;
    ySel.appendChild(opt);
  }
}

// ── START ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
