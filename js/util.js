// Shared helpers: dates, times, slots, formatting.

export const SLOTS = [
  { key: 'morning', name: 'เช้า', start: '07:00', end: '12:00' },
  { key: 'afternoon', name: 'บ่าย', start: '12:00', end: '16:00' },
  { key: 'evening', name: 'ค่ำ', start: '16:00', end: '19:00' },
  { key: 'night', name: 'ดึก', start: '19:00', end: '24:00' },
];

// Thai day abbreviations → JS getDay() index
export const DAY_ABBR = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const DAY_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Slot an item belongs to = the slot its start time falls in (null for 00:00–07:00). */
export function slotOf(hhmm) {
  const m = typeof hhmm === 'number' ? hhmm : toMin(hhmm);
  return SLOTS.find((s) => m >= toMin(s.start) && m < toMin(s.end)) || null;
}

export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return r;
}
/** Monday of the week containing d */
export function weekStart(d) {
  const dow = (d.getDay() + 6) % 7;
  return addDays(d, -dow);
}
export const daysBetween = (a, b) => Math.round((parseDate(dateKey(b)) - parseDate(dateKey(a))) / 86400000);

export function thaiDateLong(d) {
  return `วัน${DAY_FULL[d.getDay()]}ที่ ${d.getDate()} ${MONTH_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}
export function thaiDateShort(d) {
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

export function durationText(min) {
  min = Math.max(0, Math.round(min));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return `${d} วัน${h ? ` ${h} ชม.` : ''}`;
  if (h) return `${h} ชม.${m ? ` ${m} นาที` : ''}`;
  return `${m} นาที`;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Tiny tagged-template helper: values are escaped unless wrapped with raw(). */
export function raw(s) {
  return { __raw: String(s) };
}
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (Array.isArray(v)) out += v.map((x) => (x && x.__raw !== undefined ? x.__raw : esc(x))).join('');
      else if (v && v.__raw !== undefined) out += v.__raw;
      else if (v !== false && v != null) out += esc(v);
    }
  });
  return raw(out);
}
