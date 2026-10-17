// Data store: Firebase Realtime Database under /users/{uid}, or localStorage when no config is set.

import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const LOCAL_KEY = 'kru-local-data';

let data = null;
let user = null;
let fb = null; // { auth, db, m: {...module fns} }
const listeners = new Set();

export const mode = firebaseConfig ? 'firebase' : 'local';
export const getData = () => data;
export const getUser = () => user;
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(data));

function cacheKey() {
  return user ? `kru-cache-${user.uid}` : null;
}

/** Resolves once the auth state is known. Calls emit() whenever data changes. */
export async function initStore() {
  if (mode === 'local') {
    try {
      data = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    } catch {
      data = null;
    }
    user = { uid: 'local', displayName: 'โหมดในเครื่อง' };
    return;
  }
  const [appM, authM, dbM] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-auth.js'),
    import(FB + 'firebase-database.js'),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  fb = { auth: authM.getAuth(app), db: dbM.getDatabase(app), authM, dbM };
  let unsub = null;
  await new Promise((resolve) => {
    authM.onAuthStateChanged(fb.auth, (u) => {
      user = u;
      if (unsub) unsub();
      unsub = null;
      data = null;
      if (u) {
        try {
          data = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
        } catch {
          data = null;
        }
        unsub = dbM.onValue(dbM.ref(fb.db, `users/${u.uid}`), (snap) => {
          data = snap.val();
          try {
            localStorage.setItem(cacheKey(), JSON.stringify(data));
          } catch {}
          emit();
        });
      }
      resolve();
      emit();
    });
  });
}

export async function signIn() {
  const { authM, auth } = fb;
  await authM.signInWithPopup(auth, new authM.GoogleAuthProvider());
}
export async function signOut() {
  if (mode === 'local') return;
  try {
    localStorage.removeItem(cacheKey());
  } catch {}
  await fb.authM.signOut(fb.auth);
}

function setLocalPath(path, value) {
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

function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (e) {
    alert('บันทึกไม่สำเร็จ: ' + e.message);
  }
  emit();
}

/** Multi-path write. updates = { 'events/abc': {...}, 'quickNote': 'x', 'lostPeriods/x': null } */
export async function patch(updates) {
  if (mode === 'local') {
    if (!data) data = {};
    for (const [p, v] of Object.entries(updates)) setLocalPath(p, v);
    saveLocal();
    return;
  }
  const { dbM, db } = fb;
  const prefixed = {};
  for (const [p, v] of Object.entries(updates)) prefixed[`users/${user.uid}/${p}`] = v ?? null;
  await dbM.update(dbM.ref(db), prefixed);
}
export const write = (path, value) => patch({ [path]: value });

export async function replaceAll(newData) {
  if (mode === 'local') {
    data = newData;
    saveLocal();
    return;
  }
  const { dbM, db } = fb;
  await dbM.set(dbM.ref(db, `users/${user.uid}`), newData);
}
