// Calendar: week view (7 days × 4 slots) and month view.

import { html, SLOTS, dateKey, parseDate, addDays, weekStart, thaiDateShort, DAY_ABBR, DAY_FULL, MONTH_FULL, slotOf } from '../util.js';
import { occurrences, bySlot, specialDaysOn, termOn, findOccurrence, types } from '../model.js';
import { getData } from '../store.js';
import { itemLine, legend, typeColor, occurrenceSheet, eventForm } from '../ui.js';
import { recurringForm } from './settings.js';

const state = { view: 'week', anchor: new Date() };

export function setCalendarParams(params) {
  if (params.get('d')) state.anchor = parseDate(params.get('d'));
  if (params.get('v')) state.view = params.get('v') === 'month' ? 'month' : 'week';
}

/** Background band (work hours) cells: slots the band overlaps */
function bandSlots(list) {
  const band = list.find((o) => o.background);
  if (!band) return null;
  const a = band.start;
  const b = band.end;
  return { band, keys: SLOTS.filter((s) => a < s.end && b > s.start).map((s) => s.key) };
}

function dayHead(data, d, todayKey) {
  const key = dateKey(d);
  const sp = specialDaysOn(data, key);
  return html`<div class="h ${key === todayKey ? 'today' : ''}">
    <div class="dn">${DAY_ABBR[d.getDay()]}</div><div class="dt">${d.getDate()}</div>
    ${sp.map((s) => html`<span class="sp">${s.name}</span>`)}</div>`;
}

function weekView(data) {
  const ws = weekStart(state.anchor);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i));
  const todayKey = dateKey(new Date());
  const perDay = days.map((d) => {
    const key = dateKey(d);
    const list = occurrences(data, key);
    return { d, key, list, g: bySlot(list), band: bandSlots(list), inTerm: !!termOn(data, key) };
  });
  const early = perDay.some((x) => x.g.none.length);

  const cell = (x, slotKey) => {
    const banded = x.band?.keys.includes(slotKey);
    const showBandLabel = banded && x.band.keys[0] === slotKey;
    return html`<div class="cell ${banded ? 'band' : ''}">
      ${showBandLabel ? html`<span class="band-lab">${x.band.band.title.replace('เวลาทำงานที่โรงเรียน', 'เวลางาน')} ${x.band.band.start}–${x.band.band.end}</span>` : ''}
      ${x.g[slotKey].map((o) => itemLine(data, o, 'chip'))}</div>`;
  };

  const grid = html`<div class="wk">
    <div></div>${perDay.map((x) => dayHead(data, x.d, todayKey))}
    ${early ? html`<div class="sl">ก่อน 07:00</div>${perDay.map((x) => cell(x, 'none'))}` : ''}
    ${SLOTS.map((s) => html`<div class="sl">${s.name}<small>${s.start}–${s.end}</small></div>${perDay.map((x) => cell(x, s.key))}`)}
  </div>`;

  const agenda = html`<div class="agenda">${perDay.map((x) => {
    const sp = specialDaysOn(data, x.key);
    return html`<div class="day ${x.key === todayKey ? 'today' : ''}">
      <h3>${DAY_FULL[x.d.getDay()]} ${thaiDateShort(x.d)} ${sp.map((s) => html`<span class="tag">${s.name}</span>`)}
        ${x.band ? html`<span class="muted" style="font-size:12px">เวลางาน ${x.band.band.start}–${x.band.band.end}</span>` : ''}</h3>
      ${[...(x.g.none.length ? [{ key: 'none', name: 'ก่อน 7' }] : []), ...SLOTS].map(
        (s) => html`<div class="slotrow ${x.band?.keys.includes(s.key) ? 'band' : ''}"><span class="sn">${s.name}</span>
          <div>${x.g[s.key].length ? x.g[s.key].map((o) => itemLine(data, o, 'chip')) : html`<span class="muted" style="font-size:13px">—</span>`}</div></div>`,
      )}</div>`;
  })}</div>`;

  const title = `${thaiDateShort(days[0])} – ${thaiDateShort(days[6])} ${days[6].getFullYear() + 543}`;
  return { title, body: html`${grid}${agenda}` };
}

function monthView(data) {
  const a = state.anchor;
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const start = weekStart(first);
  const last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  const end = addDays(weekStart(last), 6);
  const todayKey = dateKey(new Date());
  const cells = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = dateKey(d);
    const g = bySlot(occurrences(data, key));
    const count = SLOTS.reduce((n, s) => n + g[s.key].length, 0) + g.none.length;
    const sp = specialDaysOn(data, key);
    cells.push(html`<button class="mc ${d.getMonth() !== a.getMonth() ? 'other' : ''} ${key === todayKey ? 'today' : ''}" data-day="${key}">
      <span class="num">${d.getDate()}</span>
      <span class="dots">${SLOTS.map((s) =>
        g[s.key].length
          ? html`<i class="dot" title="${s.name}" style="background:${typeColor(data, g[s.key][0].type)}"></i>`
          : html`<i class="dot" title="${s.name}" style="background:transparent;border:1.5px solid var(--line)"></i>`,
      )}</span>
      ${sp.map((x) => html`<span class="sp">${x.name}</span>`)}
      ${count ? html`<span class="cnt">${count} รายการ</span>` : ''}</button>`);
  }
  return {
    title: `${MONTH_FULL[a.getMonth()]} ${a.getFullYear() + 543}`,
    body: html`<div class="mo">${['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((x) => html`<div class="dh">${x}</div>`)}${cells}</div>
      <p class="muted" style="font-size:13px">จุด 4 จุด = เช้า · บ่าย · ค่ำ · ดึก (สีตามประเภทของรายการแรกในช่วง) · กดวันเพื่อดูสัปดาห์นั้น</p>`,
  };
}

export function renderCalendar(root) {
  const data = getData();
  const v = state.view === 'month' ? monthView(data) : weekView(data);
  root.innerHTML = html`<div class="bar">
      <h1>${v.title}</h1>
      <div class="seg-ctl"><button data-v="week" class="${state.view === 'week' ? 'on' : ''}">สัปดาห์</button><button data-v="month" class="${state.view === 'month' ? 'on' : ''}">เดือน</button></div>
      <button class="btn" data-nav="-1" aria-label="ก่อนหน้า">‹</button>
      <button class="btn" data-nav="0">วันนี้</button>
      <button class="btn" data-nav="1" aria-label="ถัดไป">›</button>
      <button class="btn primary" data-add>+ เพิ่มรายการ</button>
    </div>
    ${legend(data)}
    ${v.body}`.__raw;

  root.onclick = (e) => {
    const t = e.target.closest('[data-v],[data-nav],[data-add],[data-occ],[data-day]');
    if (!t) return;
    if (t.dataset.v) state.view = t.dataset.v;
    else if (t.dataset.nav !== undefined) {
      const n = Number(t.dataset.nav);
      const a = state.anchor;
      if (n === 0) state.anchor = new Date();
      else if (state.view === 'month') state.anchor = new Date(a.getFullYear(), a.getMonth() + n, 1);
      else state.anchor = addDays(a, 7 * n);
    } else if (t.dataset.add !== undefined) {
      const today = new Date();
      const inView = state.view === 'week' && weekStart(today).getTime() === weekStart(state.anchor).getTime();
      const d = inView || state.view === 'month' ? today : weekStart(state.anchor);
      const now = slotOf(today.getHours() * 60) || SLOTS[2];
      return eventForm({ date: dateKey(d), start: now.start, end: now.start.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, '0')), type: Object.keys(types(data)).includes('personal') ? 'personal' : undefined });
    } else if (t.dataset.occ) {
      const o = findOccurrence(getData(), t.dataset.occ);
      if (o) occurrenceSheet(o, { onEditRecurring: recurringForm });
      return;
    } else if (t.dataset.day) {
      state.anchor = parseDate(t.dataset.day);
      state.view = 'week';
    }
    renderCalendar(root);
  };
}
