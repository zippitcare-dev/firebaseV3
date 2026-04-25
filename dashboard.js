// dashboard.js
import { fmt, ym, getWeekDates, colorFor, initials } from './firebase.js';
import { STATE } from './state.js';

let _dashChart = null;

// ── RENDER DASHBOARD ──────────────────────────────────────────
export function renderDashboard() {
  _wireTrendChips();

  const mVal = document.getElementById('dash-month')?.value;
  const yVal = document.getElementById('dash-year')?.value;
  const now  = new Date();

  // Filter sales and expenses by selected period
  let filtSales = [...STATE.sales];
  let filtExp   = [...STATE.expenses];

  if (yVal && yVal !== 'all') {
    filtSales = filtSales.filter(s => (s.saleDate || '').startsWith(yVal));
    filtExp   = filtExp.filter(e => (e.date || '').startsWith(yVal));

    if (mVal && mVal !== 'all') {
      const pfx = ym(yVal, mVal);
      filtSales = filtSales.filter(s => (s.saleDate || '').startsWith(pfx));
      filtExp   = filtExp.filter(e => (e.date || '').startsWith(pfx));
    }
  }

  const revenue      = filtSales.reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
  const grossProfit  = filtSales.reduce((s, r) => s + Number(r.grossProfit  || 0), 0);
  const expenses     = filtExp.reduce((s, e)   => s + Number(e.amount       || 0), 0);
  const netProfit    = grossProfit - expenses;
  const pending      = STATE.sales
    .filter(s => s.paymentStatus !== 'paid')
    .reduce((s, r) => s + Number(r.amountPending || 0), 0);

  document.getElementById('d-rev').textContent   = fmt(revenue);
  document.getElementById('d-gp').textContent    = fmt(grossProfit);
  document.getElementById('d-np').textContent    = fmt(netProfit);
  document.getElementById('d-pend').textContent  = fmt(pending);
  document.getElementById('d-exp').textContent   = fmt(expenses);
  document.getElementById('d-sales').textContent = filtSales.length;
  // Store for click handler
  window._dashFilteredSales = filtSales;
  const salesEl = document.getElementById('d-sales');
  if (salesEl) salesEl.style.cursor = 'pointer';

  _renderTrendChart(filtSales, mVal, yVal, now);
  _renderLabelAlerts();
  _renderTopClients(filtSales);
}

// ── TREND CHART ───────────────────────────────────────────────
function _renderTrendChart(filtSales, mVal, yVal, now) {
  const trendView = document.querySelector('#trend-chips .chip-f.on')?.dataset.t || 'week';
  let labels = [], revVals = [], profVals = [];

  if (trendView === 'day') {
    const todayStr = now.toISOString().split('T')[0];
    const todaySales = filtSales.filter(s => s.saleDate === todayStr);
    for (let h = 0; h < 24; h++) {
      labels.push(h + ':00');
      const hs = todaySales.filter(s => new Date(s.createdAt || '').getHours() === h);
      revVals.push(hs.reduce((s, r) => s + Number(r.totalRevenue || 0), 0));
      profVals.push(hs.reduce((s, r) => s + Number(r.grossProfit || 0), 0));
    }
  } else if (trendView === 'week') {
    const dates    = getWeekDates();
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    dates.forEach((d, i) => {
      labels.push(dayNames[i]);
      const ds = filtSales.filter(s => s.saleDate === d);
      revVals.push(ds.reduce((s, r) => s + Number(r.totalRevenue || 0), 0));
      profVals.push(ds.reduce((s, r) => s + Number(r.grossProfit || 0), 0));
    });
  } else if (trendView === 'month') {
    const y    = yVal && yVal !== 'all' ? Number(yVal) : now.getFullYear();
    const m    = mVal && mVal !== 'all' ? Number(mVal) : now.getMonth() + 1;
    const days = new Date(y, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const ds = y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      labels.push(d);
      const s = filtSales.filter(x => x.saleDate === ds);
      revVals.push(s.reduce((a, r) => a + Number(r.totalRevenue || 0), 0));
      profVals.push(s.reduce((a, r) => a + Number(r.grossProfit  || 0), 0));
    }
  } else if (trendView === 'year') {
    const y      = yVal && yVal !== 'all' ? Number(yVal) : now.getFullYear();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    months.forEach((mn, i) => {
      const pfx = y + '-' + String(i + 1).padStart(2, '0');
      labels.push(mn);
      const s = filtSales.filter(x => (x.saleDate || '').startsWith(pfx));
      revVals.push(s.reduce((a, r) => a + Number(r.totalRevenue || 0), 0));
      profVals.push(s.reduce((a, r) => a + Number(r.grossProfit  || 0), 0));
    });
  }

  if (_dashChart) { _dashChart.destroy(); _dashChart = null; }
  const ctx = document.getElementById('chart-dash')?.getContext('2d');
  if (!ctx) return;

  _dashChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Revenue', data: revVals,  backgroundColor: 'rgba(108,99,255,.7)', borderRadius: 4 },
        { label: 'Profit',  data: profVals, backgroundColor: 'rgba(0,200,150,.7)',  borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8888aa', font: { size: 10 }, boxWidth: 10 } },
      },
      scales: {
        x: { ticks: { color: '#8888aa', font: { size: 9 } }, grid: { display: false } },
        y: {
          ticks: {
            color: '#8888aa', font: { size: 9 },
            callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v,
          },
          grid: { color: 'rgba(255,255,255,.04)' },
        },
      },
    },
  });
}

function _wireTrendChips() {
  document.querySelectorAll('#trend-chips .chip-f').forEach(ch => {
    ch.onclick = () => {
      document.querySelectorAll('#trend-chips .chip-f').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      renderDashboard();
    };
  });
}

// ── LOW LABEL ALERTS ──────────────────────────────────────────
function _renderLabelAlerts() {
  const threshold = STATE.settings.lowLabelAlertPacks || 5;
  const low = [];

  STATE.clients.forEach(c => {
    Object.keys(c.categories || {}).forEach(catId => {
      const l = c.labels?.[catId] || {};
      const remaining = Math.max(0,
        Number(l.totalLabels || 0) - Number(l.labelsUsed || 0) - Number(l.labelsWasted || 0)
      );
      const cat   = STATE.settings.packCategories.find(x => x.id === catId);
      const ready = cat?.bottlesPerPack ? Math.floor(remaining / cat.bottlesPerPack) : 0;
      if (ready <= threshold) {
        low.push({ clientName: c.name, catId, ready });
      }
    });
  });

  const el = document.getElementById('dash-label-alerts');
  if (!low.length) { el.innerHTML = ''; return; }

  el.innerHTML =
    '<div style="background:var(--red-d);border:1px solid rgba(255,77,109,.2);border-radius:12px;padding:12px 14px;margin-bottom:12px">' +
      '<div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:6px">&#9888; Low Labels (&le;' + threshold + ' packs ready)</div>' +
      low.map(l =>
        '<div style="font-size:12px;color:var(--text2);padding:2px 0">' +
          l.clientName + ' &mdash; ' +
          (STATE.settings.packCategories.find(c => c.id === l.catId)?.model || l.catId) + ' ' +
          (STATE.settings.packCategories.find(c => c.id === l.catId)?.size  || '') + ': ' +
          '<strong style="color:var(--red)">' + l.ready + ' packs</strong>' +
        '</div>'
      ).join('') +
    '</div>';
}

// ── TOP CLIENTS ───────────────────────────────────────────────
function _renderTopClients(filtSales) {
  const cRevs = {};
  filtSales.forEach(s => {
    cRevs[s.clientId] = (cRevs[s.clientId] || 0) + Number(s.totalRevenue || 0);
  });

  const top = Object.entries(cRevs).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const el  = document.getElementById('dash-clients');

  if (!top.length) {
    el.innerHTML =
      '<div class="empty" style="padding:20px">' +
        '<div class="empty-text">No sales in this period</div>' +
      '</div>';
    return;
  }

  el.innerHTML = '';
  top.forEach(([cid, rev]) => {
    const cl   = STATE.clients.find(c => c.id === cid);
    const name = cl?.name || cid;
    el.innerHTML +=
      '<div class="li">' +
        '<div class="li-av" style="background:' + colorFor(cid) + '">' + initials(name) + '</div>' +
        '<div class="li-info"><div class="li-name">' + name + '</div></div>' +
        '<div class="li-right"><div class="li-amt">' + fmt(rev) + '</div></div>' +
      '</div>';
  });
}

// ── SALES SUMMARY MODAL (clicking sales count on dashboard) ───
export function openSalesSummaryModal(filtSales) {
  // Total packs
  let totalPacks = 0;
  const catTotals = {}; // catId -> {packs, revenue, profit}

  filtSales.forEach(s => {
    totalPacks += Number(s.totalPacks || 0);
    Object.entries(s.items || {}).forEach(([catId, it]) => {
      if (!catTotals[catId]) {
        catTotals[catId] = { name: it.categoryName || catId, packs: 0, revenue: 0, profit: 0 };
      }
      catTotals[catId].packs   += Number(it.qty          || 0);
      catTotals[catId].revenue += Number(it.lineRevenue   || 0);
      catTotals[catId].profit  += Number(it.lineProfit    || 0);
    });
  });

  const totalRevenue = filtSales.reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
  const totalProfit  = filtSales.reduce((s, r) => s + Number(r.grossProfit  || 0), 0);

  let catRows = Object.values(catTotals)
    .sort((a, b) => b.revenue - a.revenue)
    .map(c =>
      '<div class="info-row">' +
        '<span class="info-label">' + c.name + '</span>' +
        '<div style="text-align:right">' +
          '<div style="font-weight:700">' + c.packs.toLocaleString() + ' packs · ' + fmt(c.revenue) + '</div>' +
          '<div style="font-size:11px;color:var(--green)">Profit: ' + fmt(c.profit) + '</div>' +
        '</div>' +
      '</div>'
    ).join('');

  document.getElementById('sales-summary-body').innerHTML =
    '<div class="card-sm" style="margin-bottom:12px">' +
      '<div class="info-row"><span class="info-label">Total Sales</span><span class="info-val">' + filtSales.length + '</span></div>' +
      '<div class="info-row"><span class="info-label">Total Packs Sold</span><span class="info-val">' + totalPacks.toLocaleString() + '</span></div>' +
      '<div class="info-row"><span class="info-label">Total Revenue</span><span class="info-val">' + fmt(totalRevenue) + '</span></div>' +
      '<div class="info-row" style="border:none"><span class="info-label">Gross Profit</span><span class="info-val" style="color:var(--green)">' + fmt(totalProfit) + '</span></div>' +
    '</div>' +
    '<div class="sec-title" style="margin-bottom:10px">By Pack Category</div>' +
    '<div class="card-sm">' + (catRows || '<div style="color:var(--text3);font-size:13px">No data</div>') + '</div>';

  document.getElementById('modal-sales-summary').classList.add('show');
}
window.openSalesSummaryModal = openSalesSummaryModal;

window.renderDashboard = renderDashboard;
