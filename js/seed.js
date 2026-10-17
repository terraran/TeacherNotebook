// Parses สมุดครู_ข้อมูลตั้งต้น.xlsx into the app's data model.
// Takes the SheetJS module as a parameter so it can also run under Node for testing.

import { DAY_ABBR, uid } from './util.js';

const YELLOW = 'FFF2B3';

const roomKey = (name) => name.replace(/\./g, '-');
const studentKey = (name) => name.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-');
const str = (v) => (v == null ? '' : String(v).trim());

/** Rows below the header row as {header: {v, yellow, link}} */
function readTable(XLSX, ws) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  const cell = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
  let headerRow = -1;
  for (let r = range.s.r; r <= range.e.r && headerRow < 0; r++) {
    let n = 0;
    for (let c = range.s.c; c <= range.e.c; c++) if (str(cell(r, c)?.v)) n++;
    if (n >= 3) headerRow = r;
  }
  if (headerRow < 0) return [];
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) headers[c] = str(cell(headerRow, c)?.v);
  const rows = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const row = {};
    let any = false;
    headers.forEach((h, c) => {
      if (!h) return;
      const x = cell(r, c);
      const v = str(x?.v);
      if (v) any = true;
      row[h] = { v, yellow: x?.s?.fgColor?.rgb === YELLOW, link: x?.l?.Target || '' };
    });
    if (any) rows.push(row);
  }
  return rows;
}

function parseDays(text) {
  const t = text.replace(/\s/g, '');
  const range = t.match(/^(.+?)[–-](.+)$/);
  if (range) {
    const a = DAY_ABBR.indexOf(range[1]);
    const b = DAY_ABBR.indexOf(range[2]);
    const out = [];
    for (let d = a; ; d = (d + 1) % 7) {
      out.push(d);
      if (d === b) break;
    }
    return out;
  }
  return t.split(',').map((x) => DAY_ABBR.indexOf(x)).filter((d) => d >= 0);
}

function typeIdFor(name) {
  if (name === 'สอนที่โรงเรียน') return 'school';
  if (name === 'สอนพิเศษ') return 'tutor';
  if (name.startsWith('ชมรม')) return 'club';
  if (name === 'เวร') return 'duty';
  if (name.startsWith('ส่วนตัว')) return 'personal';
  return 't' + uid();
}

export function parseSeed(XLSX, buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellStyles: true });
  const sheet = (name) => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`ไม่พบแท็บ "${name}" ในไฟล์`);
    return readTable(XLSX, ws);
  };

  // ตั้งค่า
  const terms = {};
  const types = {};
  const specialDays = {};
  const typeByName = {};
  for (const r of sheet('ตั้งค่า')) {
    const cat = r['หมวด'].v;
    const name = r['ชื่อ'].v;
    if (cat === 'ภาคเรียน') {
      terms['t' + name.replace(/\./g, '-')] = { name, start: r['เริ่ม'].v, end: r['สิ้นสุด'].v, note: r['หมายเหตุ']?.v || '' };
    } else if (cat === 'ประเภท') {
      const id = typeIdFor(name);
      typeByName[name] = id;
      types[id] = {
        name,
        color: r['สี (hex)'].v,
        termBound: ['school', 'club', 'duty'].includes(id),
        note: r['หมายเหตุ']?.v || '',
      };
    } else if (cat === 'วันพิเศษ') {
      specialDays[uid()] = { name, start: r['เริ่ม'].v, end: r['สิ้นสุด'].v || r['เริ่ม'].v, note: r['หมายเหตุ']?.v || '' };
    }
  }

  // นักเรียนพิเศษ
  const studentFields = {
    'ชื่อ': 'name', 'สถานะ': 'status', 'วิชา': 'subject', 'ระดับชั้น': 'grade', 'วัน': 'days', 'ช่วง': 'slot',
    'หลักสูตร/หนังสือ': 'curriculum', 'หัวข้อปัจจุบัน': 'topic', 'สิ่งที่ต้องรู้ตอนเตรียมสอน': 'notes',
    'ภาษาของสื่อ': 'language', 'หมายเหตุ': 'remark',
  };
  const students = {};
  for (const r of sheet('นักเรียนพิเศษ')) {
    const s = { unconfirmed: {} };
    for (const [h, f] of Object.entries(studentFields)) {
      s[f] = r[h]?.v || '';
      if (r[h]?.yellow) s.unconfirmed[f] = true;
    }
    s.status = s.status === 'พักไว้' ? 'paused' : 'active';
    students[studentKey(s.name)] = s;
  }
  const studentByName = Object.fromEntries(Object.entries(students).map(([id, s]) => [s.name, id]));

  // ห้อง ICT
  const rooms = {};
  for (const r of sheet('ห้อง ICT')) {
    const name = r['ห้อง'].v;
    rooms[roomKey(name)] = {
      name,
      year: name.slice(0, 2),
      thaiGrade: r['ชั้น (ไทย)'].v,
      minutes: Number(r['นาที/คาบ'].v) || 40,
      plannedPeriods: Number(r['คาบเทอม 2.1'].v) || 0,
      unit: r['หน่วยเทอม 2.1'].v,
      groups: /2 กลุ่ม/.test(r['การจัดกลุ่ม'].v) ? 2 : 1,
      grouping: r['การจัดกลุ่ม'].v,
      note: r['หมายเหตุ'].v,
      unconfirmed: r['หน่วยเทอม 2.1'].yellow ? { unit: true } : {},
    };
  }

  // ตารางประจำ
  const recurring = {};
  for (const r of sheet('ตารางประจำ')) {
    const title = r['กิจกรรม'].v;
    const ref = r['ห้อง/นักเรียน'].v;
    const base = {
      start: r['เริ่ม'].v,
      end: r['จบ'].v,
      title,
      type: typeByName[r['ประเภท'].v] || 'personal',
      note: r['หมายเหตุ'].v,
    };
    if (/เวลาทำงาน/.test(title)) base.background = true;
    if (ref && rooms[roomKey(ref)]) {
      base.roomId = roomKey(ref);
      const g = title.match(/กลุ่ม\s*(\d)/);
      if (g) base.group = Number(g[1]);
    } else if (ref && studentByName[ref]) {
      base.studentId = studentByName[ref];
    }
    for (const dow of parseDays(r['วัน'].v)) recurring[uid()] = { ...base, dow };
  }

  // คาบที่เสีย
  const lostPeriods = {};
  for (const r of sheet('คาบที่เสีย')) {
    lostPeriods[uid()] = {
      date: r['วันที่'].v,
      rooms: (r['ห้อง'].v.match(/Y\d\.\d/g) || []).map(roomKey),
      roomsText: r['ห้อง'].v,
      reason: r['เหตุผล'].v,
      confirmed: r['สถานะ'].v === 'ยืนยัน',
      statusText: r['สถานะ'].v,
    };
  }

  // แผน ICT 2.1
  const ictPlan = {};
  for (const r of sheet('แผน ICT 2.1')) {
    const keys = Object.keys(r);
    const y3 = keys.find((k) => k.startsWith('Y3'));
    const y4 = keys.find((k) => k.startsWith('Y4'));
    const week = Number(r['สัปดาห์'].v);
    ictPlan['t2-1_w' + week] = {
      term: 't2-1',
      week,
      Y3: r[y3]?.v || '',
      Y4: r[y4]?.v || '',
      status: r['สถานะ'].v,
      unconfirmed: r['สถานะ'].yellow,
    };
  }

  // ประวัติย้อนหลัง
  const history = {};
  for (const r of sheet('ประวัติย้อนหลัง')) {
    const who = r['ห้อง/นักเรียน'].v;
    history[uid()] = {
      date: r['วันที่ (แชท)'].v,
      kind: r['ประเภท'].v,
      who,
      studentId: studentByName[who] || '',
      topic: r['หัวข้อ'].v,
      materials: r['สื่อที่ทำ'].v,
      taughtOn: r['สอนวันที่'].v,
      result: r['ผลที่ได้'].v,
      note: r['หมายเหตุ'].v,
      link: r['แหล่งที่มา'].link,
      source: 'seed',
    };
  }

  return {
    meta: { version: 1, importedAt: new Date().toISOString() },
    settings: { terms, types, specialDays },
    recurring,
    rooms,
    lostPeriods,
    ictPlan,
    students,
    history,
    events: {},
    quickNote: '',
  };
}
