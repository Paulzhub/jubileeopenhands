// Shared primitives: DOM helpers, event bus, store, live preferences, formatting.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeBack = t => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const fmtINR = v => inr.format(v);

export const bus = (() => {
  const m = new Map();
  return {
    on(t, f) { (m.get(t) || m.set(t, new Set()).get(t)).add(f); return () => m.get(t).delete(f); },
    emit(t, d = {}) { m.get(t)?.forEach(f => f(d)); },
  };
})();

export const store = (() => {
  let s = { theme: 'system', dark: false, filter: null, view: 'overview', voice: true, scroll: 0, scrollP: 0, data: null };
  const subs = new Set();
  return {
    get: () => s,
    set(patch) { const prev = s; s = { ...s, ...patch }; subs.forEach(f => f(s, prev)); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
})();

// Live preferences: read when an effect runs, not at startup.
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
export const prefs = {
  get reduced() { return mqReduce.matches; },
  get fine() { return mqFine.matches; },
  onChange(f) { mqReduce.addEventListener('change', f); mqFine.addEventListener('change', f); },
};

export function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// Split text into letter spans for hover waves; keep it readable to screen readers.
export function splitLetters(el) {
  if (!el || el.dataset.split) return;
  const text = el.textContent; el.dataset.split = '1';
  el.textContent = '';
  const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = text; el.append(sr);
  [...text].forEach((c, i) => {
    const s = document.createElement('span');
    s.className = 'l'; s.setAttribute('aria-hidden', 'true'); s.style.setProperty('--i', i);
    s.textContent = c === ' ' ? ' ' : c;
    el.append(s);
  });
}
