// profit.js
import { fmt, getWeekDates } from './firebase.js';
import { STATE } from './state.js';

let _profitChart = null;
const COLORS = ['#6c63ff','#00c896','#ff4d6d','#ffaa00','#4da6ff','#ff7043','#26c6da','#ab47bc'];

// ── RENDER PROFIT PAGE ────────────────────────────────────────
export function renderProfit() {
  _wireChips();

  const period  = document.querySelector('#pr-period-chips .chip-f.on')?.dataset.p  || 'month';
  const groupBy = document.querySelector('#pr-group-chips .chip-f.on')?.dataset.g   || 'client';
  const now     = new Date();

  // Filter sales by period
  let sales = [...STATE.sales];
  if (period === 'week') {
    const dates = getWeekDates();
    sales = sales.filter(s => dates.includes(s.saleDate));
  } else if (period === 'month') {
    const pfx = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    sales = sales.filter(s => (s.saleDate || '').startsWith(pfx));
  } else if (period === 'year') {
    sales = sales.filter(s => (s.saleDate || '').startsWith(String(now.getFullYear())));
  }

  // Filter expenses by same period
  let expenses = [...STATE.expenses];
  if (period === 'week') {
    const dates = getWeekDates();
    expenses = expenses.filter(e => dates.includes(e.date));
  } else if (period === 'month') {
    const pfx = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    expenses = expenses.filter(e => (e.date || '').startsWith(pfx));
  } else if (period === 'year') {
    expenses = expenses.filter(e => (e.date || '').startsWith(String(now.getFullYear())));
  }

  const totalRev  = sales.reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
  const totalGP   = sales.reduce((s, r) => s + Number(r.grossProfit  || 0), 0);
  const totalExp  = expenses.reduce((s, e) => s + Number(e.amount    || 0), 0);
  const netProfit = totalGP - totalExp;
  const margin    = totalRev > 0 ? ((totalGP / totalRev) * 100).toFixed(1) : 0;

  document.getElementById('pr-rev').textContent     = fmt(totalRev);
  document.getElementById('pr-gp').textContent      = fmt(totalGP);
  document.getElementById('pr-np').textContent      = fmt(netProfit);
  document.getElementById('pr-margin').textContent  = margin + '%';

  // Group data
  const groups = {};

  if (groupBy === 'client') {
    sales.forEach(s => {
      const key = s.clientId;
      if (!groups[key]) {
        groups[key] = { label: s.clientName || s.clientId, revenue: 0, grossProfit: 0, orders: 0 };
      }
      groups[key].revenue     += Number(s.totalRevenue || 0);
      groups[key].grossProfit += Number(s.grossProfit  || 0);
      groups[key].orders++;
    });
  } else {
    // By pack category
    sales.forEach(s => {
      Object.values(s.items || {}).forEach(it => {
        const key = it.categoryId;
        if (!groups[key]) {
          groups[key] = { label: it.categoryName || it.categoryId, revenue: 0, grossProfit: 0, orders: 0 };
        }
        groups[key].revenue     += Number(it.lineRevenue || 0);
        groups[key].grossProfit += Number(it.lineProfit  || 0);
        groups[key].orders      += Number(it.qty         || 0);
      });
    });
  }

  const list = Object.values(groups).sort((a, b) => b.revenue - a.revenue);

  // Chart
  if (_profitChart) { _profitChart.destroy(); _profitChart = null; }
  const ctx = document.getElementById('chart-profit')?.getContext('2d');
  if (ctx && list.length) {
    _profitChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels:   list.slice(0, 6).map(g => g.label),
        datasets: [
          {
            label: 'Revenue',
            data:  list.slice(0, 6).map(g => g.revenue),
            backgroundColor: 'rgba(108,99,255,.75)',
            borderRadius: 6,
          },
          {
            label: 'Gross Profit',
            data:  list.slice(0, 6).map(g => g.grossProfit),
            backgroundColor: 'rgba(0,200,150,.75)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#8888aa', font: { size: 11 }, boxWidth: 10 } },
        },
        scales: {
          x: { ticks: { color: '#8888aa', font: { size: 10 } }, grid: { display: false } },
          y: {
            ticks: {
              color: '#8888aa', font: { size: 10 },
              callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v,
            },
            grid: { color: 'rgba(255,255,255,.04)' },
          },
        },
      },
    });
  }

  // Breakdown list
  const el = document.getElementById('profit-list');
  if (!list.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">&#128202;</div>' +
        '<div class="empty-text">No sales in this period</div>' +
      '</div>';
    return;
  }

  el.innerHTML = '<div class="card">';
  list.forEach(g => {
    const mg = g.revenue > 0 ? ((g.grossProfit / g.revenue) * 100).toFixed(1) : 0;
    el.innerHTML +=
      '<div class="li">' +
        '<div class="li-info">' +
          '<div class="li-name">' + g.label + '</div>' +
          '<div class="li-sub">' + g.orders + ' ' + (groupBy === 'client' ? 'orders' : 'packs') + ' &middot; ' + mg + '% margin</div>' +
        '</div>' +
        '<div class="li-right">' +
          '<div style="font-size:11px;color:var(--text2)">Rev: ' + fmt(g.revenue) + '</div>' +
          '<div class="li-amt" style="color:var(--green)">' + fmt(g.grossProfit) + '</div>' +
        '</div>' +
      '</div>';
  });
  el.innerHTML += '</div>';
}

function _wireChips() {
  document.querySelectorAll('#pr-period-chips .chip-f').forEach(ch => {
    ch.onclick = () => {
      document.querySelectorAll('#pr-period-chips .chip-f').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      renderProfit();
    };
  });
  document.querySelectorAll('#pr-group-chips .chip-f').forEach(ch => {
    ch.onclick = () => {
      document.querySelectorAll('#pr-group-chips .chip-f').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      renderProfit();
    };
  });
}

window.renderProfit = renderProfit;
