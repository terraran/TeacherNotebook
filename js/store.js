// Data store: Google Sheet via Apps Script (signed in with Google), or localStorage when no URL is set.
// The whole data tree is kept in memory; writes apply locally first, then go to the Sheet in order.

import { config } from './config.js';

const LOCAL_KEY = 'kru-local-data';
const CACHE_KEY = 'kru-sheet-cache';
const TOKEN_KEY = 'kru-token';
const isDevMock = /^http:\/\/(localhost|127\.0\.0\.1)/.test(config.sheetsUrl);

export const mode = config.sheetsUrl ? 'sheets' : 'local';

let data = null;
let user = null;
let loadedAt = 0;
let sheetUrl = '';
const queue = [];
let flushing = false;
const listeners = new Set();
const statusListeners = new Set();

export const getData = () => data;
export const getUser = () => user;
export const getSheetUrl = () => sheetUrl;
export const hasLoaded = () => mode === 'local' || loadedAt > 0;
export const onChange = (fn) => listeners.add(fn);
export const onStatus = (fn) => statusListeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(data));
const status = (s) => statusListeners.forEach((fn) => fn(s, queue.length));

const lsGet = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

// ---------- Google sign-in (ID token, ~1 hour) ----------

let gisReady = null;
let pendingSignIn = null;

function loadGis() {
  gisReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: (r) => onCredential(r.credential),
        auto_select: true,
        cancel_on_tap_outside: false,
      });
      resolve();
    };
    s.onerror = () => reject(new Error('โหลด Google Sign-In ไม่สำเร็จ'));
    document.head.appendChild(s);
  });
  return gisReady;
}

function decodeJwt(t) {
  const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(p))));
}

function tokenValid(tok) {
  return tok && tok.exp * 1000 > Date.now() + 60_000;
}

async function onCredential(credential) {
  const p = decodeJwt(credential);
  const tok = { token: credential, exp: p.exp, email: p.email, name: p.name };
  lsSet(TOKEN_KEY, tok);
  const first = !user;
  user = { uid: p.sub, email: p.email, displayName: p.name };
  pendingSignIn?.();
  pendingSignIn = null;
  if (first) {
    data = lsGet(CACHE_KEY);
    emit();
    await load().catch(showError);
  }
  flush();
}

/** Renders the Google button into el (login screen). */
export async function renderSignInButton(el) {
  await loadGis();
  google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'th', shape: 'pill' });
  google.accounts.id.prompt();
}

/** Gets a fresh token silently if possible; resolves when one is available. */
function ensureToken() {
  if (isDevMock) return Promise.resolve('dev');
  const tok = lsGet(TOKEN_KEY);
  if (tokenValid(tok)) return Promise.resolve(tok.token);
  return new Promise((resolve) => {
    pendingSignIn = () => resolve(lsGet(TOKEN_KEY).token);
    loadGis().then(() => google.accounts.id.prompt());
    status('signin');
  });
}

export async function signOut() {
  lsSet(TOKEN_KEY, null);
  lsSet(CACHE_KEY, null);
  try {
    google.accounts.id.disableAutoSelect();
  } catch {}
  user = null;
  data = null;
  emit();
}

// ---------- Apps Script calls ----------

async function call(action, payload) {
  const idToken = await ensureToken();
  const body = new URLSearchParams({ action, idToken, payload: JSON.stringify(payload || {}) });
  const r = await fetch(config.sheetsUrl, { method: 'POST', body, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const res = await r.json();
  if (res.error === 'TOKEN_EXPIRED') {
    lsSet(TOKEN_KEY, null);
    return call(action, payload);
  }
  if (res.error) throw new Error(res.error);
  return res;
}

const ERRORS = {
  Unauthorized: 'บัญชีนี้ไม่มีสิทธิ์ — ต้องเป็นอีเมลที่ตั้งไว้ใน Apps Script (OWNER_EMAIL)',
  CONFIG_CLIENT_ID: 'GOOGLE_CLIENT_ID ใน Apps Script ไม่ตรงกับ js/config.js',
};
function showError(e) {
  const m = String(e?.message || e);
  status('error');
  alert(ERRORS[m] || (/Failed to fetch|NetworkError|HTTP/.test(m) ? 'เชื่อมต่อ Google Sheet ไม่ได้ (' + m + ')' : 'เกิดข้อผิดพลาด: ' + m));
}

async function load() {
  status('loading');
  const res = await call('load');
  loadedAt = Date.now();
  sheetUrl = res.sheetUrl || '';
  // a pending full import wins over what the Sheet has now
  if (queue.some((q) => q.action === 'replaceAll')) return status('saving');
  // keep local edits that haven't reached the Sheet yet
  data = res.data && Object.keys(res.data).length ? res.data : null;
  for (const q of queue) if (q.updates) applyLocal(q.updates);
  lsSet(CACHE_KEY, data);
  status(queue.length ? 'saving' : 'idle');
  emit();
}

async function flush() {
  if (flushing || !user) return;
  flushing = true;
  try {
    while (queue.length) {
      status('saving');
      const q = queue[0];
      await call(q.action, q.payload);
      queue.shift();
    }
    status('saved');
  } catch (e) {
    showError(e);
    queue.length = 0;
    await load().catch(() => {});
  } finally {
    flushing = false;
  }
}

// ---------- shared ----------

function setPath(path, value) {
  const parts = path.split('/');
  let o = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) delete o[last];
  else o[last] = JSON.parse(JSON.stringify(value));
}
function applyLocal(updates) {
  if (!data) data = {};
  for (const [p, v] of Object.entries(updates)) setPath(p, v);
}

/** Resolves once we know whether the user is signed in. */
export async function initStore() {
  if (mode === 'local') {
    data = lsGet(LOCAL_KEY);
    user = { uid: 'local', displayName: 'โหมดในเครื่อง' };
    return;
  }
  const tok = lsGet(TOKEN_KEY);
  if (isDevMock || tokenValid(tok)) {
    user = isDevMock ? { uid: 'dev', email: 'dev@localhost' } : { uid: tok.email, email: tok.email, displayName: tok.name };
    data = lsGet(CACHE_KEY);
    load().catch(showError);
  } else if (tok) {
    // expired: try silent sign-in, otherwise the login screen shows the button
    loadGis().then(() => google.accounts.id.prompt()).catch(() => {});
  }
  // refresh when coming back to the app (other device may have edited)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && user && !queue.length && Date.now() - loadedAt > 30_000) load().catch(() => {});
  });
}

/** Multi-path write. updates = { 'events/abc': {...}, 'quickNote': 'x', 'lostPeriods/x': null } */
export async function patch(updates) {
  applyLocal(updates);
  if (mode === 'local') {
    lsSet(LOCAL_KEY, data);
    emit();
    return;
  }
  lsSet(CACHE_KEY, data);
  emit();
  queue.push({ action: 'patch', payload: { updates }, updates });
  flush();
}
export const write = (path, value) => patch({ [path]: value });

export async function replaceAll(newData) {
  data = JSON.parse(JSON.stringify(newData));
  if (mode === 'local') {
    lsSet(LOCAL_KEY, data);
    emit();
    return;
  }
  lsSet(CACHE_KEY, data);
  emit();
  queue.push({ action: 'replaceAll', payload: { data: newData } });
  await flush();
}

/** Re-read from the Sheet now. */
export const reload = () => (mode === 'sheets' ? load().catch(showError) : Promise.resolve());
