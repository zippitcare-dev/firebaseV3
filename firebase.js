// firebase.js
import { initializeApp }                                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, set, get, push, update, remove, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const firebaseConfig = {
  apiKey:            "AIzaSyACqoSLpl15ndUBdfcNTuy27BwEtShJxIo",
  authDomain:        "zippit-de50e.firebaseapp.com",
  databaseURL:       "https://zippit-de50e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "zippit-de50e",
  storageBucket:     "zippit-de50e.firebasestorage.app",
  messagingSenderId: "724261382532",
  appId:             "1:724261382532:web:4ebb0aa9c4c84eb4e755d1"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getDatabase(firebaseApp);

// ── DB helpers ────────────────────────────────────────────────
export const DB = {
  get:         (path)      => get(ref(db, path)).then(s => s.val()),
  set:         (path, val) => set(ref(db, path), val),
  push:        (path, val) => push(ref(db, path), val),
  update:      (path, val) => update(ref(db, path), val),
  remove:      (path)      => remove(ref(db, path)),
  listen:      (path, cb)  => onValue(ref(db, path), s => cb(s.val())),
  multiUpdate: (obj)       => update(ref(db, '/'), obj),
};

// ── Utilities ─────────────────────────────────────────────────
export function objToArr(data) {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).map(([id, v]) => ({ id, ...v }));
}

export const hashPin  = pin  => 'PIN_' + String(pin);
export const today    = ()   => new Date().toISOString().split('T')[0];
export const nowISO   = ()   => new Date().toISOString();
export const fmt      = n    => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const PALETTE = ['#6c63ff','#00c896','#ff4d6d','#ffaa00','#4da6ff','#ff7043','#26c6da','#ab47bc'];
function _hash(str) {
  let h = 0;
  for (const c of String(str || 'x')) h = ((h << 5) - h) + c.charCodeAt(0);
  return h;
}
export const colorFor  = str  => PALETTE[Math.abs(_hash(str)) % PALETTE.length];
export const initials  = name => String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
export const ym        = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

export function getWeekDates() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7)); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}
