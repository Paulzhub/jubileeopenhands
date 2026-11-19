// Jubilee Open Hands — page orchestration (vanilla ES modules).
import { $, $$, bus, store, prefs, fmtINR, clamp, lerp, hasWebGL, splitLetters } from './core.js';

const root = document.documentElement;
const MEMBER_COLORS = ['#97B3B6', '#B88F7A', '#6E9296', '#874844', '#5E7A6E'];
const ICONS = {
  jar: '<svg viewBox="0 0 24 24"><path d="M8 3h8M7 6h10l-1 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8z"/><path d="M10 13h4"/></svg>',
  rate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="5" rx="1.5"/><path d="M5 13v7h14v-7M12 8v12M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z"/></svg>',
  coins: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 20a4.5 4.5 0 0 1 7.5-3.4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
};

/* ---------------- data ---------------- */
export function computeLedger(L) {
  const due = L.monthlyDue, ids = L.members.map(m => m.id);
  let run = 0;
  const months = L.months.map(m => {
    const d = new Date(m.month + '-01T00:00:00');
    const total = m.paid.length * due;
    run += total;
    return {
      key: m.month, paid: m.paid, total, cum: run, full: m.paid.length === ids.length,
      name: d.toLocaleString('en-IN', { month: 'long' }), short: d.toLocaleString('en-IN', { month: 'short' }),
      num: d.getMonth() + 1, year: d.getFullYear(),
    };
  });
  // expenses / investments paid out of the jar
  const spentBy = {};
  const expenses = (L.expenses || []).map(x => {
    const d = new Date(x.month + '-01T00:00:00');
    const amount = x.perMember * x.members.length;
    spentBy[x.month] = (spentBy[x.month] || 0) + amount;
    return { ...x, amount, monthName: d.toLocaleString('en-IN', { month: 'long' }), year: d.getFullYear() };
  });
  let spentRun = 0;
  months.forEach(m => { m.spent = spentBy[m.key] || 0; spentRun += m.spent; m.spentCum = spentRun; m.balance = m.cum - spentRun; m.expenses = expenses.filter(x => x.month === m.key); });
  const members = L.members.map((mem, idx) => {
    const paid = months.map(m => m.paid.includes(mem.id));
    const sponsored = expenses.reduce((a, x) => a + (x.members.includes(mem.id) ? x.perMember : 0), 0);
    let cur = 0; for (let i = paid.length - 1; i >= 0 && paid[i]; i--) cur++;
    let best = 0, r = 0; paid.forEach(p => { r = p ? r + 1 : 0; best = Math.max(best, r); });
    const missed = months.filter((m, i) => !paid[i]).map(m => m.name);
    return { ...mem, color: MEMBER_COLORS[idx % MEMBER_COLORS.length], paid, amount: paid.filter(Boolean).length * due, sponsored, net: paid.filter(Boolean).length * due - sponsored, streak: cur, best, missed };
  });
  const expected = months.length * ids.length * due;
  return { group: L.group, due, months, members, expenses, total: run, spent: spentRun, balance: run - spentRun, expected, outstanding: expected - run, rate: run / expected };
}

/* ---------------- loader ---------------- */
const loader = $('#loader');
let loadPct = 0, loadDone = false;
const tasks = [];
function track(promise, weight) {
  tasks.push({ weight, done: false });
  const t = tasks[tasks.length - 1];
  Promise.resolve(promise).catch(() => {}).finally(() => { t.done = true; updateLoad(); });
  return promise;
}
function updateLoad() {
  const tot = tasks.reduce((a, t) => a + t.weight, 0) || 1;
  const done = tasks.reduce((a, t) => a + (t.done ? t.weight : 0), 0);
  setLoad(done / tot);
  if (tasks.every(t => t.done)) finishLoad();
}
function setLoad(p) {
  loadPct = Math.max(loadPct, p);
  $('#loaderPct').textContent = Math.round(loadPct * 100);
  $('#loaderBar').style.width = (loadPct * 100) + '%';
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* Curtain wipe: two layers rise, the label is revealed and held long enough to read,
   `mid` runs while the screen is covered, then the layers lift away. */
const wipeEl = $('#wipe');
// Wait for an animation, but never longer than its own length: navigation must not
// depend on frames being painted (background tabs, throttled timers).
const settle = (anim, ms) => Promise.race([anim.finished.catch(() => {}), sleep(ms + 120)]);
let wiping = null;
export function wipe(label, sub, mid, hold = 900) {
  if (wiping) return wiping;
  if (prefs.reduced) { mid?.(); bus.emit('wipe:out'); return Promise.resolve(); }
  const a = $('.wipe__a', wipeEl), b = $('.wipe__b', wipeEl), big = $('#wipeLabel'), small = $('#wipeSub');
  big.textContent = label; small.textContent = sub || '';
  const ease = 'cubic-bezier(.65,0,.35,1)', out = 'cubic-bezier(.22,1,.36,1)';
  wiping = (async () => {
    wipeEl.classList.add('is-on');
    a.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 700, easing: ease, fill: 'forwards' });
    await settle(b.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 700, delay: 120, easing: ease, fill: 'forwards' }), 820);
    big.animate([{ clipPath: 'inset(0 0 100% 0)', transform: 'translateY(48px)' }, { clipPath: 'inset(-8px -8px -16px -8px)', transform: 'none' }], { duration: 640, easing: out, fill: 'forwards' });
    small.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 160, easing: out, fill: 'forwards' });
    try { await mid?.(); } catch (err) { console.error(err); }
    await sleep(hold + 640);
    big.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    small.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    await sleep(160);
    bus.emit('wipe:out');
    b.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 800, easing: ease, fill: 'forwards' });
    await settle(a.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 800, delay: 140, easing: ease, fill: 'forwards' }), 940);
    [a, b, big, small].forEach(x => x.getAnimations().forEach(an => an.cancel()));
    wipeEl.classList.remove('is-on');
    wiping = null;
  })();
  return wiping;
}

function finishLoad() {
  if (loadDone) return; loadDone = true;
  setLoad(1);
  if (prefs.reduced) { loader.remove(); bus.emit('ready'); return; }
  // Hold the finished loading screen so it can be read, then a long curtain carrying the name.
  setTimeout(() => {
    const off = bus.on('wipe:out', () => { off(); bus.emit('ready'); });
    wipe('Jubilee Open Hands', 'Saving together since June 2026', () => { loader.remove(); }, 1300);
  }, 900);
}
// Never hold people longer than 3s waiting for assets; let them skip.
setTimeout(finishLoad, 3000);
['keydown', 'pointerdown'].forEach(t => addEventListener(t, () => { if (loadPct > .2) finishLoad(); }, { once: true }));

/* ---------------- theme ---------------- */
const MODES = ['system', 'light', 'dark'];
const mqDark = matchMedia('(prefers-color-scheme: dark)');
function readTheme() { try { return localStorage.getItem('joh-theme') || 'system'; } catch { return 'system'; } }
function applyTheme(mode) {
  if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
  const dark = mode === 'dark' || (mode === 'system' && mqDark.matches);
  root.classList.toggle('is-dark', dark);
  $('#themeMode').textContent = mode === 'system' ? 'A' : mode === 'light' ? 'L' : 'D';
  $('#themeBtn').setAttribute('aria-label', `Theme: ${mode}${mode === 'system' ? (dark ? ' (dark)' : ' (light)') : ''}. Switch theme`);
  try { localStorage.setItem('joh-theme', mode); } catch {}
  store.set({ theme: mode, dark });
  bus.emit('theme', { dark });
}
function cycleTheme(origin) {
  const next = MODES[(MODES.indexOf(store.get().theme) + 1) % MODES.length];
  const btn = origin || $('#themeBtn');
  const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (!document.startViewTransition || prefs.reduced) { applyTheme(next); toast(`Theme: ${next}`); return; }
  const vt = document.startViewTransition(() => applyTheme(next));
  vt.ready.then(() => {
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
      { duration: 640, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
  toast(`Theme: ${next}`);
}
mqDark.addEventListener('change', () => store.get().theme === 'system' && applyTheme('system'));
applyTheme(readTheme());
$('#themeBtn').addEventListener('click', e => cycleTheme(e.currentTarget));

/* ---------------- toasts + tooltips ---------------- */
export function toast(msg, icon = ICONS.check) {
  const el = document.createElement('div');
  el.className = 'toast'; el.innerHTML = icon + `<span></span>`; el.querySelector('span').textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); }, 2400);
}
bus.on('toast', ({ msg }) => toast(msg));
const tip = $('#tooltip');
function showTip(el) {
  const text = el.dataset.tip; if (!text) return;
  tip.textContent = text; tip.hidden = false;
  const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
  let x = clamp(r.left + r.width / 2 - t.width / 2, 8, innerWidth - t.width - 8);
  let y = r.bottom + 8; if (y + t.height > innerHeight - 8) y = r.top - t.height - 8;
  tip.style.transform = `translate(${x}px, ${y}px)`;
}
function hideTip() { tip.hidden = true; }
document.addEventListener('pointerover', e => { const el = e.target.closest('[data-tip]'); if (el && e.pointerType === 'mouse') showTip(el); });
document.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]')) hideTip(); });
document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el && el.matches(':focus-visible')) showTip(el); });
document.addEventListener('focusout', hideTip);
addEventListener('scroll', hideTip, { passive: true });

/* ---------------- nav ---------------- */
const nav = $('#nav'), pill = $('.nav__pill'), links = $$('[data-link]');
const sectionMap = [['explainer', '#top'], ['insights', '#insights'], ['members', '#members'], ['expenses', '#expenses'], ['ledger', '#ledger']];
let activeLink = null;
function movePill(a) {
  if (!a) { pill.style.opacity = 0; return; }
  pill.style.opacity = 1;
  pill.style.width = a.offsetWidth + 'px';
  pill.style.transform = `translateX(${a.offsetLeft}px)`;
}
function onScrollNav() {
  nav.classList.toggle('is-scrolled', scrollY > 24);
  const probe = innerHeight * .4;
  let cur = null;
  for (const [id, sel] of sectionMap) { const el = $(sel); if (el && el.getBoundingClientRect().top <= probe) cur = id; }
  if (scrollY < 80) cur = null;
  if (cur !== activeLink) {
    activeLink = cur;
    links.forEach(a => { const on = a.dataset.link === cur; a.classList.toggle('is-active', on); on ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'); });
    movePill(links.find(a => a.dataset.link === cur));
    bus.emit('section', { id: cur });
  }
  const max = document.documentElement.scrollHeight - innerHeight;
  $('#railFill').style.height = (max > 0 ? scrollY / max * 100 : 0) + '%';
  store.set({ scroll: scrollY, scrollP: max > 0 ? scrollY / max : 0 });
}
addEventListener('scroll', onScrollNav, { passive: true });
addEventListener('resize', () => movePill(links.find(a => a.dataset.link === activeLink)));
onScrollNav();
$$('.wave').forEach(el => splitLetters(el));

const sheet = $('#sheet'), menuBtn = $('#menuBtn');
function setSheet(open) {
  menuBtn.setAttribute('aria-expanded', open);
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open) { sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('is-open')); sheet.querySelector('a').focus({ preventScroll: true }); }
  else { sheet.classList.remove('is-open'); setTimeout(() => { if (menuBtn.getAttribute('aria-expanded') === 'false') sheet.hidden = true; }, 480); }
}
menuBtn.addEventListener('click', () => setSheet(menuBtn.getAttribute('aria-expanded') !== 'true'));
// Menu-bar navigation: a curtain wipe carrying the section's name, then land on the section.
document.addEventListener('click', e => {
  const a = e.target.closest('#nav a[href^="#"], #sheet a[href^="#"]');
  if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const target = $(a.getAttribute('href')); if (!target) return;
  e.preventDefault();
  if (a.closest('#sheet')) setSheet(false);
  const go = () => {
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    try { history.replaceState(null, '', a.getAttribute('href') === '#top' ? location.pathname : a.getAttribute('href')); } catch {}
  };
  wipe(a.dataset.name || a.textContent.trim(), a.dataset.sub || 'Jubilee Open Hands', go);
});

/* ---------------- headline reveal ---------------- */
const title = $('#heroTitle');
$$('.line', title).forEach(line => {
  const text = line.textContent; line.textContent = ''; line.setAttribute('aria-hidden', 'true');
  let i = 0;
  text.split(' ').forEach((word, w) => {
    if (w) line.append(' ');
    const wd = document.createElement('span'); wd.className = 'word';
    [...word].forEach(c => {
      const s = document.createElement('span');
      s.className = 'ch'; s.textContent = c;
      s.style.transitionDelay = `${i * 24}ms, ${i * 24}ms`; i++;
      wd.append(s);
    });
    line.append(wd);
  });
});
if (!prefs.reduced) title.classList.add('is-pre');
let readyFired = false;
bus.on('ready', () => !readyFired && (readyFired = true) && requestAnimationFrame(() => {
  title.classList.remove('is-pre');
  // restore normal hover speed after the intro settles
  setTimeout(() => $$('.ch', title).forEach(s => s.style.transitionDelay = '0ms'), 1800);
}));

/* ---------------- reveals ---------------- */
const revealIO = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    en.target.classList.remove('is-pending'); en.target.classList.add('is-in');
    revealIO.unobserve(en.target);
    bus.emit('revealed', { el: en.target });
  });
}, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
export function reveal(el, i = 0) {
  el.style.setProperty('--i', i);
  if (prefs.reduced) { bus.emit('revealed', { el }); return; }
  if (!loadDone || el.getBoundingClientRect().top > innerHeight * .92) el.classList.add('is-pending');
  revealIO.observe(el);
}
$$('.reveal, .clip').forEach((el, i) => reveal(el, el.closest('.hero') ? i : 0));

/* ---------------- magnetic + ripple ---------------- */
function initMagnetic(el) {
  const strength = .3;
  let raf = 0;
  const move = e => {
    if (!prefs.fine || prefs.reduced) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      el.style.translate = `${dx * strength}px ${dy * strength}px`;
      const inner = el.querySelector('.btn__label, svg'); if (inner) inner.style.transform = `translate(${dx * .12}px, ${dy * .12}px)`;
    });
  };
  const leave = () => {
    cancelAnimationFrame(raf);
    el.style.transition = 'translate 480ms cubic-bezier(.34,1.56,.64,1), transform 120ms, box-shadow 240ms';
    el.style.translate = '0 0';
    const inner = el.querySelector('.btn__label, svg'); if (inner) inner.style.transform = '';
    setTimeout(() => el.style.transition = '', 500);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
}
$$('.magnetic').forEach(initMagnetic);
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn, .chip-btn'); if (!b || prefs.reduced) return;
  const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement('span');
  s.className = 'ripple';
  Object.assign(s.style, { width: size + 'px', height: size + 'px', left: (e.clientX - r.left - size / 2) + 'px', top: (e.clientY - r.top - size / 2) + 'px' });
  b.append(s); setTimeout(() => s.remove(), 650);
});

/* ---------------- cursor with context + trail ---------------- */
function initCursor() {
  const cur = $('#cursor'), ring = $('.cursor__ring', cur), dot = $('.cursor__dot', cur), label = $('.cursor__label', cur);
  const trailCv = $('#trail'), tc = trailCv.getContext('2d');
  let mx = -100, my = -100, rx = -100, ry = -100, on = false, raf = 0;
  const pts = [];
  const sizeTrail = () => { trailCv.width = innerWidth * devicePixelRatio; trailCv.height = innerHeight * devicePixelRatio; };
  const enable = () => {
    const want = prefs.fine && !prefs.reduced;
    if (want === on) return; on = want;
    root.classList.toggle('has-cursor', on);
    if (on) { sizeTrail(); loop(); } else cancelAnimationFrame(raf);
  };
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX; my = e.clientY;
    pts.push({ x: mx, y: my, t: performance.now() }); if (pts.length > 6) pts.shift();
    const t = e.target.closest?.('[data-cursor]');
    const ctx = t && !e.target.closest('input');
    cur.classList.toggle('is-ctx', !!ctx);
    if (ctx) label.textContent = t.dataset.cursor;
    cur.classList.toggle('is-link', !ctx && !!e.target.closest?.('a, button, [role=tab], summary'));
  }, { passive: true });
  addEventListener('pointerdown', () => cur.classList.add('is-down'));
  addEventListener('pointerup', () => cur.classList.remove('is-down'));
  document.addEventListener('pointerleave', () => { mx = my = -100; });
  addEventListener('resize', () => on && sizeTrail());
  const cs = getComputedStyle(root);
  function loop() {
    raf = requestAnimationFrame(loop);
    rx = lerp(rx, mx, .2); ry = lerp(ry, my, .2);
    dot.style.transform = `translate(${mx}px, ${my}px)`;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    // trail: 6 fading points
    const dpr = devicePixelRatio, now = performance.now();
    tc.clearRect(0, 0, trailCv.width, trailCv.height);
    const brand = cs.getPropertyValue('--brand').trim(), accent = cs.getPropertyValue('--accent').trim();
    pts.forEach((p, i) => {
      const age = (now - p.t) / 400; if (age > 1) return;
      tc.globalAlpha = (1 - age) * (i / pts.length) * .5;
      tc.fillStyle = i % 2 ? brand : accent;
      tc.beginPath(); tc.arc(p.x * dpr, p.y * dpr, (2 + i) * dpr * (1 - age * .5), 0, Math.PI * 2); tc.fill();
    });
  }
  prefs.onChange(enable); enable();
}
initCursor();

/* ---------------- counters / scramble ---------------- */
function countUp(el, to, format, dur = 1400) {
  if (prefs.reduced) { el.textContent = format(to); return; }
  const glyphs = '0123456789₹%';
  const t0 = performance.now();
  const final = format(to);
  const tick = now => {
    const p = clamp((now - t0) / dur, 0, 1);
    if (p < .25) { // scramble phase
      el.textContent = [...final].map(c => /\d/.test(c) ? glyphs[(Math.random() * 10) | 0] : c).join('');
    } else {
      const e = 1 - Math.pow(1 - (p - .25) / .75, 3);
      el.textContent = format(to * e);
    }
    if (p < 1) requestAnimationFrame(tick); else el.textContent = final;
  };
  requestAnimationFrame(tick);
}

/* ---------------- tilt ---------------- */
function initTilt(el) {
  el.addEventListener('pointermove', e => {
    if (!prefs.fine || prefs.reduced) return;
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', px * 100 + '%'); el.style.setProperty('--my', py * 100 + '%');
    el.style.transform = `perspective(800px) rotateX(${(.5 - py) * 10}deg) rotateY(${(px - .5) * 12}deg) translateY(-4px)`;
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
}

/* ---------------- render: KPIs ---------------- */
function renderKPIs(D) {
  const pct = v => (v * 100).toFixed(1) + '%';
  const items = [
    { icon: ICONS.jar, label: 'In hand', to: D.balance, fmt: v => fmtINR(Math.round(v)), sub: `after ${fmtINR(D.spent)} given out` },
    { icon: ICONS.coins, label: 'Collected', to: D.total, fmt: v => fmtINR(Math.round(v)), sub: `${D.months.length} months · ${D.members.length} members · ${fmtINR(D.due)} each` },
    { icon: ICONS.gift, label: 'Sponsored', to: D.spent, fmt: v => fmtINR(Math.round(v)), sub: D.expenses.map(x => x.title.replace(' Celebration', '')).join(', ') || 'Nothing yet' },
    { icon: ICONS.rate, label: 'Collection rate', to: D.rate, fmt: v => pct(v), sub: `${fmtINR(D.outstanding)} of dues outstanding` },
  ];
  const grid = $('#kpis'); grid.innerHTML = '';
  items.forEach((it, i) => {
    const a = document.createElement('article');
    a.className = 'kpi reveal';
    a.innerHTML = `<div class="kpi__label"><span class="kpi__icon" aria-hidden="true">${it.icon}</span>${it.label}</div>
      <div><div class="kpi__value" aria-hidden="true">${it.fmt(0)}</div><p class="kpi__sub">${it.sub}</p></div>
      <span class="sr-only">${it.label}: ${it.fmt(it.to)}. ${it.sub}</span>`;
    grid.append(a);
    initTilt(a);
    const val = $('.kpi__value', a);
    let ran = false;
    const run = () => { if (ran) return; ran = true; countUp(val, it.to, it.fmt); };
    bus.on('revealed', ({ el }) => el === a && run());
    reveal(a, i);
  });
}

/* ---------------- render: members ---------------- */
function renderMembers(D) {
  const grid = $('#memberGrid'); grid.innerHTML = '';
  D.members.forEach((m, i) => {
    const card = document.createElement('article');
    card.className = 'mcard reveal'; card.tabIndex = 0; card.dataset.member = m.id;
    const pending = m.missed.length ? `<span class="badge badge--pending" data-tip="${m.missed.join(', ')} payment of ${fmtINR(D.due)} not received yet" tabindex="0">${m.missed.map(x => x.slice(0, 3)).join(', ')} pending</span>` : '';
    const streak = m.streak ? `<span class="badge">${m.streak}-month streak</span>` : `<span class="badge">Best streak ${m.best}</span>`;
    card.setAttribute('aria-label', `${m.name}: paid in ${fmtINR(m.amount)}, sponsored ${fmtINR(m.sponsored)}, ${fmtINR(m.net)} still in the jar. ${m.missed.length ? m.missed.join(', ') + ' pending.' : 'All months paid.'}`);
    card.innerHTML = `
      <div class="preview" aria-hidden="true"><ul>${D.months.map((mo, k) => `<li><span>${mo.short}</span><span class="${m.paid[k] ? '' : 'no'}">${m.paid[k] ? '✅ ' + fmtINR(D.due) : 'Pending'}</span></li>`).join('')}${m.sponsored ? `<li class="full"><span>Sponsorship</span><span class="no">−${fmtINR(m.sponsored)}</span></li>` : ''}</ul></div>
      <div class="mcard__frame" style="--c:${m.color}"><div class="mcard__orb"><span aria-hidden="true">${m.initials}</span></div></div>
      <div><h3 class="mcard__name"><span class="wave">${m.name}</span></h3></div>
      <div class="mcard__row"><span class="mcard__amt">${fmtINR(m.amount)}</span><span class="dots" aria-hidden="true">${m.paid.map(p => `<i class="${p ? '' : 'no'}"></i>`).join('')}</span></div>
      <p class="mcard__meta"><span>Sponsored <b>${fmtINR(m.sponsored)}</b></span><span>In jar <b>${fmtINR(m.net)}</b></span></p>
      <div class="mcard__row">${streak}${pending}</div>`;
    grid.append(card);
    splitLetters($('.wave', card));
    card.addEventListener('click', e => { if (e.target.closest('.badge--pending')) return; bus.emit('filter', { id: store.get().filter === m.id ? null : m.id }); });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
    reveal(card, i);
  });
}

/* ---------------- render: investments & expenses ---------------- */
function renderExpenses(D) {
  const grid = $('#expGrid'); grid.innerHTML = '';
  const flow = document.createElement('article');
  flow.className = 'exp-flow reveal';
  const rows = [
    { label: 'Collected', v: D.total, cls: 'in', off: 0 },
    { label: 'Given out', v: -D.spent, cls: 'out', off: D.balance / D.total },
    { label: 'In hand', v: D.balance, cls: 'net', off: 0 },
  ];
  flow.innerHTML = `<h3 class="exp-flow__title">Money in, money out</h3>
    <ol class="exp-flow__rows">${rows.map((r, i) => `<li class="exp-flow__row exp-flow__row--${r.cls}" style="--w:${Math.abs(r.v) / D.total};--off:${r.off};--i:${i}">
      <span class="exp-flow__label">${r.label}</span><span class="exp-flow__track"><i></i></span><b>${r.v < 0 ? '−' : ''}${fmtINR(Math.abs(r.v))}</b></li>`).join('')}</ol>
    <p class="exp-flow__note">${fmtINR(D.spent)} of the ${fmtINR(D.total)} we collected (${Math.round(D.spent / D.total * 100)}%) has gone back into our community.</p>`;
  grid.append(flow); reveal(flow, 0);
  bus.on('revealed', ({ el }) => el === flow && flow.classList.add('is-drawn'));
  if (prefs.reduced) flow.classList.add('is-drawn');
  const byId = Object.fromEntries(D.members.map(m => [m.id, m]));
  D.expenses.forEach((x, i) => {
    const c = document.createElement('article');
    c.className = 'exp-card reveal';
    c.innerHTML = `<div class="exp-card__top"><span class="badge">${x.kind}</span><span class="exp-card__date">${x.monthName} ${x.year}</span></div>
      <div class="exp-card__icon" aria-hidden="true">${ICONS.gift}</div>
      <h3 class="exp-card__title">${x.title}</h3>
      <p class="exp-card__amt">${fmtINR(x.amount)}</p>
      <p class="exp-card__sub">${fmtINR(x.perMember)} from each of us, paid from the jar</p>
      <ul class="exp-card__who">${x.members.map(id => `<li data-tip="${byId[id].name}: ${fmtINR(x.perMember)}"><span class="mini-orb" style="--c:${byId[id].color}" aria-hidden="true">${byId[id].initials}</span><span class="sr-only">${byId[id].name}: ${fmtINR(x.perMember)}</span></li>`).join('')}</ul>
      <p class="exp-card__status"><span aria-hidden="true">✅</span> Paid</p>`;
    grid.append(c); initTilt(c); reveal(c, i + 1);
  });
}

/* ---------------- render: ledger ---------------- */
function renderLedger(D) {
  const track = $('#ledgerTrack'); track.innerHTML = '';
  const byId = Object.fromEntries(D.members.map(m => [m.id, m]));
  D.months.forEach((mo, i) => {
    const li = document.createElement('li');
    li.className = 'month reveal';
    const missing = D.members.filter(m => !mo.paid.includes(m.id));
    li.innerHTML = `<div class="month__card">
      <button class="month__btn" aria-expanded="false" aria-controls="mb-${i}" data-cursor="Open">
        <span class="month__top"><span class="month__name">${mo.name}</span><span class="month__yr">${String(mo.num).padStart(2, '0')} · ${mo.year}</span></span>
        <span class="month__total">${fmtINR(mo.total)}</span>
        ${mo.spent ? `<span class="month__spend">−${fmtINR(mo.spent)} · ${mo.expenses.map(x => x.kind).join(', ')}</span>` : ''}
        <span class="month__status"><span>${mo.full ? `<span class="full-mark">✅ All ${mo.paid.length} paid</span>` : `${mo.paid.length} of ${D.members.length} paid`}</span>
        <span class="month__chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span></span>
      </button>
      <div class="month__body" id="mb-${i}" role="region" aria-label="${mo.name} payments"><div>
        <ul class="month__list">
          ${D.members.map((m, k) => `<li style="--i:${k}"><span>${m.name}</span>${mo.paid.includes(m.id) ? '<span class="ok">✅ ₹500</span>' : '<span class="no">Pending</span>'}</li>`).join('')}
          ${mo.expenses.map((x, k) => `<li style="--i:${D.members.length + k}" class="spend"><span>${x.kind}: ${x.title}</span><span class="no">−${fmtINR(x.amount)}</span></li>`).join('')}
          <li style="--i:${D.members.length + 1}"><b>Collected so far</b><b>${fmtINR(mo.cum)}</b></li>
          <li style="--i:${D.members.length + 2}"><b>Balance in jar</b><b>${fmtINR(mo.balance)}</b></li>
        </ul>
      </div></div></div>`;
    track.append(li);
    const btn = $('.month__btn', li);
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', open);
      $('.month__card', li).classList.toggle('is-full-open', open && mo.full);
      if (open && mo.full) confetti(btn);
      if (open) live(`${mo.name}: ${mo.paid.length} of ${D.members.length} paid, ${fmtINR(mo.total)}. Balance ${fmtINR(mo.balance)}.${missing.length ? ' Pending: ' + missing.map(m => m.name).join(', ') + '.' : ''}`);
      bus.emit('ledger:resize');
    });
    reveal(li, i % 3);
  });
  initLedgerPin(D);
}

function initLedgerPin(D) {
  const sec = $('#ledger'), move = $('#ledgerMove'), ghost = $('#ghostNum'), path = $('#ledgerPath'), svg = $('#ledgerLine');
  let pinned = false, len = 0, lastIdx = -1;
  const layout = () => {
    pinned = innerWidth >= 900 && !prefs.reduced;
    sec.classList.toggle('is-pinned', pinned);
    move.style.transform = '';
    if (!pinned) { sec.style.height = ''; return; }
    const dist = move.scrollWidth - innerWidth;
    sec.style.height = (innerHeight + Math.max(0, dist)) + 'px';
    // running-total line across card centres
    const cards = $$('.month', move);
    const w = move.scrollWidth, h = 150;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.style.width = w + 'px'; svg.style.height = h + 'px';
    const top = Math.max(...D.months.map(m => m.balance));
    const pts = cards.map((c, i) => [c.offsetLeft + c.offsetWidth / 2, h - 16 - (D.months[i].balance / top) * (h - 40)]);
    path.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '));
    len = path.getTotalLength(); path.style.strokeDasharray = len;
    onScroll();
  };
  const onScroll = () => {
    if (!pinned) return;
    const r = sec.getBoundingClientRect();
    const span = sec.offsetHeight - innerHeight;
    const p = clamp(-r.top / (span || 1), 0, 1);
    move.style.transform = `translate3d(${-p * Math.max(0, move.scrollWidth - innerWidth)}px,0,0)`;
    path.style.strokeDashoffset = len * (1 - p);
    const idx = Math.round(p * (D.months.length - 1));
    if (idx !== lastIdx) {
      lastIdx = idx; ghost.textContent = String(D.months[idx].num).padStart(2, '0');
      ghost.classList.remove('roll'); void ghost.offsetWidth; ghost.classList.add('roll');
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', layout);
  bus.on('ledger:resize', () => setTimeout(layout, 500));
  prefs.onChange(layout);
  document.fonts?.ready.then(layout);
  layout();
}

/* ---------------- confetti (success feedback) ---------------- */
function confetti(fromEl) {
  if (prefs.reduced) { toast('Fully paid month'); return; }
  const r = fromEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + 40;
  const cs = getComputedStyle(root), cols = ['--brand', '--accent', '--accent-ink', '--brand-ink'].map(v => cs.getPropertyValue(v).trim());
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('i');
    p.className = 'confetti'; p.style.background = cols[i % cols.length];
    p.style.left = cx + 'px'; p.style.top = cy + 'px';
    document.body.append(p);
    const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 140;
    p.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v - 60}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: .6 },
      { transform: `translate(${Math.cos(a) * v * 1.2}px, ${Math.sin(a) * v + 120}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 400, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = () => p.remove();
  }
}

function live(msg) { const l = $('#live'); l.textContent = ''; setTimeout(() => l.textContent = msg, 30); }

/* ---------------- filter (shared state) ---------------- */
bus.on('filter', ({ id }) => {
  store.set({ filter: id });
  $$('.mcard[data-member]').forEach(c => { c.classList.toggle('is-hl', c.dataset.member === id); c.classList.toggle('is-dim', !!id && c.dataset.member !== id); });
});

/* ---------------- shortcuts + dialogs ---------------- */
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) && e.target.type !== 'range') return;
  if (e.key === 'Escape') { if (menuBtn.getAttribute('aria-expanded') === 'true') { setSheet(false); menuBtn.focus(); } bus.emit('escape'); return; }
  if ($('dialog[open]')) return;
  if (e.key === '?') { $('#keysModal').showModal(); return; }
  const k = e.key.toLowerCase();
  if (k === 't') cycleTheme();
  else if (k === 'm') bus.emit('voice:toggle');
  else if (e.key === ' ' && !['button', 'a', 'input'].includes(tag) && !e.target.closest('[role=tab]')) { e.preventDefault(); bus.emit('player:toggle'); }
});

/* ---------------- boot ---------------- */
const webgl = hasWebGL();
if (!webgl) root.classList.add('no-webgl');

track(document.fonts ? document.fonts.ready : null, 1);
const ledgerP = track(fetch('data/ledger.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }), 2);

ledgerP.then(raw => {
  const D = computeLedger(raw);
  store.set({ data: D });
  renderKPIs(D); renderMembers(D); renderExpenses(D); renderLedger(D);
  // explainer (player works without WebGL; the 3D stage is optional)
  track(import('./explainer.js').then(m => m.initExplainer({ D, webgl, toast })), 3);
  // background orbs
  if (webgl) track(import('./bg.js').then(m => m.initBg($('#bg'))), 2);
  // charts: lazy, when the section approaches
  const io = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    io.disconnect();
    import('./charts.js').then(m => m.initCharts({ D, webgl, toast }));
  }, { rootMargin: '600px 0px' });
  io.observe($('#insights'));
  // deep link like #insights-share
  const h = location.hash.slice(1);
  if (h.startsWith('insights-')) { store.set({ view: h.split('-')[1] }); }
}).catch(err => {
  console.error(err);
  finishLoad();
  toast('Could not load the ledger. Refresh to try again.', ICONS.rate);
});
