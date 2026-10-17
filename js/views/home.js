// Home: bento dashboard.

import { html, parseDate, SLOTS, slotOf, toMin, dateKey, addDays, weekStart, thaiDateLong, thaiDateShort, DAY_ABBR, durationText } from '../util.js';
import { occurrences, bySlot, happeningNow, nextLesson, shortName, awaitingLog, termStatus, startDate, findOccurrence } from '../model.js';
import { getData, write } from '../store.js';
import { dot, itemLine, typeColor, occurrenceSheet } from '../ui.js';
import { recurringForm } from './settings.js';

const SLOT_WEIGHT = SLOTS.map((s) => toMin(s.end) - toMin(s.start)); // 300:240:180:300 = 5:4:3:5

function heroInner(data, now) {
  const slot = slotOf(now.getHours() * 60 + now.getMinutes());
  const nowList = happeningNow(data, now);
  const next = nextLesson(data, now);
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  const segs = SLOTS.map((s, i) => {
    const a = toMin(s.start);
    const b = toMin(s.end);
    const pct = nowMin >= b ? 100 : nowMin <= a ? 0 : ((nowMin - a) / (b - a)) * 100;
    const cls = nowMin >= b ? 'past' : nowMin >= a ? 'cur' : '';
    return html`<div class="seg ${cls}" style="flex:${SLOT_WEIGHT[i]}">
      <div class="track"><div class="fill" style="width:${pct.toFixed(2)}%"></div></div>
      <div class="lab"><b>${s.name}</b>&nbsp;${s.start.slice(0, 2)}–${s.end.slice(0, 2)}</div></div>`;
  });

  let nowText;
  if (nowList.length)
    nowText = html`ตอนนี้ ${nowList.map((o, i) => html`${i ? ' · ' : ''}<b>${shortName(data, o)}</b> ถึง ${o.end}`)}`;
  else if (!slot) nowText = html`นอกช่วงเวลา · พักผ่อน`;
  else {
    const left = occurrences(data, dateKey(now)).filter((o) => !o.background && slotOf(o.start)?.key === slot.key && startDate(o) > now);
    nowText = left.length ? html`ว่างอยู่ · ถัดไปในช่วงนี้ <b>${shortName(data, left[0])}</b> ${left[0].start}` : html`ว่างอยู่ในช่วง${slot.name}`;
  }

  let cd;
  if (next) {
    const mins = (startDate(next) - now) / 60000;
    const sameDay = next.date === dateKey(now);
    const when = sameDay ? 'วันนี้' : next.date === dateKey(addDays(now, 1)) ? 'พรุ่งนี้' : `${DAY_ABBR[startDate(next).getDay()]}. ${thaiDateShort(startDate(next))}`;
    cd = html`<button class="countdown" data-occ="${next.id}">
      <div class="k">คาบถัดไป · กดเพื่อเตรียมสอน</div>
      <div class="v">อีก ${durationText(mins)} <span>· ${shortName(data, next)}</span></div>
      <div class="meta"><span>${when} ${next.start}–${next.end}</span><span class="typelab">${dot(data, next.type)}${data.settings.types[next.type]?.name}</span></div>
    </button>`;
  } else cd = html`<div class="countdown"><div class="k">คาบถัดไป</div><div class="v">ไม่มีใน 30 วันนี้</div></div>`;

  return html`<div class="hero-top"><span>${thaiDateLong(now)}</span>
      <span class="slot-pill ${slot ? '' : 'off'}">${slot ? `ช่วง${slot.name}` : 'นอกช่วง'}</span></div>
    <div class="clock">${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}<span class="secs">${String(now.getSeconds()).padStart(2, '0')}</span></div>
    <div class="now">${nowText}</div>
    <div class="slotbar">${segs}</div>
    ${cd}`;
}

function todayBox(data, now) {
  const key = dateKey(now);
  const list = occurrences(data, key);
  const g = bySlot(list);
  const cur = slotOf(now.getHours() * 60 + now.getMinutes())?.key;
  const band = list.find((o) => o.background);
  return html`<h2>วันนี้ตามช่วง ${band ? html`<small>${band.title} ${band.start}–${band.end}</small>` : ''}</h2>
    <div class="slots4">${SLOTS.map(
      (s) => html`<div class="tile ${s.key === cur ? 'cur' : ''}">
        <div class="tl"><span>${s.name}</span><span>${s.start}–${s.end}</span></div>
        ${g[s.key].length ? g[s.key].map((o) => itemLine(data, o)) : html`<div class="empty">ว่าง</div>`}
      </div>`,
    )}</div>`;
}

function weekBox(data, now) {
  const ws = weekStart(now);
  const today = dateKey(now);
  return html`<h2>สัปดาห์นี้ <small>${thaiDateShort(ws)} – ${thaiDateShort(addDays(ws, 6))}</small></h2>
    <div class="weekdots">${[0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = addDays(ws, i);
      const g = bySlot(occurrences(data, dateKey(d)));
      return html`<a class="d ${dateKey(d) === today ? 'today' : ''}" href="#/calendar?d=${dateKey(d)}" style="text-decoration:none">
        <span class="dn">${DAY_ABBR[d.getDay()]}</span>
        ${SLOTS.map((s) => {
          const items = g[s.key];
          const title = `${s.name}: ${items.map((o) => shortName(data, o)).join(', ') || 'ว่าง'}`;
          return items.length
            ? html`<i class="dd" title="${title}" style="background:${typeColor(data, items[0].type)};border-color:${typeColor(data, items[0].type)}"></i>`
            : html`<i class="dd" title="${title}"></i>`;
        })}</a>`;
    })}</div>`;
}

function termBox(data, now) {
  const t = termStatus(data, now);
  if (!t.term) return html`<h2>ภาคเรียน</h2><div class="big">—</div>`;
  if (t.state === 'before')
    return html`<h2>ภาคเรียน ${t.term.name}</h2><div class="big">อีก ${t.days} <small>วันเปิดเทอม</small></div>
      <div class="sub">เริ่ม ${thaiDateShort(parseDate(t.term.start))} · ${t.weeks} สัปดาห์</div>
      <div class="weeks">${Array.from({ length: t.weeks }, () => html`<i></i>`)}</div>`;
  if (t.state === 'after') return html`<h2>ภาคเรียน ${t.term.name}</h2><div class="big">จบแล้ว</div>`;
  return html`<h2>ภาคเรียน ${t.term.name}</h2><div class="big">สัปดาห์ ${t.week} <small>/ ${t.weeks}</small></div>
    <div class="sub">ถึง ${thaiDateShort(parseDate(t.term.end))}</div>
    <div class="weeks">${Array.from({ length: t.weeks }, (_, i) => html`<i class="${i + 1 < t.week ? 'done' : i + 1 === t.week ? 'cur' : ''}"></i>`)}</div>`;
}

function logBox(data, now) {
  const list = awaitingLog(data, now);
  return html`<h2>รอบันทึกผล <small>เฟส 2</small></h2>
    <div class="big">${list.length} <small>คาบ</small></div>
    <div class="scroll">${list.slice(0, 3).map((o) => html`<div style="font-size:13px">${thaiDateShort(startDate(o))} · ${shortName(data, o)}</div>`)}
    ${list.length ? '' : html`<div class="sub">คาบที่สอนจบแล้วจะมาขึ้นที่นี่</div>`}</div>`;
}

function homeworkBox() {
  return html`<h2>การบ้านรอตรวจ <small>เฟส 2</small></h2>
    <div class="big">0</div>
    <div class="sub">ยังไม่มีการบ้านค้างตรวจ</div>`;
}

function noteBox(data) {
  return html`<h2>โน้ตด่วน <small data-note-state></small></h2>
    <textarea class="note-area" data-note placeholder="จดอะไรไว้ก่อนก็ได้…">${data.quickNote || ''}</textarea>`;
}

export function renderHome(root) {
  const data = getData();
  const now = new Date();
  root.innerHTML = html`<div class="bento">
    <section class="box hero c2 r3" data-hero>${heroInner(data, now)}</section>
    <section class="box c2 r2" data-today>${todayBox(data, now)}</section>
    <section class="box" data-week>${weekBox(data, now)}</section>
    <section class="box dark" data-term>${termBox(data, now)}</section>
    <section class="box lilac" data-logs>${logBox(data, now)}</section>
    <section class="box soft">${homeworkBox()}</section>
    <section class="box c2">${noteBox(data)}</section>
  </div>`.__raw;

  root.onclick = (e) => {
    const b = e.target.closest('[data-occ]');
    if (!b) return;
    const o = findOccurrence(getData(), b.dataset.occ);
    if (o) occurrenceSheet(o, { onEditRecurring: recurringForm });
  };

  const ta = root.querySelector('[data-note]');
  const state = root.querySelector('[data-note-state]');
  let t;
  ta.addEventListener('input', () => {
    state.textContent = 'กำลังพิมพ์…';
    clearTimeout(t);
    t = setTimeout(async () => {
      await write('quickNote', ta.value);
      state.textContent = 'บันทึกแล้ว';
    }, 700);
  });
}

/** Called every second while Home is shown: refresh the clock; refresh other boxes once a minute. */
export function tickHome(root) {
  const data = getData();
  const now = new Date();
  const hero = root.querySelector('[data-hero]');
  if (!hero) return;
  hero.innerHTML = heroInner(data, now).__raw;
  if (now.getSeconds() === 0) {
    root.querySelector('[data-today]').innerHTML = todayBox(data, now).__raw;
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      root.querySelector('[data-week]').innerHTML = weekBox(data, now).__raw;
      root.querySelector('[data-term]').innerHTML = termBox(data, now).__raw;
    }
    root.querySelector('[data-logs]').innerHTML = logBox(data, now).__raw;
  }
}

/** Re-render on data change without clobbering the note being typed */
export function refreshHome(root) {
  const ta = root.querySelector('[data-note]');
  if (ta && document.activeElement === ta) {
    const data = getData();
    const now = new Date();
    for (const [sel, fn] of [['[data-today]', todayBox], ['[data-week]', weekBox], ['[data-term]', termBox], ['[data-logs]', logBox]])
      root.querySelector(sel).innerHTML = fn(data, now).__raw;
    return;
  }
  renderHome(root);
}

