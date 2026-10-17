// Settings: edit the seed data (terms, lost periods, weekly schedule, …) and account.

import { html, DAY_ABBR, DAY_FULL, uid, toMin } from '../util.js';
import { col, types, terms } from '../model.js';
import { getData, patch, mode, getUser, signOut, replaceAll } from '../store.js';
import { formDialog, updatedFlags, pendingTag, typeLabel } from '../ui.js';
import { pickAndImport } from './setup.js';
import { getThemePrefs, setAutoNight } from '../theme.js';

const DOW_OPTS = [1, 2, 3, 4, 5, 6, 0].map((d) => [d, DAY_FULL[d]]);

export function recurringForm(id) {
  const data = getData();
  const r = id ? col(data, 'recurring')[id] : { dow: 1, start: '17:00', end: '18:00', type: 'personal' };
  const roomOpts = [['', '— ไม่ผูก —'], ...Object.entries(col(data, 'rooms')).map(([k, x]) => [k, x.name])];
  const studentOpts = [['', '— ไม่ผูก —'], ...Object.entries(col(data, 'students')).map(([k, s]) => [k, s.name])];
  formDialog({
    title: id ? 'แก้ไขรายการประจำ' : 'เพิ่มรายการประจำ',
    note: 'เกิดซ้ำทุกสัปดาห์ · ประเภทที่ผูกกับภาคเรียนจะแสดงเฉพาะช่วงเปิดเทอม',
    value: { ...r, group: r.group || '' },
    fields: [
      { key: 'title', label: 'กิจกรรม', required: true },
      { key: 'dow', label: 'วัน', type: 'select', options: DOW_OPTS, half: true },
      { key: 'type', label: 'ประเภท', type: 'select', options: Object.entries(types(data)).map(([k, t]) => [k, t.name]), half: true },
      { key: 'start', label: 'เริ่ม', type: 'time', half: true, required: true },
      { key: 'end', label: 'จบ', type: 'time', half: true, required: true },
      { key: 'roomId', label: 'ห้อง ICT', type: 'select', options: roomOpts, half: true },
      { key: 'group', label: 'กลุ่ม (Y3)', type: 'select', options: [['', '—'], [1, 'กลุ่ม 1'], [2, 'กลุ่ม 2']], half: true },
      { key: 'studentId', label: 'นักเรียน', type: 'select', options: studentOpts },
      { key: 'note', label: 'หมายเหตุ', type: 'textarea' },
      { key: 'background', label: 'แสดงเป็นแถบพื้นหลัง (เช่น เวลางาน) ไม่นับเป็นรายการ', type: 'check' },
    ],
    onSave: async (v) => {
      if (toMin(v.end) <= toMin(v.start)) throw new Error('เวลาจบต้องหลังเวลาเริ่ม');
      v.dow = Number(v.dow);
      v.group = v.group ? Number(v.group) : null;
      await patch({ [`recurring/${id || uid()}`]: v });
    },
    onDelete: id ? () => patch({ [`recurring/${id}`]: null }) : null,
  });
}

function lostForm(id) {
  const data = getData();
  const rooms = col(data, 'rooms');
  const l = id ? col(data, 'lostPeriods')[id] : { date: '', rooms: [], confirmed: true };
  formDialog({
    title: id ? 'แก้ไขคาบที่เสีย' : 'เพิ่มคาบที่เสีย',
    value: { ...l, roomsText: (l.rooms || []).map((k) => rooms[k]?.name || k).join(', ') },
    fields: [
      { key: 'date', label: 'วันที่', type: 'date', required: true },
      { key: 'roomsText', label: `ห้อง (คั่นด้วย , เช่น Y3.2, Y4.3) · มี ${Object.values(rooms).map((r) => r.name).join(' ')}` },
      { key: 'reason', label: 'เหตุผล' },
      { key: 'confirmed', label: 'ยืนยันแล้ว (ถ้ายังไม่ติ๊ก ปฏิทินจะขีดฆ่าคาบไว้แต่ยังแสดง)', type: 'check' },
    ],
    onSave: async (v) => {
      const byName = Object.fromEntries(Object.entries(rooms).map(([k, r]) => [r.name.toLowerCase(), k]));
      const names = (v.roomsText.match(/Y\d\.\d/gi) || []).map((x) => x.toLowerCase());
      const bad = names.filter((n) => !byName[n]);
      if (bad.length) throw new Error('ไม่รู้จักห้อง: ' + bad.join(', '));
      const roomIds = names.map((n) => byName[n]);
      await patch({
        [`lostPeriods/${id || uid()}`]: {
          date: v.date,
          rooms: roomIds,
          roomsText: v.roomsText,
          reason: v.reason,
          confirmed: v.confirmed,
          statusText: v.confirmed ? 'ยืนยัน' : 'รอยืนยัน',
        },
      });
    },
    onDelete: id ? () => patch({ [`lostPeriods/${id}`]: null }) : null,
  });
}

function termForm(id) {
  const t = id ? terms(getData())[id] : { name: '', start: '', end: '' };
  formDialog({
    title: id ? `ภาคเรียน ${t.name}` : 'เพิ่มภาคเรียน',
    value: t,
    fields: [
      { key: 'name', label: 'ชื่อ (เช่น 2.1)', required: true },
      { key: 'start', label: 'เริ่ม', type: 'date', half: true, required: true },
      { key: 'end', label: 'สิ้นสุด', type: 'date', half: true, required: true },
      { key: 'note', label: 'หมายเหตุ' },
    ],
    onSave: (v) => {
      if (v.end < v.start) throw new Error('วันสิ้นสุดต้องหลังวันเริ่ม');
      return patch({ [`settings/terms/${id || 't' + v.name.replace(/\W/g, '-')}`]: v });
    },
    onDelete: id ? () => patch({ [`settings/terms/${id}`]: null }) : null,
  });
}

function specialForm(id) {
  const s = id ? getData().settings.specialDays?.[id] : { name: '', start: '', end: '' };
  formDialog({
    title: id ? 'แก้ไขวันพิเศษ' : 'เพิ่มวันพิเศษ',
    value: s,
    fields: [
      { key: 'name', label: 'ชื่อ', required: true },
      { key: 'start', label: 'ตั้งแต่', type: 'date', half: true, required: true },
      { key: 'end', label: 'ถึง', type: 'date', half: true },
      { key: 'note', label: 'หมายเหตุ', type: 'textarea' },
    ],
    onSave: (v) => patch({ [`settings/specialDays/${id || uid()}`]: { ...v, end: v.end || v.start } }),
    onDelete: id ? () => patch({ [`settings/specialDays/${id}`]: null }) : null,
  });
}

function typeForm(id) {
  const t = types(getData())[id];
  formDialog({
    title: `ประเภท: ${t.name}`,
    value: t,
    fields: [
      { key: 'name', label: 'ชื่อ', required: true },
      { key: 'color', label: 'สี', type: 'color' },
      { key: 'termBound', label: 'แสดงเฉพาะช่วงเปิดเทอม', type: 'check' },
    ],
    onSave: (v) => patch({ [`settings/types/${id}`]: { ...t, ...v } }),
  });
}

function studentForm(id) {
  const s = col(getData(), 'students')[id];
  formDialog({
    title: s.name,
    note: 'แก้ข้อมูลเต็มได้ในหน้าสอนพิเศษ (เฟส 2) · นักเรียนที่พักไว้จะไม่แสดงในปฏิทินแต่ประวัติยังอยู่',
    value: { ...s, confirmAll: false },
    fields: [
      { key: 'status', label: 'สถานะ', type: 'select', options: [['active', 'เรียนอยู่'], ['paused', 'พักไว้']] },
      { key: 'topic', label: 'หัวข้อปัจจุบัน', type: 'textarea' },
      { key: 'notes', label: 'สิ่งที่ต้องรู้ตอนเตรียมสอน', type: 'textarea' },
      ...(s.unconfirmed && Object.keys(s.unconfirmed).length ? [{ key: 'confirmAll', label: 'ข้อมูลยืนยันแล้วทั้งหมด', type: 'check' }] : []),
    ],
    onSave: (v) => {
      const flags = updatedFlags(s, v, v.confirmAll);
      delete v.confirmAll;
      return patch({ [`students/${id}`]: { ...s, ...v, unconfirmed: flags } });
    },
  });
}

function roomForm(id) {
  const r = col(getData(), 'rooms')[id];
  formDialog({
    title: `ห้อง ${r.name}`,
    value: { ...r, confirmAll: false },
    fields: [
      { key: 'unit', label: 'หน่วยเทอม 2.1' },
      { key: 'note', label: 'หมายเหตุ' },
      ...(r.unconfirmed && Object.keys(r.unconfirmed).length ? [{ key: 'confirmAll', label: 'ยืนยันแล้ว', type: 'check' }] : []),
    ],
    onSave: (v) => {
      const flags = updatedFlags(r, v, v.confirmAll);
      delete v.confirmAll;
      return patch({ [`rooms/${id}`]: { ...r, ...v, unconfirmed: flags } });
    },
  });
}

function planForm(id) {
  const p = col(getData(), 'ictPlan')[id];
  formDialog({
    title: `แผน ICT สัปดาห์ ${p.week}`,
    value: { ...p, confirmed: !p.unconfirmed },
    fields: [
      { key: 'Y3', label: 'Y3 (ป.2)', type: 'textarea' },
      { key: 'Y4', label: 'Y4 (ป.3)', type: 'textarea' },
      { key: 'confirmed', label: 'ยืนยันแล้ว', type: 'check' },
    ],
    onSave: (v) =>
      patch({ [`ictPlan/${id}`]: { ...p, Y3: v.Y3, Y4: v.Y4, unconfirmed: !v.confirmed, status: v.confirmed ? 'ยืนยัน' : p.status } }),
  });
}

const row = (attrs, main, side = '') =>
  html`<button class="rowbtn" ${attrs}><span class="main">${main}</span>${side ? html`<span class="muted">${side}</span>` : ''}</button>`;

export function renderSettings(root) {
  const data = getData();
  const user = getUser();
  const rooms = col(data, 'rooms');
  const students = col(data, 'students');
  const recurring = Object.entries(col(data, 'recurring')).sort(
    ([, a], [, b]) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || toMin(a.start) - toMin(b.start),
  );
  const lost = Object.entries(col(data, 'lostPeriods')).sort(([, a], [, b]) => a.date.localeCompare(b.date));
  const tp = getThemePrefs();

  root.innerHTML = html`
  <div class="bar"><h1>ตั้งค่า</h1></div>

  <section class="sec"><h2>บัญชีและข้อมูล</h2>
    <div class="sub">${mode === 'local'
      ? 'โหมดในเครื่อง: ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น ยังไม่ซิงก์กับมือถือ (ใส่ค่า Firebase ใน js/firebase-config.js เพื่อเปิดใช้)'
      : html`เข้าสู่ระบบเป็น ${user?.email || user?.displayName} · ข้อมูลซิงก์ผ่าน Firebase`}</div>
    <div class="sub">นำเข้าครั้งแรกเมื่อ ${data.meta?.importedAt ? new Date(data.meta.importedAt).toLocaleString('th-TH') : '—'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" data-reimport>นำเข้าไฟล์ใหม่ (แทนที่ทั้งหมด)</button>
      ${mode === 'firebase' ? html`<button class="btn" data-signout>ออกจากระบบ</button>` : ''}
    </div>
  </section>

  <section class="sec"><h2>การแสดงผล</h2>
    <label class="check"><input type="checkbox" data-autonight ${tp.autoNight ? 'checked' : ''}> เปลี่ยนเป็นโหมดกลางคืนอัตโนมัติในช่วงดึก (19:00–24:00) · ตั้งแยกแต่ละเครื่อง</label>
  </section>

  <section class="sec"><h2>ภาคเรียน <button class="btn" data-add-term>+ เพิ่ม</button></h2>
    ${Object.entries(terms(data)).sort(([, a], [, b]) => a.start.localeCompare(b.start)).map(([id, t]) =>
      row(html`data-term="${id}"`, html`ภาคเรียน ${t.name}`, `${t.start} → ${t.end}`))}
  </section>

  <section class="sec"><h2>วันพิเศษ <button class="btn" data-add-special>+ เพิ่ม</button></h2>
    ${Object.entries(data.settings?.specialDays || {}).map(([id, s]) =>
      row(html`data-special="${id}"`, html`${s.name}<div class="muted">${s.note || ''}</div>`, s.start === s.end ? s.start : `${s.start} → ${s.end}`))}
  </section>

  <section class="sec"><h2>คาบที่เสีย <button class="btn" data-add-lost>+ เพิ่ม</button></h2>
    <div class="sub">วันที่ยืนยันแล้วจะไม่แสดงคาบในปฏิทิน · วันที่รอยืนยันจะขีดฆ่าไว้</div>
    ${lost.map(([id, l]) =>
      row(html`data-lost="${id}"`, html`${l.date} · ${l.roomsText || (l.rooms || []).map((k) => rooms[k]?.name).join(', ')}
        ${l.confirmed ? '' : html` <span class="tag warn">รอยืนยัน</span>`}<div class="muted">${l.reason}</div>`))}
  </section>

  <section class="sec"><h2>ตารางประจำ <button class="btn" data-add-rec>+ เพิ่ม</button></h2>
    ${recurring.map(([id, r]) =>
      row(html`data-rec="${id}"`, html`<span class="typelab"><i class="dot" style="background:${types(data)[r.type]?.color}"></i>${r.title}</span>
        ${r.background ? html` <span class="tag">แถบพื้นหลัง</span>` : ''}
        ${r.studentId && students[r.studentId]?.status === 'paused' ? html` <span class="tag">พักไว้</span>` : ''}`,
        `${DAY_ABBR[r.dow]} ${r.start}–${r.end}`))}
  </section>

  <section class="sec"><h2>นักเรียนพิเศษ</h2>
    ${Object.entries(students).map(([id, s]) =>
      row(html`data-student="${id}"`, html`${s.name} · <span class="muted">${s.subject}</span>${pendingTag(s)}`, s.status === 'paused' ? 'พักไว้' : 'เรียนอยู่'))}
  </section>

  <section class="sec"><h2>ห้อง ICT</h2>
    ${Object.entries(rooms).map(([id, r]) =>
      row(html`data-room="${id}"`, html`${r.name} (${r.thaiGrade}) · <span class="muted">${r.unit}</span>${pendingTag(r)}`, `${r.groups > 1 ? '2 กลุ่ม · ' : ''}${r.minutes} นาที`))}
  </section>

  <section class="sec"><h2>แผน ICT 2.1</h2>
    ${Object.entries(col(data, 'ictPlan')).sort(([, a], [, b]) => a.week - b.week).map(([id, p]) =>
      row(html`data-plan="${id}"`, html`สัปดาห์ ${p.week}${p.unconfirmed ? html` <span class="tag warn">รอยืนยัน</span>` : ''}
        <div class="muted">Y3: ${p.Y3 || '—'} · Y4: ${p.Y4 || '—'}</div>`))}
  </section>

  <section class="sec"><h2>ประเภทกิจกรรม</h2>
    ${Object.entries(types(data)).map(([id, t]) => row(html`data-type="${id}"`, typeLabel(data, id), t.termBound ? 'เฉพาะเปิดเทอม' : 'ทุกวัน'))}
  </section>`.__raw;

  root.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const ds = t.dataset;
    if ('reimport' in ds) {
      if (confirm('นำเข้าไฟล์ใหม่จะแทนที่ข้อมูลทั้งหมด (รวมรายการที่เพิ่มเองและโน้ต) ทำต่อไหม?')) pickAndImport(replaceAll);
    } else if ('signout' in ds) signOut();
    else if ('addTerm' in ds) termForm();
    else if (ds.term) termForm(ds.term);
    else if ('addSpecial' in ds) specialForm();
    else if (ds.special) specialForm(ds.special);
    else if ('addLost' in ds) lostForm();
    else if (ds.lost) lostForm(ds.lost);
    else if ('addRec' in ds) recurringForm();
    else if (ds.rec) recurringForm(ds.rec);
    else if (ds.student) studentForm(ds.student);
    else if (ds.room) roomForm(ds.room);
    else if (ds.plan) planForm(ds.plan);
    else if (ds.type) typeForm(ds.type);
  };
  root.querySelector('[data-autonight]').onchange = (e) => setAutoNight(e.target.checked);
}
