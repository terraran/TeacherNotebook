// Day/night theme. Manual toggle + optional auto-dark during the ดึก slot. Stored per device.

import { slotOf, dateKey } from './util.js';

const KEY = 'kru-theme';

function load() {
  try {
    return { theme: 'light', autoNight: false, override: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { theme: 'light', autoNight: false, override: '' };
  }
}
function save(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

/** Key of the current ดึก slot instance, so a manual toggle wins until the slot ends */
function nightKey(now) {
  return slotOf(now.getHours() * 60 + now.getMinutes())?.key === 'night' ? dateKey(now) + '-night' : '';
}

export const getThemePrefs = load;

export function effectiveTheme(now = new Date()) {
  const p = load();
  const nk = nightKey(now);
  if (p.autoNight && nk && p.override !== nk) return 'dark';
  return p.theme;
}

export function applyTheme() {
  const t = effectiveTheme();
  if (document.documentElement.dataset.theme !== t) document.documentElement.dataset.theme = t;
  return t;
}

export function toggleTheme() {
  const p = load();
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  p.theme = next;
  p.override = nightKey(new Date());
  save(p);
  return applyTheme();
}

export function setAutoNight(on) {
  const p = load();
  p.autoNight = on;
  p.override = '';
  save(p);
  applyTheme();
}
