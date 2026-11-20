// Members (tabs + flip card), Ledger (year/month tabs) and Projected growth.
import { $, $$, bus, store, prefs, fmtINR, clamp, splitLetters } from './core.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const compactINR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 2 });
export const fmtBig = v => (Math.abs(v) >= 1e7 ? compactINR.format(v) : fmtINR(Math.round(v)));

/* Accessible tab list with a sliding indicator and arrow-key navigation. */
function tablist(el, onSelect) {
  const tabs = () => $$('[role=tab]', el), ind = $('.ptabs__ind', el);
  const move = b => { if (!b || !ind) return; ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px)`; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
  el.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) onSelect(b.dataset.id, true); });
  el.addEventListener('keydown', e => {
    const list = tabs(), i = list.indexOf(document.activeElement); if (i < 0) return;
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault(); const b = list[(j + list.length) % list.length]; b.focus(); onSelect(b.dataset.id, true);
  });
  return id => {
    tabs().forEach(b => { const on = b.dataset.id === id; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on) requestAnimationFrame(() => move(b)); });
  };
}
addEventListener('resize', () => $$('.ptabs').forEach(el => { const b = $('[aria-selected=true]', el), ind = $('.ptabs__ind', el); if (b && ind) { ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px)`; } }));

function slideIn(panel, dir) {
  if (prefs.reduced) return;
  panel.animate([{ opacity: 0, transform: `translateX(${dir * 32}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
}

/* ---------------- Members ---------------- */
let memberHook = null, filterHooked = false;
export function renderMembers(D, { initTilt }) {
  const root = $('#memberTabs');
  const ids = D.members.map(m => m.id);
  let current = ids.includes(store.get().memberTab) ? store.get().memberTab : ids[0];
  root.innerHTML = `<div class="ptabs" role="tablist" aria-label="Members">${D.members.map(m => `
      <button role="tab" id="mt-${m.id}" data-id="${m.id}" aria-controls="mpanel" aria-selected="false" tabindex="-1">
        <span class="mini-orb mini-orb--sm" style="--c:${m.color}" aria-hidden="true">${esc(m.initials)}</span><span>${esc(m.short)}</span>
      </button>`).join('')}<i class="ptabs__ind" aria-hidden="true"></i></div>
    <div class="mpanel" id="mpanel" role="tabpanel"></div>`;
  const panel = $('#mpanel', root);
  const mark = tablist($('.ptabs', root), (id, user) => show(id, user));
  const byYear = () => {
    const groups = new Map();
    D.months.forEach((mo, k) => { if (!groups.has(mo.year)) groups.set(mo.year, []); groups.get(mo.year).push(k); });
    return [...groups.entries()].reverse();
  };
  function card(m) {
    const paidN = m.paid.filter(Boolean).length;
    const pending = m.missed.length ? `<span class="badge badge--pending" data-tip="${esc(m.missed.join(', '))}: ${fmtINR(D.due)} each, not received yet" tabindex="0">${m.missed.length} pending</span>` : '<span class="badge">All paid</span>';
    const streak = m.streak ? `<span class="badge">${m.streak}-month streak</span>` : `<span class="badge">Best streak ${m.best}</span>`;
    const recent = D.months.slice(-12);
    const rows = byYear().map(([year, idxs]) => `
      <section class="mhist__year"><h5>${year}</h5><ul>
        ${idxs.slice().reverse().map(k => {
          const mo = D.months[k], ok = m.paid[k];
          const out = mo.expenses.filter(x => x.members.includes(m.id)).map(x => `<li class="out"><span>${esc(mo.name)} · ${esc(x.kind)}</span><span>−${fmtINR(x.perMember)}</span></li>`).join('');
          return `<li class="${ok ? 'ok' : 'no'}"><span>${esc(mo.name)}</span><span>${ok ? '✅ ' + fmtINR(D.due) : 'Pending'}</span></li>${out}`;
        }).join('')}
      </ul></section>`).join('');
    return `<article class="mflip" data-member="${m.id}">
      <div class="mflip__inner">
        <div class="mflip__face mflip__front">
          <div class="mflip__hero">
            <div class="mcard__frame" style="--c:${m.color}"><div class="mcard__orb"><span aria-hidden="true">${esc(m.initials)}</span></div></div>
            <div class="mflip__id">
              <h3 class="mcard__name"><span class="wave">${esc(m.name)}</span></h3>
              <p class="mflip__since">Member since ${esc(D.months[0].name)} ${D.months[0].year}</p>
              <div class="mflip__badges">${streak}${pending}</div>
            </div>
          </div>
          <dl class="mflip__stats">
            <div><dt>Paid in</dt><dd>${fmtINR(m.amount)}</dd></div>
            <div><dt>Sponsored</dt><dd>${fmtINR(m.sponsored)}</dd></div>
            <div><dt>Still in jar</dt><dd>${fmtINR(m.net)}</dd></div>
            <div><dt>Months paid</dt><dd>${paidN} of ${D.months.length}</dd></div>
          </dl>
          <div class="mflip__strip" aria-hidden="true">${recent.map((mo, k) => { const i = D.months.length - recent.length + k; return `<span class="${m.paid[i] ? '' : 'no'}"><i></i>${esc(mo.short)}</span>`; }).join('')}</div>
          <button class="btn btn--primary mflip__toggle" type="button" aria-expanded="false" aria-controls="mhist-${m.id}" data-cursor="Open"><span class="btn__label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>View payments</span></button>
        </div>
        <div class="mflip__face mflip__back" id="mhist-${m.id}" inert>
          <header class="mflip__backhead">
            <div><p class="eyebrow">Payments</p><h4>${esc(m.name)}</h4></div>
            <button class="btn btn--small mflip__back-btn" type="button"><span class="btn__label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Back</span></button>
          </header>
          <div class="mhist" tabindex="0" aria-label="Payment history for ${esc(m.name)}">${rows}</div>
          <footer class="mflip__foot"><span>In ${fmtINR(m.amount)}</span><span>Out ${fmtINR(m.sponsored)}</span><b>${fmtINR(m.net)}</b></footer>
        </div>
      </div>
    </article>`;
  }
  function show(id, user) {
    const prev = current, dir = ids.indexOf(id) >= ids.indexOf(prev) ? 1 : -1;
    current = id; store.set({ memberTab: id }); mark(id);
    const m = D.members.find(x => x.id === id);
    panel.setAttribute('aria-labelledby', `mt-${id}`);
    panel.innerHTML = card(m);
    const c = $('.mflip', panel);
    splitLetters($('.wave', c));
    initTilt?.($('.mflip__hero .mcard__frame', c));
    const front = $('.mflip__front', c), back = $('.mflip__back', c), toggle = $('.mflip__toggle', c);
    const flip = on => {
      c.classList.toggle('is-flipped', on);
      toggle.setAttribute('aria-expanded', on);
      front.inert = on; back.inert = !on;
      (on ? $('.mflip__back-btn', c) : toggle).focus({ preventScroll: true });
    };
    toggle.addEventListener('click', () => flip(true));
    $('.mflip__back-btn', c).addEventListener('click', () => flip(false));
    if (user && prev !== id) slideIn(c, dir);
  }
  show(current, false);
  memberHook = id => { if (id && id !== current && ids.includes(id)) show(id, true); };
  if (!filterHooked) { filterHooked = true; bus.on('filter', ({ id }) => memberHook?.(id)); }
}

/* ---------------- Ledger ---------------- */
export function renderLedger(D, { confetti, live }) {
  const root = $('#ledgerTabs');
  const years = [...new Set(D.months.map(m => m.year))];
  let year = years.includes(store.get().ledgerYear) ? store.get().ledgerYear : years.at(-1);
  let current = null;
  root.innerHTML = `<div class="lbar">
      ${years.length > 1 ? `<label class="lyear"><span class="sr-only">Year</span><select id="ledgerYear">${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg></label>` : `<span class="lyear lyear--one">${years[0]}</span>`}
      <div class="ptabs ptabs--months" role="tablist" aria-label="Months"></div>
    </div>
    <div class="lpanel" id="lpanel" role="tabpanel"></div>`;
  const tabsEl = $('.ptabs', root), panel = $('#lpanel', root), ghost = $('#ghostNum');
  let mark = null;
  function buildTabs() {
    const months = D.months.filter(m => m.year === year);
    tabsEl.innerHTML = months.map(m => `<button role="tab" id="lt-${m.key}" data-id="${m.key}" aria-controls="lpanel" aria-selected="false" tabindex="-1">${esc(m.short)}${m.full ? '' : '<i class="dot" aria-label="(pending)"></i>'}${m.spent ? '<i class="dot dot--out" aria-label="(money paid out)"></i>' : ''}</button>`).join('') + '<i class="ptabs__ind" aria-hidden="true"></i>';
    if (!mark) mark = tablist(tabsEl, (id, user) => show(id, user));
    return months;
  }
  function show(key, user) {
    const prev = current; current = key; mark(key);
    const i = D.months.findIndex(m => m.key === key), mo = D.months[i];
    const dir = prev && D.months.findIndex(m => m.key === prev) > i ? -1 : 1;
    panel.setAttribute('aria-labelledby', `lt-${key}`);
    const pct = mo.paid.length / D.members.length;
    panel.innerHTML = `<article class="lcard">
      <header class="lcard__head">
        <div><p class="eyebrow">${mo.year}</p><h3 class="lcard__name">${esc(mo.name)}</h3></div>
        ${mo.full ? '<span class="badge">✅ All paid</span>' : `<span class="badge badge--pending">${D.members.length - mo.paid.length} pending</span>`}
      </header>
      <div class="lcard__total"><span>Collected</span><b>${fmtINR(mo.total)}</b></div>
      <div class="lcard__bar" role="img" aria-label="${mo.paid.length} of ${D.members.length} paid"><i style="--p:${pct}"></i></div>
      <ul class="lcard__list">
        ${D.members.map((m, k) => `<li style="--i:${k}"><span class="mini-orb mini-orb--sm" style="--c:${m.color}" aria-hidden="true">${esc(m.initials)}</span><span>${esc(m.name)}</span>${mo.paid.includes(m.id) ? `<b class="ok">✅ ${fmtINR(D.due)}</b>` : '<b class="no">Pending</b>'}</li>`).join('')}
        ${mo.expenses.map((x, k) => `<li class="out" style="--i:${D.members.length + k}"><span class="mini-orb mini-orb--sm mini-orb--out" aria-hidden="true">−</span><span>${esc(x.kind)}: ${esc(x.title)}</span><b class="no">−${fmtINR(x.amount)}</b></li>`).join('')}
      </ul>
      <dl class="lcard__sum"><div><dt>Collected so far</dt><dd>${fmtINR(mo.cum)}</dd></div><div><dt>Paid out so far</dt><dd>${fmtINR(mo.spentCum)}</dd></div><div><dt>Balance in jar</dt><dd>${fmtINR(mo.balance)}</dd></div></dl>
    </article>`;
    if (ghost) { ghost.textContent = String(mo.num).padStart(2, '0'); ghost.classList.remove('roll'); void ghost.offsetWidth; ghost.classList.add('roll'); }
    if (user) {
      slideIn($('.lcard', panel), dir);
      live?.(`${mo.name} ${mo.year}: ${mo.paid.length} of ${D.members.length} paid, ${fmtINR(mo.total)}. Balance ${fmtINR(mo.balance)}.`);
      if (mo.full && prev !== key) confetti?.($('.lcard__head', panel));
    }
  }
  function setYear(y, user) {
    year = y; store.set({ ledgerYear: y });
    const months = buildTabs();
    const keep = months.find(m => m.key === current);
    show((keep || months.at(-1)).key, user);
  }
  $('#ledgerYear', root)?.addEventListener('change', e => setYear(+e.target.value, true));
  if ($('#ledgerYear', root)) $('#ledgerYear', root).value = year;
  setYear(year, false);
}

/* ---------------- Projected growth ---------------- */
export function renderProjection(D) {
  const root = $('#projection');
  const st = store.get().proj || { years: 5, rate: 0 };
  const monthly = D.due * D.members.length, start = D.balance;
  root.innerHTML = `
    <header class="proj__head">
      <div><p class="eyebrow">Projected growth</p><h3 class="proj__title">Where the jar could be</h3>
      <p class="proj__lede">Starting from today’s ${fmtINR(start)}, with ${D.members.length} members paying ${fmtINR(D.due)} every month (${fmtINR(monthly)} a month). Add an interest rate to see compounding.</p></div>
    </header>
    <div class="proj__controls">
      <div class="proj__years" role="radiogroup" aria-label="Years ahead">
        ${Array.from({ length: 10 }, (_, i) => `<button type="button" role="radio" data-y="${i + 1}" aria-checked="false" tabindex="-1">${i + 1}<small>yr${i ? 's' : ''}</small></button>`).join('')}
      </div>
      <div class="proj__rate">
        <label for="projRate">Annual interest <output id="projRateOut" for="projRate">0%</output></label>
        <input type="range" id="projRate" min="0" max="500" step="1" value="${st.rate}" aria-describedby="projRateNote">
        <p class="proj__note" id="projRateNote">0–500% a year, compounded monthly. Optional: leave at 0% for savings only.</p>
      </div>
    </div>
    <div class="proj__body">
      <figure class="proj__chart">
        <svg id="projSvg" viewBox="0 0 720 300" role="img" aria-labelledby="projSummary"></svg>
        <div class="proj__tip" id="projTip" hidden></div>
        <figcaption class="proj__legend"><span><i class="sw sw--rate"></i>With interest</span><span><i class="sw sw--save"></i>Savings only</span></figcaption>
      </figure>
      <div class="proj__stats" id="projStats"></div>
    </div>
    <p class="sr-only" id="projSummary" aria-live="polite"></p>`;
  const svg = $('#projSvg', root), statsEl = $('#projStats', root), tip = $('#projTip', root), rateIn = $('#projRate', root), rateOut = $('#projRateOut', root);
  const yearBtns = $$('.proj__years button', root);
  let series = [];
  let W = 720, H = 300;
  const L = 72, R = 16, T = 16, B = 32;

  function compute(years, rate) {
    const r = rate / 100 / 12, out = [];
    let save = start, grow = start;
    out.push({ m: 0, save, grow });
    for (let m = 1; m <= years * 12; m++) {
      save += monthly;
      grow = grow * (1 + r) + monthly;
      out.push({ m, save, grow });
    }
    return out;
  }
  function draw(animate = true) {
    W = Math.round(svg.getBoundingClientRect().width) || 720; H = W < 500 ? 240 : 300;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.height = H + 'px';
    const { years, rate } = st;
    series = compute(years, rate);
    const n = series.length - 1, max = Math.max(...series.map(p => p.grow)) || 1;
    const x = m => L + (m / n) * (W - L - R), y = v => H - B - (v / max) * (H - T - B);
    const line = key => series.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
    const area = `${line('grow')} L${x(n)} ${H - B} L${x(0)} ${H - B} Z`;
    const ticksY = [0, .25, .5, .75, 1].map(f => `<g class="tick"><line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${L - 8}" y="${y(max * f) + 4}" text-anchor="end">${fmtBig(max * f)}</text></g>`).join('');
    const step = years > 6 ? 2 : 1;
    const ticksX = Array.from({ length: years + 1 }, (_, i) => i).filter(i => i % step === 0).map(i => `<text class="xl" x="${x(i * 12)}" y="${H - 8}" text-anchor="middle">${i === 0 ? 'Now' : `${i}y`}</text>`).join('');
    svg.innerHTML = `<defs><linearGradient id="projFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${ticksY}${ticksX}
      <path class="proj__area" d="${area}" fill="url(#projFill)"/>
      ${rate > 0 ? `<path class="proj__save" d="${line('save')}" pathLength="1"/>` : ''}
      <path class="proj__grow" d="${line('grow')}" pathLength="1"/>
      <circle class="proj__end" cx="${x(n)}" cy="${y(series[n].grow)}" r="6"/>
      <line class="proj__guide" id="projGuide" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
    const end = series[n], put = start + monthly * n, interest = end.grow - end.save;
    statsEl.innerHTML = `
      <div class="pstat pstat--main"><span>In ${years} year${years > 1 ? 's' : ''}</span><b>${fmtBig(end.grow)}</b></div>
      <div class="pstat"><span>Money paid in</span><b>${fmtBig(put)}</b><small>${fmtINR(start)} today + ${fmtINR(monthly)} × ${n}</small></div>
      <div class="pstat"><span>Interest earned</span><b>${fmtBig(interest)}</b><small>${rate}% a year</small></div>
      <div class="pstat"><span>Per member</span><b>${fmtBig(end.grow / D.members.length)}</b><small>if shared equally by ${D.members.length}</small></div>`;
    $('#projSummary', root).textContent = `In ${years} years at ${rate}% interest the jar could hold ${fmtBig(end.grow)}: ${fmtBig(put)} paid in and ${fmtBig(interest)} interest.`;
    if (animate && !prefs.reduced) $$('.proj__grow, .proj__save', svg).forEach(p => p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' }));
  }
  function setYears(y, focus) {
    st.years = y; store.set({ proj: st });
    yearBtns.forEach(b => { const on = +b.dataset.y === y; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    draw();
  }
  yearBtns.forEach(b => b.addEventListener('click', () => setYears(+b.dataset.y)));
  $('.proj__years', root).addEventListener('keydown', e => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
    e.preventDefault(); setYears(clamp(st.years + d, 1, 10), true);
  });
  let raf = 0;
  rateIn.addEventListener('input', () => {
    st.rate = +rateIn.value; rateOut.textContent = st.rate + '%';
    rateIn.style.setProperty('--fill', (st.rate / 5) + '%');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
  });
  rateOut.textContent = st.rate + '%'; rateIn.style.setProperty('--fill', (st.rate / 5) + '%');
  // hover / touch readout
  const readout = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
    const n = series.length - 1, m = clamp(Math.round((px - L) / (W - L - R) * n), 0, n), p = series[m];
    const gx = L + (m / n) * (W - L - R), guide = $('#projGuide', svg);
    guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('visibility', 'visible');
    const yrs = Math.floor(m / 12), mos = m % 12;
    tip.innerHTML = `<b>${m === 0 ? 'Today' : `${yrs ? yrs + 'y ' : ''}${mos ? mos + 'm' : ''}`}</b><br>${fmtBig(p.grow)}${st.rate > 0 ? `<br><small>savings only ${fmtBig(p.save)}</small>` : ''}`;
    tip.hidden = false; tip.style.left = (gx / W * 100) + '%';
  };
  svg.addEventListener('pointermove', readout);
  svg.addEventListener('pointerdown', readout);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; $('#projGuide', svg)?.setAttribute('visibility', 'hidden'); });
  setYears(st.years);
  let rw = 0;
  new ResizeObserver(() => { const w = Math.round(svg.getBoundingClientRect().width); if (w && w !== rw) { rw = w; draw(false); } }).observe(svg);
}
