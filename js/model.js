// Calendar logic: turns recurring items + user events into dated occurrences.

import { SLOTS, slotOf, toMin, dateKey, parseDate, addDays, daysBetween } from './util.js';

export const col = (data, name) => (data && data[name]) || {};
export const types = (data) => data?.settings?.types || {};
export const terms = (data) => data?.settings?.terms || {};

export function termOn(data, key) {
  for (const [id, t] of Object.entries(terms(data))) if (key >= t.start && key <= t.end) return { id, ...t };
  return null;
}

export function specialDaysOn(data, key) {
  return Object.values(data?.settings?.specialDays || {}).filter((s) => key >= s.start && key <= (s.end || s.start));
}

function lostFor(data, key, roomId) {
  return Object.values(col(data, 'lostPeriods')).find((l) => l.date === key && (l.rooms || []).includes(roomId)) || null;
}

/** Week number inside a term (1-based), or null */
export function termWeek(term, key) {
  if (!term) return null;
  return Math.floor(daysBetween(parseDate(term.start), parseDate(key)) / 7) + 1;
}
export function termWeeks(term) {
  return Math.ceil((daysBetween(parseDate(term.start), parseDate(term.end)) + 1) / 7);
}

/** ICT topic planned for a room on a date */
export function ictTopic(data, key, roomId) {
  const room = col(data, 'rooms')[roomId];
  const term = termOn(data, key);
  if (!room || !term) return null;
  const w = termWeek(term, key);
  const plan = col(data, 'ictPlan')[`${term.id}_w${w}`];
  return plan ? { week: w, topic: plan[room.year] || '', unconfirmed: !!plan.unconfirmed } : { week: w, topic: '' };
}

/**
 * All occurrences on a date, sorted by start.
 * Each: { id, kind, srcId, date, start, end, title, type, roomId, group, studentId, background, lost, note }
 * lost = the คาบที่เสีย entry when it is still unconfirmed (confirmed ones are skipped entirely).
 */
export function occurrences(data, key) {
  if (!data) return [];
  const d = parseDate(key);
  const dow = d.getDay();
  const inTerm = !!termOn(data, key);
  const T = types(data);
  const students = col(data, 'students');
  const out = [];

  for (const [id, r] of Object.entries(col(data, 'recurring'))) {
    if (Number(r.dow) !== dow) continue;
    if (T[r.type]?.termBound && !inTerm) continue;
    if (r.studentId && students[r.studentId]?.status === 'paused') continue;
    let lost = null;
    if (r.roomId) {
      lost = lostFor(data, key, r.roomId);
      if (lost?.confirmed) continue;
    }
    out.push({ ...r, id: `${key}|r|${id}`, kind: 'recurring', srcId: id, date: key, lost });
  }

  for (const [id, e] of Object.entries(col(data, 'events'))) {
    let hit = false;
    if (e.repeat === 'weekly') hit = key >= e.date && (!e.until || key <= e.until) && parseDate(e.date).getDay() === dow;
    else hit = e.date === key;
    if (!hit) continue;
    if (e.studentId && students[e.studentId]?.status === 'paused') continue;
    out.push({ ...e, id: `${key}|e|${id}`, kind: 'event', srcId: id, date: key, lost: null });
  }

  return out.sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
}

export function findOccurrence(data, occId) {
  const key = occId.split('|')[0];
  return occurrences(data, key).find((o) => o.id === occId) || null;
}

/** { morning: [...], afternoon: [...], evening: [...], night: [...], none: [...] } – background items excluded */
export function bySlot(list) {
  const out = { none: [] };
  SLOTS.forEach((s) => (out[s.key] = []));
  for (const o of list) {
    if (o.background) continue;
    out[slotOf(o.start)?.key || 'none'].push(o);
  }
  return out;
}

export const isLesson = (o) => !o.background && !o.lost && (o.type === 'school' || o.type === 'tutor');

const at = (key, hhmm) => {
  const d = parseDate(key);
  d.setMinutes(toMin(hhmm));
  return d;
};
export const startDate = (o) => at(o.date, o.start);
export const endDate = (o) => at(o.date, o.end);

export function happeningNow(data, now) {
  const key = dateKey(now);
  return occurrences(data, key).filter((o) => !o.background && !o.lost && startDate(o) <= now && endDate(o) > now);
}

export function nextLesson(data, now, horizonDays = 30) {
  for (let i = 0; i <= horizonDays; i++) {
    const key = dateKey(addDays(now, i));
    const o = occurrences(data, key).find((x) => isLesson(x) && startDate(x) > now);
    if (o) return o;
  }
  return null;
}

/** Display name for an occurrence: student name for tutoring, title otherwise */
export function shortName(data, o) {
  if (o.studentId) return col(data, 'students')[o.studentId]?.name || o.title;
  return o.title;
}

/** Lessons that ended since the app started being used and still have no log (logs come in phase 2). */
export function awaitingLog(data, now) {
  if (!data?.meta?.importedAt) return [];
  const since = dateKey(new Date(data.meta.importedAt));
  const logged = col(data, 'logIndex');
  const out = [];
  for (let d = parseDate(since); d <= now; d = addDays(d, 1)) {
    for (const o of occurrences(data, dateKey(d))) {
      if (isLesson(o) && endDate(o) <= now && !logged[o.id.replace(/\|/g, '_')]) out.push(o);
    }
  }
  return out.reverse();
}

export function termStatus(data, today) {
  const key = dateKey(today);
  const list = Object.entries(terms(data))
    .map(([id, t]) => ({ id, ...t }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const cur = list.find((t) => key >= t.start && key <= t.end);
  if (cur) return { state: 'in', term: cur, week: termWeek(cur, key), weeks: termWeeks(cur) };
  const next = list.find((t) => t.start > key);
  if (next) return { state: 'before', term: next, days: daysBetween(today, parseDate(next.start)), weeks: termWeeks(next) };
  return { state: 'after', term: list[list.length - 1] || null };
}
