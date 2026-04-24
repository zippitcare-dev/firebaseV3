// audit.js
import { DB, objToArr, nowISO } from './firebase.js';
import { STATE } from './state.js';
import { openModal } from './ui.js';

// ── LOG AN AUDIT EVENT ────────────────────────────────────────
export async function auditLog(action, section, detail) {
  try {
    await DB.push('audit', {
      action,   // CREATE | UPDATE | DELETE
      section,  // Inventory | Clients | Sales | Payments | Expenses | Settings | Users
      detail:   String(detail || '').slice(0, 120),
      user:     STATE.user?.name || 'system',
      timestamp: nowISO(),
    });
  } catch (_) {
    // Audit log failure must never break the app
  }
}

// ── OPEN AUDIT MODAL ──────────────────────────────────────────
export async function openAuditModal() {
  openModal('modal-audit');

  const el = document.getElementById('audit-list');
  el.innerHTML =
    '<div class="skel" style="height:50px;border-radius:8px;margin-bottom:8px"></div>' +
    '<div class="skel" style="height:50px;border-radius:8px;margin-bottom:8px"></div>' +
    '<div class="skel" style="height:50px;border-radius:8px"></div>';

  const data = await DB.get('audit');
  const rows = objToArr(data)
    .sort((a, b) => (b.timestamp || '') > (a.timestamp || '') ? 1 : -1)
    .slice(0, 80);

  if (!rows.length) {
    el.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">&#128203;</div>' +
        '<div class="empty-text">No audit records yet</div>' +
        '<div class="empty-sub">Actions will appear here after data is entered</div>' +
      '</div>';
    return;
  }

  const cls = { CREATE: 'a-create', UPDATE: 'a-update', DELETE: 'a-delete' };

  el.innerHTML = rows.map(r =>
    '<div style="padding:11px 0;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
        '<span class="' + (cls[r.action] || 'a-update') + '">' + (r.action || 'UPDATE') + '</span>' +
        '<span style="font-size:13px;font-weight:700;color:var(--text)">' + (r.section || '—') + '</span>' +
        '<span style="font-size:12px;color:var(--text2)">&middot; ' + (r.user || '—') + '</span>' +
      '</div>' +
      (r.detail
        ? '<div style="font-size:12px;color:var(--text2);margin-bottom:3px">' + r.detail + '</div>'
        : '') +
      '<div style="font-size:11px;color:var(--text3)">' +
        new Date(r.timestamp).toLocaleString('en-IN') +
      '</div>' +
    '</div>'
  ).join('');
}

// ── EXPOSE TO WINDOW ──────────────────────────────────────────
window.openAuditModal = openAuditModal;
