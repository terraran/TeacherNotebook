// Shared UI pieces: dialogs, generic form, occurrence chips and detail sheet.

import { html, raw, esc, SLOTS, slotOf, parseDate, thaiDateLong, DAY_FULL, toMin, fromMin } from './util.js';
import { col, types, ictTopic, shortName } from './model.js';
import { getData, patch } from './store.js';

export function typeColor(data, typeId) {
  return types(data)[typeId]?.color || '#8C8799';
}
export function dot(data, typeId) {
  return html`<i class="dot" style="background:${typeColor(data, typeId)}"></i>`;
}
export function typeLabel(data, typeId) {
  return html`<span class="typelab">${dot(data, typeId)}${types(data)[typeId]?.name || 'ไม่ระบุ'}</span>`;
}
export function legend(data) {
  return html`<div class="legend">${Object.keys(types(data)).map((id) => typeLabel(data, id))}</div>`;
}

/** One-line item: time · dot · name */
export function itemLine(data, o, cls = 'item') {
  const lost = o.lost ? html` <span class="tag warn">อาจเสียคาบ</span>` : '';
  return html`<button class="${cls}${o.lost ? ' lost' : ''}" data-occ="${o.id}" title="${o.title}">
    <span class="t">${o.start}</span>${dot(data, o.type)}<span class="n">${o.title}</span>${lost}</button>`;
}

let dlg;
export function openDialog(inner, bind) {
  if (!dlg) {
    dlg = document.createElement('dialog');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
  }
  dlg.innerHTML = `<div class="dlg">${inner.__raw ?? inner}</div>`;
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  bind?.(dlg);
  if (!dlg.open) dlg.showModal();
  return dlg;
}
export const closeDialog = () => dlg?.close();

/**
 * Generic edit form.
 * fields: [{ key, label, type: text|textarea|date|time|number|select|check, options: [[value,label]], half }]
 * onSave(values) / onDelete() return promises.
 */
export function formDialog({ title, fields, value = {}, onSave, onDelete, onInput, note }) {
  const field = (f) => {
    const v = value[f.key] ?? '';
    if (f.type === 'check')
      return html`<label class="check"><input type="checkbox" name="${f.key}" ${v ? raw('checked') : ''}> ${f.label}</label>`;
    let input;
    if (f.type === 'textarea') input = html`<textarea name="${f.key}">${v}</textarea>`;
    else if (f.type === 'select')
      input = html`<select name="${f.key}">${f.options.map(
        ([ov, ol]) => html`<option value="${ov}" ${String(ov) === String(v) ? raw('selected') : ''}>${ol}</option>`,
      )}</select>`;
    else input = html`<input name="${f.key}" type="${f.type || 'text'}" value="${v}" ${f.required ? raw('required') : ''}>`;
    return html`<label class="field"><span>${f.label}</span>${input}</label>`;
  };
  // group consecutive half-width fields in pairs
  const parts = [];
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].half && fields[i + 1]?.half) {
      parts.push(html`<div class="row2">${field(fields[i])}${field(fields[i + 1])}</div>`);
      i++;
    } else parts.push(field(fields[i]));
  }
  openDialog(
    html`<form method="dialog" class="dlg" style="padding:0">
      <h2>${title}</h2>
      ${note ? html`<div class="sub muted">${note}</div>` : ''}
      ${parts}
      <div class="acts">
        ${onDelete ? html`<button type="button" class="btn danger left" data-del>ลบ</button>` : ''}
        <button type="button" class="btn ghost" data-close>ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button>
      </div></form>`,
    (d) => {
      const form = d.querySelector('form');
      const read = () => {
        const out = {};
        for (const f of fields) {
          const el = form.elements[f.key];
          if (f.type === 'check') out[f.key] = el.checked;
          else if (f.type === 'number') out[f.key] = el.value === '' ? '' : Number(el.value);
          else out[f.key] = el.value.trim();
        }
        return out;
      };
      if (onInput) form.addEventListener('input', (e) => onInput(e, form));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await onSave(read());
          closeDialog();
        } catch (err) {
          alert(err.message);
        }
      });
      d.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!confirm('ลบรายการนี้?')) return;
        await onDelete();
        closeDialog();
      });
    },
  );
}

/** Clears unconfirmed flags for fields whose value changed. Returns the new flags object. */
export function updatedFlags(oldObj, newVals, clearAll) {
  if (clearAll) return null;
  const flags = { ...(oldObj?.unconfirmed || {}) };
  for (const k of Object.keys(flags)) if (k in newVals && newVals[k] !== oldObj[k]) delete flags[k];
  return Object.keys(flags).length ? flags : null;
}
export const hasFlags = (o) => o?.unconfirmed && (o.unconfirmed === true || Object.keys(o.unconfirmed).length > 0);
export const pendingTag = (o, key) =>
  (key ? o?.unconfirmed?.[key] : hasFlags(o)) ? html` <span class="tag warn">รอยืนยัน</span>` : '';

/** Event add/edit form. ev = existing event or defaults {date, start, end} */
export function eventForm(ev, id) {
  const data = getData();
  const slotOpts = SLOTS.map((s) => [s.key, `${s.name} ${s.start}–${s.end}`]);
  const typeOpts = Object.entries(types(data)).map(([k, t]) => [k, t.name]);
  const studentOpts = [['', '— ไม่ผูก —'], ...Object.entries(col(data, 'students')).map(([k, s]) => [k, s.name])];
  formDialog({
    title: id ? 'แก้ไขรายการ' : 'เพิ่มรายการ',
    value: { slot: slotOf(ev.start || '17:00')?.key || 'evening', repeat: 'none', type: 'personal', ...ev },
    fields: [
      { key: 'title', label: 'ชื่อรายการ', required: true },
      { key: 'date', label: 'วันที่', type: 'date', half: true, required: true },
      { key: 'slot', label: 'ช่วง', type: 'select', options: slotOpts, half: true },
      { key: 'start', label: 'เริ่ม', type: 'time', half: true, required: true },
      { key: 'end', label: 'จบ', type: 'time', half: true, required: true },
      { key: 'type', label: 'ประเภท', type: 'select', options: typeOpts, half: true },
      { key: 'studentId', label: 'นักเรียน', type: 'select', options: studentOpts, half: true },
      { key: 'repeat', label: 'ทำซ้ำ', type: 'select', options: [['none', 'ไม่ซ้ำ'], ['weekly', 'ทุกสัปดาห์']], half: true },
      { key: 'until', label: 'ซ้ำถึงวันที่ (ว่าง = ไม่มีกำหนด)', type: 'date', half: true },
      { key: 'note', label: 'หมายเหตุ', type: 'textarea' },
    ],
    onInput: (e, form) => {
      // picking a slot moves the times into it; typing a time updates the slot
      if (e.target.name === 'slot') {
        const s = SLOTS.find((x) => x.key === e.target.value);
        form.elements.start.value = s.start;
        form.elements.end.value = fromMin(Math.min(toMin(s.start) + 60, 1439));
      } else if (e.target.name === 'start' && e.target.value) {
        const s = slotOf(e.target.value);
        if (s) form.elements.slot.value = s.key;
      }
    },
    onSave: async (v) => {
      if (toMin(v.end) <= toMin(v.start)) throw new Error('เวลาจบต้องหลังเวลาเริ่ม');
      if (!slotOf(v.start)) {
        if (!confirm('เวลาเริ่มอยู่ช่วง 00:00–07:00 ซึ่งไม่อยู่ในช่วงใด ยังบันทึกไหม?')) throw new Error('ยกเลิกแล้ว');
      }
      delete v.slot;
      if (v.repeat !== 'weekly') v.until = '';
      await patch({ [`events/${id || 'e' + Date.now().toString(36)}`]: v });
    },
    onDelete: id ? () => patch({ [`events/${id}`]: null }) : null,
  });
}

/** Detail / prep sheet for an occurrence */
export function occurrenceSheet(o, { onEditRecurring } = {}) {
  const data = getData();
  const d = parseDate(o.date);
  const slot = slotOf(o.start);
  const rows = [
    ['วันที่', thaiDateLong(d)],
    ['เวลา', `${o.start}–${o.end}${slot ? ` · ช่วง${slot.name}` : ''}`],
  ];
  let extra = '';
  if (o.roomId) {
    const room = col(data, 'rooms')[o.roomId];
    const t = ictTopic(data, o.date, o.roomId);
    if (room) {
      rows.push(['ห้อง', `${room.name} (${room.thaiGrade})${o.group ? ` · กลุ่ม ${o.group}` : ''}`]);
      rows.push(['หน่วย', room.unit]);
    }
    if (t) rows.push([`หัวข้อสัปดาห์ ${t.week}`, t.topic || '— ยังไม่มีในแผน —']);
  }
  if (o.studentId) {
    const s = col(data, 'students')[o.studentId];
    if (s) {
      rows.push(['นักเรียน', `${s.name} · ${s.subject} · ${s.grade}`]);
      if (s.curriculum) rows.push(['หลักสูตร', s.curriculum]);
      rows.push(['หัวข้อปัจจุบัน', s.topic || '—']);
      if (s.notes) rows.push(['สิ่งที่ต้องรู้', s.notes]);
      if (s.language) rows.push(['ภาษาของสื่อ', s.language]);
      const hist = Object.values(col(data, 'history'))
        .filter((h) => h.studentId === o.studentId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);
      if (hist.length)
        extra = html`<div><div class="muted" style="font-size:13px;margin-bottom:4px">สื่อที่เตรียมล่าสุด</div>
          ${hist.map(
            (h) => html`<div style="font-size:14px;padding:4px 0;border-top:1px solid var(--line)">
              <span class="muted">${h.date}</span> · ${h.topic}
              ${h.link ? html` · <a href="${h.link}" target="_blank" rel="noopener">เปิดแชท</a>` : ''}</div>`,
          )}</div>`;
    }
  }
  if (o.note) rows.push(['หมายเหตุ', o.note]);
  if (o.lost) rows.push(['คาบที่เสีย', `${o.lost.reason} · ${o.lost.statusText || 'รอยืนยัน'}`]);
  if (o.repeat === 'weekly') rows.push(['ทำซ้ำ', `ทุกวัน${DAY_FULL[parseDate(o.date).getDay()]}${o.until ? ` ถึง ${o.until}` : ''}`]);

  openDialog(
    html`<h2>${shortName(data, o) === o.title ? o.title : html`${shortName(data, o)} <span class="muted" style="font-size:15px">${o.title.replace(shortName(data, o), '').replace(/^\s*·\s*/, '')}</span>`}</h2>
      <div>${typeLabel(data, o.type)}</div>
      <dl class="kv">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
      ${extra}
      ${o.studentId ? html`<div class="sub muted" style="font-size:13px">หน้าเตรียมสอนเต็ม (การบ้าน · ยังติด · แผนครั้งหน้า) จะมาในเฟส 2</div>` : ''}
      <div class="acts">
        ${o.kind === 'event' ? html`<button class="btn left" data-edit-ev>แก้ไข</button>` : ''}
        ${o.kind === 'recurring' && onEditRecurring ? html`<button class="btn left" data-edit-rec>แก้ไขรายการประจำ</button>` : ''}
        <button class="btn primary" data-close>ปิด</button>
      </div>`,
    (dl) => {
      dl.querySelector('[data-edit-ev]')?.addEventListener('click', () => {
        const ev = col(getData(), 'events')[o.srcId];
        eventForm(ev, o.srcId);
      });
      dl.querySelector('[data-edit-rec]')?.addEventListener('click', () => onEditRecurring(o.srcId));
    },
  );
}

export { esc };
