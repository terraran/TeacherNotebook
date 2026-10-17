// Entry: auth → first-run import → router.

import { html } from './util.js';
import { initStore, getData, getUser, onChange, mode, signIn, replaceAll } from './store.js';
import { applyTheme, toggleTheme } from './theme.js';
import { renderHome, tickHome, refreshHome } from './views/home.js';
import { renderCalendar, setCalendarParams } from './views/calendar.js';
import { renderSettings } from './views/settings.js';
import { renderSetup, parseFile, confirmImport } from './views/setup.js';

const main = document.querySelector('main');
const nav = document.querySelector('.nav');
const themeBtn = document.querySelector('[data-theme-toggle]');
const modeNote = document.querySelector('.mode-note');

const ROUTES = { home: renderHome, calendar: renderCalendar, settings: renderSettings };
let current = '';

const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function paintThemeBtn(t) {
  themeBtn.innerHTML = t === 'dark' ? `${SUN}<span>กลางวัน</span>` : `${MOON}<span>กลางคืน</span>`;
}

function parseHash() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  return { route: ROUTES[path] ? path : 'home', params: new URLSearchParams(query || '') };
}

function render() {
  const user = getUser();
  if (!user) {
    nav.hidden = true;
    main.innerHTML = html`<div class="center"><div class="card">
      <h1>สมุดครู</h1><p class="muted" style="margin:0">เข้าสู่ระบบเพื่อใช้ข้อมูลชุดเดียวกันบนมือถือและคอม</p>
      <button class="btn primary" data-signin>เข้าสู่ระบบด้วย Google</button></div></div>`.__raw;
    main.querySelector('[data-signin]').onclick = () => signIn().catch((e) => alert(e.message));
    return;
  }
  if (!getData()?.settings) {
    nav.hidden = true;
    current = 'setup';
    renderSetup(main, replaceAll);
    return;
  }
  nav.hidden = false;
  const { route, params } = parseHash();
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.route === route));
  if (route === 'calendar') setCalendarParams(params);
  current = route;
  ROUTES[route](main);
}

function onData() {
  // Don't yank the user out of an open dialog; views re-render underneath it.
  if (current === 'home' && getData()?.settings) return refreshHome(main);
  render();
}

async function start() {
  paintThemeBtn(applyTheme());
  themeBtn.onclick = () => paintThemeBtn(toggleTheme());
  if (mode === 'local') modeNote.textContent = 'โหมดในเครื่อง';
  main.innerHTML = '<div class="center muted">กำลังโหลด…</div>';
  onChange(onData);
  await initStore();
  render();
  window.addEventListener('hashchange', render);
  setInterval(() => {
    paintThemeBtn(applyTheme());
    if (current === 'home') tickHome(main);
  }, 1000);

  // Local dev helper: import the seed copy in dev/ without a file picker.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    window.__devImport = async () => {
      const buf = await (await fetch('dev/seed.xlsx')).arrayBuffer();
      confirmImport(await parseFile(buf), replaceAll);
    };
  }
}

start();
