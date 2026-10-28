/**
 * สมุดครู — Apps Script backend.
 * Paste into the Google Sheet (Extensions → Apps Script), fill in the two constants,
 * then Deploy → New deployment → Web app (Execute as: Me · Who has access: Anyone).
 *
 * Every request must carry a Google ID token for OWNER_EMAIL issued to GOOGLE_CLIENT_ID.
 * Data model: each collection is one tab (row 1 = field keys, column A = id).
 */

const OWNER_EMAIL = 'PASTE-YOUR-EMAIL@gmail.com';
const GOOGLE_CLIENT_ID = 'PASTE-CLIENT-ID.apps.googleusercontent.com';

// path prefix in the app's data tree → tab name
const TABS = [
  ['settings/terms', 'ภาคเรียน'],
  ['settings/types', 'ประเภท'],
  ['settings/specialDays', 'วันพิเศษ'],
  ['recurring', 'ตารางประจำ'],
  ['events', 'รายการเพิ่มเอง'],
  ['rooms', 'ห้อง ICT'],
  ['lostPeriods', 'คาบที่เสีย'],
  ['ictPlan', 'แผน ICT'],
  ['students', 'นักเรียนพิเศษ'],
  ['history', 'ประวัติ'],
];
const MISC_TAB = 'ค่าอื่นๆ'; // single values: quickNote, meta, …
const SINGLE_KEYS = ['quickNote', 'meta'];

function doPost(e) {
  try {
    const p = e.parameter || {};
    verify_(p.idToken);
    const body = p.payload ? JSON.parse(p.payload) : {};
    let result;
    if (p.action === 'load') result = { data: loadAll_(), sheetUrl: ss_().getUrl() };
    else if (p.action === 'patch') result = withLock_(() => applyPatch_(body.updates || {}));
    else if (p.action === 'replaceAll') result = withLock_(() => replaceAll_(body.data || {}));
    else throw new Error('UNKNOWN_ACTION');
    return json_(Object.assign({ ok: true }, result));
  } catch (err) {
    return json_({ error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return json_({ ok: true, app: 'kru-notebook' });
}

// ---------- auth ----------

function verify_(idToken) {
  if (!idToken) throw new Error('NO_TOKEN');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  if (cache.get(key)) return;
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('TOKEN_EXPIRED');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID) throw new Error('CONFIG_CLIENT_ID');
  if (String(info.email).toLowerCase() !== OWNER_EMAIL.toLowerCase() || String(info.email_verified) !== 'true') throw new Error('Unauthorized');
  const ttl = Math.max(0, Math.min(3000, Number(info.exp) - Math.floor(Date.now() / 1000) - 60));
  if (ttl > 0) cache.put(key, '1', ttl);
}

// ---------- helpers ----------

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn() || {};
  } finally {
    lock.releaseLock();
  }
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1).setValue('id');
    sh.setFrozenRows(1);
    sh.getRange('1:1').setFontWeight('bold');
  }
  return sh;
}

/** Finds which tab a path belongs to: { prefix, tab, rest: [id, ...sub] } or { single: key, rest } */
function route_(path) {
  const parts = path.split('/');
  for (const [prefix, tab] of TABS) {
    const pp = prefix.split('/');
    if (pp.every((x, i) => parts[i] === x)) return { prefix, tab, rest: parts.slice(pp.length) };
  }
  if (SINGLE_KEYS.indexOf(parts[0]) >= 0) return { single: parts[0], rest: parts.slice(1) };
  // unknown top-level collection (e.g. sessionLogs in phase 2) gets its own tab
  return { prefix: parts[0], tab: parts[0], rest: parts.slice(1) };
}

// cell <-> value. Strings stay text (no auto-dates); numbers/booleans native; objects as JSON.
function toCell_(v) {
  if (v === null || v === undefined) return ['', '@'];
  if (typeof v === 'number') return [v, 'General'];
  if (typeof v === 'boolean') return [v, 'General'];
  if (typeof v === 'object') return [JSON.stringify(v), '@'];
  return [String(v), '@'];
}
function fromCell_(v) {
  if (v === '' || v === null) return undefined;
  if (typeof v === 'string' && (v[0] === '{' || v[0] === '[')) {
    try {
      return JSON.parse(v);
    } catch (e) {}
  }
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v;
}

function readTab_(sh) {
  const values = sh.getDataRange().getValues();
  const head = values[0] || [];
  const out = {};
  for (let r = 1; r < values.length; r++) {
    const id = String(values[r][0] || '');
    if (!id) continue;
    const obj = {};
    for (let c = 1; c < head.length; c++) {
      if (!head[c]) continue;
      const v = fromCell_(values[r][c]);
      if (v !== undefined) obj[head[c]] = v;
    }
    out[id] = obj;
  }
  return out;
}

function setIn_(root, parts, value) {
  let o = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  if (value === null || value === undefined) delete o[parts[parts.length - 1]];
  else o[parts[parts.length - 1]] = value;
}

// ---------- load ----------

function loadAll_() {
  const data = {};
  const ss = ss_();
  for (const [prefix, tab] of TABS) {
    const sh = ss.getSheetByName(tab);
    if (sh) setIn_(data, prefix.split('/'), readTab_(sh));
  }
  const known = TABS.map((t) => t[1]).concat([MISC_TAB]);
  ss.getSheets().forEach((sh) => {
    const name = sh.getName();
    if (known.indexOf(name) < 0 && /^[A-Za-z]\w*$/.test(name)) data[name] = readTab_(sh);
  });
  const misc = ss.getSheetByName(MISC_TAB);
  if (misc) {
    const rows = readTab_(misc);
    Object.keys(rows).forEach((k) => (data[k] = rows[k].value));
  }
  return data;
}

// ---------- write ----------

/** Writes or deletes one row. obj = null deletes. */
function writeRow_(sh, id, obj) {
  const last = sh.getLastRow();
  const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0])) : [];
  const idx = ids.indexOf(String(id));
  if (obj === null || obj === undefined) {
    if (idx >= 0) sh.deleteRow(idx + 2);
    return;
  }
  let head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  const keys = Object.keys(obj).filter((k) => obj[k] !== null && obj[k] !== undefined);
  const missing = keys.filter((k) => head.indexOf(k) < 0);
  if (missing.length) {
    sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
    head = head.concat(missing);
  }
  const vals = [];
  const fmts = [];
  head.forEach((h, c) => {
    const [v, f] = c === 0 ? [String(id), '@'] : toCell_(obj[h]);
    vals.push(v);
    fmts.push(f);
  });
  const row = idx >= 0 ? idx + 2 : last + 1;
  const range = sh.getRange(row, 1, 1, head.length);
  range.setNumberFormats([fmts]);
  range.setValues([vals]);
}

function readRow_(sh, id) {
  return readTab_(sh)[id] || null;
}

function applyPatch_(updates) {
  Object.keys(updates).forEach((path) => {
    const value = updates[path];
    const r = route_(path);
    if (r.single) {
      const sh = sheet_(MISC_TAB);
      if (r.rest.length) {
        const cur = (readRow_(sh, r.single) || {}).value || {};
        setIn_(cur, r.rest, value);
        writeRow_(sh, r.single, { value: cur });
      } else writeRow_(sh, r.single, value === null || value === undefined ? null : { value: value });
      return;
    }
    const sh = sheet_(r.tab);
    if (!r.rest.length) {
      // whole collection replaced
      replaceTab_(sh, value || {});
      return;
    }
    const id = r.rest[0];
    if (r.rest.length === 1) {
      writeRow_(sh, id, value);
    } else {
      const cur = readRow_(sh, id) || {};
      setIn_(cur, r.rest.slice(1), value);
      writeRow_(sh, id, cur);
    }
  });
  return {};
}

function replaceTab_(sh, coll) {
  const ids = Object.keys(coll);
  const head = ['id'];
  ids.forEach((id) => Object.keys(coll[id] || {}).forEach((k) => head.indexOf(k) < 0 && coll[id][k] != null && head.push(k)));
  sh.clearContents();
  sh.clearFormats();
  const vals = [head];
  const fmts = [head.map(() => '@')];
  ids.forEach((id) => {
    const rowV = [];
    const rowF = [];
    head.forEach((h, c) => {
      const [v, f] = c === 0 ? [String(id), '@'] : toCell_(coll[id][h]);
      rowV.push(v);
      rowF.push(f);
    });
    vals.push(rowV);
    fmts.push(rowF);
  });
  const range = sh.getRange(1, 1, vals.length, head.length);
  range.setNumberFormats(fmts);
  range.setValues(vals);
  sh.setFrozenRows(1);
  sh.getRange('1:1').setFontWeight('bold');
}

function replaceAll_(data) {
  for (const [prefix, tab] of TABS) {
    let o = data;
    prefix.split('/').forEach((k) => (o = o && o[k]));
    replaceTab_(sheet_(tab), o || {});
  }
  const misc = {};
  SINGLE_KEYS.forEach((k) => {
    if (data[k] !== undefined) misc[k] = { value: data[k] };
  });
  replaceTab_(sheet_(MISC_TAB), misc);
  // leftover default sheet
  const blank = ss_().getSheetByName('Sheet1') || ss_().getSheetByName('ชีต1');
  if (blank && blank.getLastRow() === 0 && ss_().getSheets().length > 1) ss_().deleteSheet(blank);
  return {};
}
