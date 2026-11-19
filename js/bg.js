// Background: interactive 3D orb particles that react to scroll, pointer and touch.
import * as THREE from 'three';
import { bus, store, prefs, cssVar } from './core.js';

const VERT = /* glsl */`
uniform float uTime, uScroll, uPx, uAspect, uPointerOn;
uniform vec2 uPointer;
uniform vec4 uRipples[4];
attribute vec3 aBase; attribute float aSize, aSeed, aMix;
varying float vAlpha, vMix;
void main() {
  vec3 p = aBase;
  float t = uTime * (.12 + aSeed * .1);
  p.x += sin(t + aSeed * 6.28) * .6;
  p.y += cos(t * .8 + aSeed * 3.1) * .5;
  float depth = clamp((p.z + 12.) / 16., 0., 1.);
  p.y = mod(p.y + uScroll * (.002 + depth * .006) + 15., 30.) - 15.;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 d = ndc - uPointer; d.x *= uAspect;
  float dist = length(d);
  vec2 dir = d / max(dist, 1e-4);
  float push = uPointerOn * smoothstep(.42, 0., dist) * .22 * (.4 + depth);
  vec2 off = dir * push;
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age > 0. && age < 2.2) {
      vec2 rd = ndc - r.xy; rd.x *= uAspect;
      float rl = length(rd);
      float ring = exp(-pow((rl - age * .9) * 7., 2.)) * (1. - age / 2.2) * .09 * r.w;
      off += (rd / max(rl, 1e-4)) * ring;
    }
  }
  off.x /= uAspect;
  ndc += off;
  clip.xy = ndc * clip.w;
  gl_Position = clip;
  gl_PointSize = aSize * uPx * (12. / -mv.z);
  vAlpha = smoothstep(32., 6., -mv.z) * smoothstep(.5, 2.5, -mv.z);
  vMix = aMix;
}`;
const FRAG = /* glsl */`
uniform vec3 uColA, uColB; uniform float uOpacity;
varying float vAlpha, vMix;
void main() {
  vec2 c = gl_PointCoord - .5;
  float r = length(c);
  if (r > .5) discard;
  float soft = smoothstep(.5, .0, r);
  float core = smoothstep(.22, .0, r);
  vec3 col = mix(uColA, uColB, vMix) + core * .25;
  gl_FragColor = vec4(col, (soft * .55 + core * .45) * vAlpha * uOpacity);
}`;

export function initBg(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 60);
  camera.position.z = 10;

  const mobile = !prefs.fine || innerWidth < 768;
  const MAX = 1200;
  let count = mobile ? 600 : MAX;
  const base = new Float32Array(MAX * 3), size = new Float32Array(MAX), seed = new Float32Array(MAX), mix = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) {
    base[i * 3] = (Math.random() - .5) * 34;
    base[i * 3 + 1] = (Math.random() - .5) * 30;
    base[i * 3 + 2] = -12 + Math.random() * 16;
    const big = Math.random() < .06;
    size[i] = big ? 10 + Math.random() * 14 : 2 + Math.random() * 5;
    seed[i] = Math.random(); mix[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aMix', new THREE.BufferAttribute(mix, 1));
  geo.setDrawRange(0, count);

  const uniforms = {
    uTime: { value: 0 }, uScroll: { value: 0 }, uPx: { value: 1 }, uAspect: { value: innerWidth / innerHeight },
    uPointer: { value: new THREE.Vector2(9, 9) }, uPointerOn: { value: 0 },
    uRipples: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) },
    uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uOpacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const target = { a: new THREE.Color(), b: new THREE.Color() };
  const palettes = { null: ['--brand', '--accent'], explainer: ['--brand', '--accent'], insights: ['--accent', '--brand'], members: ['--brand', '--brand-ink'], ledger: ['--accent-ink', '--brand'] };
  let section = null;
  function setColors(snap) {
    const [a, b] = palettes[section] || palettes.null;
    target.a.set(cssVar(a)); target.b.set(cssVar(b));
    if (snap) { uniforms.uColA.value.copy(target.a); uniforms.uColB.value.copy(target.b); }
    const dark = store.get().dark;
    mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    uniforms.uOpacity.value = dark ? .7 : .55;
    mat.needsUpdate = true;
  }
  setColors(true);
  const offTheme = bus.on('theme', () => setColors(true));
  const offSec = bus.on('section', ({ id }) => { section = id; setColors(false); });

  function resize() {
    const dpr = Math.min(devicePixelRatio, mobile ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    uniforms.uAspect.value = camera.aspect; uniforms.uPx.value = dpr;
  }
  resize();
  addEventListener('resize', resize);

  // pointer + touch
  let ri = 0, pointerT = 0;
  const toNdc = e => [(e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1];
  const onMove = e => { const [x, y] = toNdc(e); uniforms.uPointer.value.set(x, y); pointerT = performance.now(); };
  const onDown = e => {
    const [x, y] = toNdc(e);
    uniforms.uRipples.value[ri++ % 4].set(x, y, uniforms.uTime.value, e.pointerType === 'mouse' ? .6 : 1);
    onMove(e);
  };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });

  // loop with adaptive quality
  let raf = 0, last = performance.now(), frames = 0, acc = 0, scrollS = 0, running = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    uniforms.uTime.value += dt;
    scrollS += (store.get().scroll - scrollS) * .08;
    uniforms.uScroll.value = scrollS;
    const p = store.get().scrollP;
    camera.position.z = 10 - p * 3;
    camera.rotation.z = p * .25;
    const active = now - pointerT < 1600 ? 1 : 0;
    uniforms.uPointerOn.value += (active - uniforms.uPointerOn.value) * .06;
    uniforms.uColA.value.lerp(target.a, .03); uniforms.uColB.value.lerp(target.b, .03);
    renderer.render(scene, camera);
    acc += dt; frames++;
    if (frames === 90) {
      if (acc / frames > .02 && count > 300) { count = Math.floor(count / 2); geo.setDrawRange(0, count); }
      frames = 0; acc = 0;
    }
  }
  function start() {
    if (running) return;
    if (prefs.reduced) { renderer.render(scene, camera); return; } // a few still orbs
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }
  const onVis = () => document.hidden ? stop() : start();
  document.addEventListener('visibilitychange', onVis);
  prefs.onChange(() => { stop(); if (prefs.reduced) geo.setDrawRange(0, 160); else geo.setDrawRange(0, count); start(); });
  if (prefs.reduced) geo.setDrawRange(0, 160);
  start();
  document.documentElement.classList.add('has-bg');

  return function destroy() {
    stop(); offTheme(); offSec();
    removeEventListener('resize', resize); removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown);
    document.removeEventListener('visibilitychange', onVis);
    geo.dispose(); mat.dispose(); renderer.dispose();
  };
}
