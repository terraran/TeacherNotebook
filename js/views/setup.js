// First run: pick the seed workbook and import it.

import { html } from '../util.js';
import { parseSeed } from '../seed.js';
import { openDialog, closeDialog } from '../ui.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

export async function parseFile(buffer) {
  const XLSX = await import(XLSX_URL);
  return parseSeed(XLSX, buffer);
}

function summary(d) {
  const n = (o) => Object.keys(o || {}).length;
  const paused = Object.values(d.students).filter((s) => s.status === 'paused').map((s) => s.name);
  return html`<dl class="kv">
    <dt>ภาคเรียน</dt><dd>${Object.values(d.settings.terms).map((t) => `${t.name} (${t.start} → ${t.end})`).join(' · ')}</dd>
    <dt>ตารางประจำ</dt><dd>${n(d.recurring)} รายการต่อสัปดาห์</dd>
    <dt>ห้อง ICT</dt><dd>${n(d.rooms)} ห้อง</dd>
    <dt>คาบที่เสีย</dt><dd>${n(d.lostPeriods)} วัน</dd>
    <dt>นักเรียน</dt><dd>${n(d.students)} คน${paused.length ? ` (พักไว้: ${paused.join(', ')})` : ''}</dd>
    <dt>ประวัติ</dt><dd>${n(d.history)} รายการ</dd>
  </dl>`;
}

/** Opens a file picker, shows a summary, then calls save(data). */
export function pickAndImport(save) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    let data;
    try {
      data = await parseFile(await file.arrayBuffer());
    } catch (e) {
      alert('อ่านไฟล์ไม่สำเร็จ: ' + e.message);
      return;
    }
    confirmImport(data, save);
  };
  input.click();
}

export function confirmImport(data, save) {
  openDialog(
    html`<h2>พร้อมนำเข้า</h2>${summary(data)}
      <div class="sub muted">ช่องสีเหลืองในไฟล์จะขึ้นป้าย "รอยืนยัน" แก้ได้ในหน้าตั้งค่า</div>
      <div class="acts"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" data-go>นำเข้า</button></div>`,
    (d) =>
      d.querySelector('[data-go]').addEventListener('click', async () => {
        await save(data);
        closeDialog();
      }),
  );
}

export function renderSetup(root, save) {
  root.innerHTML = html`<div class="center"><div class="card">
    <h1>เริ่มต้นใช้งาน</h1>
    <p class="muted" style="margin:0">เลือกไฟล์ <b>สมุดครู_ข้อมูลตั้งต้น.xlsx</b> เพื่อนำเข้าตาราง ห้องเรียน นักเรียน และประวัติ ทำครั้งเดียว ไฟล์ไม่ถูกอัปโหลดไปไหน แอปอ่านในเครื่องแล้วเก็บเฉพาะข้อมูล</p>
    <button class="btn primary" data-pick>เลือกไฟล์ .xlsx</button>
  </div></div>`.__raw;
  root.querySelector('[data-pick]').onclick = () => pickAndImport(save);
}
