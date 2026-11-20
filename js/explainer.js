// Hero: a narrated 3D motion explainer driven by a single timeline clock.
import { $, $$, bus, store, prefs, fmtINR, clamp, easeOut, easeInOut, cssVar } from './core.js';

const CHAPTERS = [
  { id: 's1', title: 'Meet the circle', min: 6 },
  { id: 's2', title: 'Five hands, ₹500 each', min: 7 },
  { id: 's3', title: 'June to October', min: 10 },
  { id: 's4', title: 'November', min: 5 },
  { id: 's5', title: 'What we collected', min: 5.5 },
  { id: 's6', title: 'Giving back', min: 11.5 },
  { id: 's7', title: 'Growing together', min: 9.5 },
];
const FALLBACK_TEXT = {
  s1: 'This is Jubilee Open Hands. Five friends who decided to save together.',
  s2: 'Paulz, MS, Elis, Emma, and James each put in five hundred rupees, every month.',
  s3: 'From June to October, every single member paid. Twenty five hundred rupees, every month.',
  s4: 'In November, four of five payments came in.',
  s5: 'Together, we collected fourteen thousand, five hundred rupees.',
  s6: 'In November, we sponsored the UESI Churachandpur Diamond Jubilee Celebration. One thousand rupees from each of us, five thousand in all.',
  s7: 'That leaves nine thousand, five hundred rupees in our jar. Open hands, growing together. Scroll down to explore our numbers.',
};

export async function initExplainer({ D, webgl, toast }) {
  const player = $('#explainer'), stage = $('#stage');
  // ---- timeline from the voice manifest ----
  let manifest = null;
  try { manifest = await fetch('voice/manifest.json').then(r => r.ok ? r.json() : null); } catch {}
  let t0 = 0;
  const timeline = CHAPTERS.map(c => {
    const v = manifest?.[c.id];
    const dur = Math.max(c.min, v ? v.duration + 1.4 : 0);
    const seg = { ...c, start: t0, dur, text: FALLBACK_TEXT[c.id] || v?.text, voice: v ? { src: v.src, duration: v.duration, delay: .4 } : null };
    t0 += dur; return seg;
  });
  const TOTAL = t0;
  const segAt = t => { for (let i = timeline.length - 1; i >= 0; i--) if (t >= timeline[i].start) return i; return 0; };

  // ---- UI wiring ----
  const playBtn = $('#playBtn'), bigPlay = $('#bigPlay'), scrubInput = $('#scrubInput'), scrubFill = $('#scrubFill');
  const timeLabel = $('#timeLabel'), caption = $('#caption'), chapterLabel = $('#chapterLabel'), jarCount = $('#jarCount');
  const ticks = $('#ticks'), tList = $('#transcriptList');
  timeline.forEach((s, i) => {
    if (i) { const k = document.createElement('i'); k.style.left = (s.start / TOTAL * 100) + '%'; ticks.append(k); }
    const li = document.createElement('li');
    const b = document.createElement('button');
    Object.assign(b.style, { all: 'unset', cursor: 'pointer' });
    b.textContent = s.text; b.addEventListener('click', () => seek(s.start));
    li.append(b); tList.append(li);
  });
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const state = { time: 0, playing: false, speed: 1, cc: true, started: false, scene: -1 };

  // ---- audio ----
  // ONE shared <audio> element plays every clip. Browsers (iPhone especially) only allow sound
  // on an element that was started inside a tap, so we start it inside the Play tap and then
  // only swap its source per scene. Clips are small MP3s, pre-downloaded into memory.
  const voice = new Audio();
  voice.preload = 'auto'; voice.preservesPitch = true; voice.setAttribute('playsinline', '');
  const blobs = new Map();
  timeline.forEach(s => {
    if (!s.voice) return;
    fetch(s.voice.src).then(r => (r.ok ? r.blob() : null)).then(b => { if (b) blobs.set(s.voice.src, URL.createObjectURL(b)); }).catch(() => {});
  });
  const srcFor = clip => blobs.get(clip.src) || clip.src;
  let unlocked = false, activeIdx = -1, curSrc = null;
  const hint = $('#soundHint');
  function setClip(clip) {
    if (curSrc === clip.src) return false;
    voice.src = srcFor(clip); curSrc = clip.src;
    return true;
  }
  // Called inside every user gesture until sound is allowed (Play, the sound prompt, any tap).
  function unlock() {
    if (unlocked) return;
    const first = timeline.find(s => s.voice);
    if (!first) return;
    if (!curSrc) setClip(first.voice);
    voice.muted = true;
    const p = voice.play();
    unlocked = true; hint.hidden = true;
    Promise.resolve(p).then(() => {
      if (activeIdx < 0) voice.pause();
      voice.muted = false;
      syncVoice(true);
    }).catch(() => { voice.muted = false; unlocked = false; });
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(t => addEventListener(t, () => { if (!unlocked) unlock(); }, { capture: true }));
  hint.addEventListener('click', () => { unlock(); syncVoice(true); });
  const pauseAll = () => { if (!voice.paused) voice.pause(); };
  function voiceWindow() {
    const si = segAt(state.time), seg = timeline[si], clip = seg.voice;
    return { si, clip, el: clip && curSrc === clip.src ? voice : null, off: state.time - seg.start - (clip?.delay || 0) };
  }
  function syncVoice(force) {
    const { si, clip, off } = voiceWindow();
    const want = state.playing && store.get().voice && clip && off >= 0 && off < clip.duration;
    if (!want) { pauseAll(); activeIdx = -1; return; }
    if (!unlocked) { hint.hidden = false; return; }
    const fresh = setClip(clip);
    // entering a clip (or seeking) lines it up with the story; otherwise leave it alone
    if (fresh || force || activeIdx !== si) {
      const seekTo = () => { if (Math.abs(voice.currentTime - off) > .15) try { voice.currentTime = off; } catch {} };
      if (voice.readyState >= 1) seekTo(); else voice.addEventListener('loadedmetadata', seekTo, { once: true });
    }
    activeIdx = si;
    voice.playbackRate = state.speed;
    if (voice.paused) voice.play().catch(err => {
      if (err && err.name === 'NotAllowedError') { unlocked = false; hint.hidden = false; }
    });
  }

  const soundBtn = $('#soundBtn');
  function setVoice(on) {
    store.set({ voice: on });
    soundBtn.setAttribute('aria-pressed', on); soundBtn.setAttribute('aria-label', on ? 'Voiceover on' : 'Voiceover off');
    try { localStorage.setItem('joh-voice', on ? '1' : '0'); } catch {}
    if (!on) pauseAll(); else { unlock(); syncVoice(true); }
  }
  try { if (localStorage.getItem('joh-voice') === '0') setVoice(false); } catch {}
  soundBtn.addEventListener('click', () => { const on = !store.get().voice; setVoice(on); toast(on ? 'Voiceover on' : 'Voiceover muted'); });
  bus.on('voice:toggle', () => soundBtn.click());

  function play() {
    if (state.time >= TOTAL - .05) state.time = 0;
    state.playing = true; state.started = true; unlock();
    player.classList.add('is-playing'); playBtn.setAttribute('aria-label', 'Pause');
    if (three) three.controls.enabled = false;
    syncVoice(true); setMedia();
  }
  function pause() {
    state.playing = false; pauseAll(); activeIdx = -1;
    player.classList.remove('is-playing'); playBtn.setAttribute('aria-label', 'Play');
    if (three) three.controls.enabled = true;
    setMedia();
  }
  function toggle() { state.playing ? pause() : play(); }
  function seek(t) { state.time = clamp(t, 0, TOTAL); state.started = true; syncVoice(true); render(true); }
  playBtn.addEventListener('click', toggle);
  bigPlay.addEventListener('click', play);
  $('#watchBtn').addEventListener('click', () => { player.scrollIntoView({ behavior: prefs.reduced ? 'auto' : 'smooth', block: 'center' }); play(); });
  bus.on('player:toggle', toggle);
  scrubInput.addEventListener('input', () => seek(scrubInput.value / 1000 * TOTAL));
  $('#speedSel').addEventListener('change', e => {
    state.speed = +e.target.value;
    voice.playbackRate = state.speed;
    toast(`Speed ${state.speed}×`);
  });

  // ---- mini player: a draggable floating popover ----
  const slot = $('#playerSlot'), ph = $('#playerPh'), handle = $('#playerHandle'), grip = $('#playerGrip');
  let mini = false, pos = null;
  function place() {
    const r = player.getBoundingClientRect();
    pos.x = clamp(pos.x, 8, Math.max(8, innerWidth - r.width - 8));
    pos.y = clamp(pos.y, 8, Math.max(8, innerHeight - r.height - 8));
    player.style.left = pos.x + 'px'; player.style.top = pos.y + 'px';
  }
  function setMini(on) {
    if (on === mini) return;
    if (on) ph.style.minHeight = player.offsetHeight + 'px';
    mini = on;
    player.classList.toggle('is-mini', on); handle.hidden = !on; ph.hidden = !on;
    if (on) {
      if (document.fullscreenElement) document.exitFullscreen?.();
      const w = Math.min(360, innerWidth - 32);
      pos = pos || { x: innerWidth - w - 24, y: innerHeight - 340 };
      place();
      if (!prefs.reduced) player.animate([{ opacity: 0, transform: 'translateY(24px) scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      grip.focus({ preventScroll: true });
      toast('Mini player on. Drag it anywhere');
    } else {
      player.style.left = player.style.top = '';
      if (!prefs.reduced) player.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' });
      $('#miniBtn').focus({ preventScroll: true });
    }
  }
  $('#miniBtn').addEventListener('click', () => setMini(true));
  $('#restoreBtn').addEventListener('click', () => setMini(false));
  $('#restoreBtn2').addEventListener('click', () => setMini(false));
  let drag = null;
  grip.addEventListener('pointerdown', e => {
    if (!mini) return;
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    player.classList.add('is-dragging');
  });
  grip.addEventListener('pointermove', e => { if (!drag) return; pos.x = e.clientX - drag.dx; pos.y = e.clientY - drag.dy; place(); });
  const endDrag = () => { drag = null; player.classList.remove('is-dragging'); };
  grip.addEventListener('pointerup', endDrag); grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('keydown', e => {
    const step = e.shiftKey ? 64 : 24, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!mv || !mini) return;
    e.preventDefault(); pos.x += mv[0]; pos.y += mv[1]; place();
  });
  addEventListener('resize', () => mini && place());
  $('#ccBtn').addEventListener('click', e => {
    state.cc = !state.cc; player.classList.toggle('cc-off', !state.cc);
    e.currentTarget.setAttribute('aria-pressed', state.cc); e.currentTarget.setAttribute('aria-label', state.cc ? 'Captions on' : 'Captions off');
  });
  $('#txBtn').addEventListener('click', e => {
    const tx = $('#transcript'), open = tx.hidden; tx.hidden = !open; e.currentTarget.setAttribute('aria-expanded', open);
  });
  // Fullscreen: the real API where it exists; on iPhone (no element fullscreen) or inside
  // frames that refuse it, the player fills the window instead.
  const fsBtn = $('#fsBtn');
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function setFsUI(on) {
    player.classList.toggle('is-fs', on);
    fsBtn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen'); fsBtn.dataset.tip = on ? 'Exit fullscreen' : 'Fullscreen';
  }
  function windowFs(on) {
    player.classList.toggle('is-pfs', on);
    document.documentElement.classList.toggle('pfs-lock', on);
    setFsUI(on);
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(t => document.addEventListener(t, () => setFsUI(!!fsEl())));
  bus.on('escape', () => { if (player.classList.contains('is-pfs')) windowFs(false); });
  fsBtn.addEventListener('click', async () => {
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); return; }
    if (player.classList.contains('is-pfs')) { windowFs(false); return; }
    if (mini) setMini(false);
    const req = player.requestFullscreen || player.webkitRequestFullscreen;
    try {
      if (!req) throw new Error('no fullscreen');
      await req.call(player, { navigationUI: 'hide' });
      if (!fsEl()) throw new Error('refused');
      screen.orientation?.lock?.('landscape').catch(() => {});
    } catch { windowFs(true); }
  });
  function setMedia() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Jubilee Open Hands — our story', artist: 'Jubilee Open Hands' });
      navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
    } catch {}
  }

  // ---- 3D stage (optional) ----
  let three = null;
  if (webgl) { try { three = await build3D(stage, D, timeline); } catch (e) { console.warn('3D stage unavailable', e); } }
  $('#stageSkel').classList.add('is-gone');
  if (!three) stage.style.background = `radial-gradient(60% 60% at 50% 40%, ${cssVar('--brand')}, ${cssVar('--bg-2')})`;

  // ---- clock ----
  let last = performance.now(), visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);
  function render(force) {
    const t = state.time, si = segAt(t), seg = timeline[si];
    if (si !== state.scene) {
      state.scene = si;
      chapterLabel.textContent = `${String(si + 1).padStart(2, '0')} · ${seg.title}`;
      $$('li', tList).forEach((li, i) => li.classList.toggle('is-now', i === si));
      three?.breath();
      syncVoice(true);
    }
    const local = t - seg.start;
    const capOn = state.started && local >= .3 && local < (seg.voice ? seg.voice.duration + .9 : seg.dur - .4);
    const text = capOn ? seg.text : '';
    if (caption.textContent !== text) caption.textContent = text;
    scrubFill.style.width = (t / TOTAL * 100) + '%';
    scrubInput.value = Math.round(t / TOTAL * 1000);
    scrubInput.setAttribute('aria-valuetext', `${fmtT(t)} of ${fmtT(TOTAL)}, ${seg.title}`);
    timeLabel.textContent = fmtT(t);
    jarCount.textContent = fmtINR(jarAt(D, timeline, state.started ? t : TOTAL) * D.due);
  }
  let idle = 0;
  const stall = { at: -1, for: 0, resync: false };
  ['pointerdown', 'wheel'].forEach(t => stage.addEventListener(t, () => { idle = 0; }, { passive: true }));
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (state.playing) {
      const { si, clip, el, off } = voiceWindow();
      if (el && si === activeIdx && !el.paused && !el.ended) {
        // The voice is the master clock, so it is never seeked mid-sentence. A short buffering
        // pause holds the story; if the audio makes no progress for 0.8s, the story moves on by
        // itself and the voice is lined up again once it recovers.
        if (el.currentTime !== stall.at) { stall.at = el.currentTime; stall.for = 0; } else stall.for += dt;
        if (stall.for < .8) {
          if (stall.resync && Math.abs(el.currentTime - off) > .3) el.currentTime = off;
          stall.resync = false;
          state.time = Math.max(state.time, timeline[si].start + clip.delay + el.currentTime);
        } else { stall.resync = true; state.time += dt * state.speed; }
      } else state.time += dt * state.speed;
      if (state.time >= TOTAL) { state.time = TOTAL; pause(); toast('That’s our story so far'); }
      syncVoice(false);
    }
    idle += dt;
    if (document.hidden) return;
    render();
    if (visible && three) three.draw(state.started ? state.time : timeline[1].start + 2.5, idle, state.playing, dt);
  }
  render(true);
  requestAnimationFrame(loop);
  pause(); player.classList.remove('is-playing');
}

// Coin schedule shared by the 3D stage and the counter.
function coinPlan(D, timeline) {
  const coins = [];
  const s3 = timeline[2], s4 = timeline[3];
  D.months.forEach((mo, mi) => {
    const isLast = mi === D.months.length - 1;
    const seg = isLast ? s4 : s3;
    const slot = isLast ? 0 : mi;
    const span = isLast ? seg.dur * .7 : seg.dur / (D.months.length - .5);
    D.members.forEach((m, k) => {
      if (!mo.paid.includes(m.id)) return;
      const launch = seg.start + .6 + slot * span + k * (isLast ? .35 : span * .14);
      coins.push({ member: k, month: mi, launch, land: launch + .9 });
    });
  });
  return coins;
}
// Coins (₹500 each) that leave the jar for each expense, during the "Giving back" scene.
function outPlan(D, timeline, plan) {
  const s6 = timeline[5], n = Math.round(D.spent / D.due), out = [];
  for (let k = 0; k < n && k < plan.length; k++) {
    const launch = s6.start + 2.2 + k * .38;
    out.push({ idx: plan.length - 1 - k, launch, land: launch + 1.1 });
  }
  return out;
}
function jarAt(D, timeline, t) {
  const plan = coinPlan(D, timeline);
  return plan.filter(c => t >= c.land).length - outPlan(D, timeline, plan).filter(o => t >= o.land).length;
}

async function build3D(stage, D, timeline) {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const { CSS2DRenderer, CSS2DObject } = await import('three/addons/renderers/CSS2DRenderer.js');
  const canvas = $('#stageCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  stage.append(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 16 / 11, .1, 100);
  let baseFov = 42, fovKick = 0;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 5; controls.maxDistance = 16;
  controls.target.set(0, .6, 0); controls.enabled = true;
  canvas.style.touchAction = 'pan-y';

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445048, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 8, 6); scene.add(key);
  const jarLight = new THREE.PointLight(0xffffff, 0, 8); jarLight.position.set(0, .2, 0); scene.add(jarLight);

  // glow sprite texture
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const g = gc.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.3, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(gc);

  // orbs
  const N = D.members.length;
  const arc = i => new THREE.Vector3((i - (N - 1) / 2) * 1.75, 2.0 + Math.cos((i - (N - 1) / 2) * .6) * .35, -.6 - Math.abs(i - (N - 1) / 2) * .35);
  const ring = (i, t) => { const a = i / N * Math.PI * 2 + t * .35; return new THREE.Vector3(Math.cos(a) * 2.7, .9 + Math.sin(t * 1.4 + i) * .12, Math.sin(a) * 2.7); };
  const far = D.members.map((_, i) => new THREE.Vector3((i - 2) * 5, 6 + (i % 2) * 3, -18));
  const orbs = D.members.map((m, i) => {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: m.color, emissive: m.color, emissiveIntensity: .35, roughness: .25, metalness: .1 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.42, 48, 32), mat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: m.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .9 }));
    glow.scale.setScalar(2.2);
    const el = document.createElement('div'); el.className = 'lbl'; el.textContent = m.short;
    const lbl = new CSS2DObject(el); lbl.position.set(0, .8, 0);
    grp.add(mesh, glow, lbl); scene.add(grp);
    return { grp, mesh, mat, glow, el };
  });

  // jar
  const jar = new THREE.Group(); jar.position.set(0, -.9, .6); scene.add(jar);
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .16, roughness: .05, metalness: .0, side: THREE.DoubleSide, depthWrite: false });
  jar.add(new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.05, 2.3, 64, 1, true), glass));
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3, transparent: true, opacity: .7 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, .05, 12, 64), rimMat); rim.rotation.x = Math.PI / 2; rim.position.y = 1.15; jar.add(rim);
  const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, .06, 64), rimMat); baseDisc.position.y = -1.15; jar.add(baseDisc);

  // coins
  const plan = coinPlan(D, timeline);
  const coinGeo = new THREE.CylinderGeometry(.3, .3, .07, 40);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xC9A27E, metalness: .75, roughness: .3, emissive: 0x3a2412, emissiveIntensity: .4 });
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, plan.length); jar.add(coins);
  const stackPos = plan.map((c, i) => { const a = i * 2.39996; const r = .2 + (i % 3) * .22; return new THREE.Vector3(Math.cos(a) * r, -1.08 + i * .062, Math.sin(a) * r); });
  // pending slot (unpaid)
  const ghostCoins = [];
  D.months.forEach((mo, mi) => D.members.forEach((m, k) => { if (!mo.paid.includes(m.id)) ghostCoins.push({ k, mi }); }));
  const ghost = new THREE.Mesh(new THREE.TorusGeometry(.32, .035, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  scene.add(ghost);
  const pendEl = document.createElement('div'); pendEl.className = 'lbl lbl--warn'; pendEl.textContent = 'Nov pending';
  const pendLbl = new CSS2DObject(pendEl); ghost.add(pendLbl); pendLbl.position.set(0, -.55, 0);

  // sponsorship gift (UESI Churachandpur Diamond Jubilee)
  const out = outPlan(D, timeline, plan), outByIdx = new Map(out.map(o => [o.idx, o]));
  const gift = new THREE.Group(); gift.position.set(3.6, -.4, .2); scene.add(gift);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x874844, roughness: .35, metalness: .1, emissive: 0x874844, emissiveIntensity: .25 });
  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xEEF3F3, roughness: .3, metalness: .3, emissive: 0x97B3B6, emissiveIntensity: .3 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 1.3), boxMat); gift.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.45, .22, 1.45), boxMat); lid.position.y = .6; gift.add(lid);
  [[1.47, .26, .18], [.18, .26, 1.47], [1.32, 1.02, .16], [.16, 1.02, 1.32]].forEach(([x, y, z], i) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), ribbonMat); r.position.y = i < 2 ? .6 : 0; gift.add(r);
  });
  const giftGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xB88F7A, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  giftGlow.scale.setScalar(4); gift.add(giftGlow);
  const giftEl = document.createElement('div'); giftEl.className = 'lbl'; giftEl.innerHTML = 'UESI Churachandpur<br>Diamond Jubilee';
  const giftLbl = new CSS2DObject(giftEl); giftLbl.position.set(0, 1.4, 0); gift.add(giftLbl);
  const giftAmtEl = document.createElement('div'); giftAmtEl.className = 'lbl lbl--warn'; giftAmtEl.textContent = '₹0';
  const giftAmt = new CSS2DObject(giftAmtEl); giftAmt.position.set(0, -.85, 0); gift.add(giftAmt);
  const giftLocal = gift.position.clone().sub(jar.position).add(new THREE.Vector3(0, .5, 0));

  // ambient dust
  const dustGeo = new THREE.BufferGeometry(), dn = 260, dp = new Float32Array(dn * 3);
  for (let i = 0; i < dn; i++) { dp[i * 3] = (Math.random() - .5) * 22; dp[i * 3 + 1] = (Math.random() - .5) * 12; dp[i * 3 + 2] = -10 + Math.random() * 12; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = new THREE.PointsMaterial({ size: .08, map: glowTex, transparent: true, depthWrite: false, opacity: .6, color: 0xffffff });
  const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

  function applyTheme() {
    const dark = store.get().dark;
    glass.color.set(dark ? 0xdfe9e8 : 0xffffff); glass.opacity = dark ? .12 : .28;
    rimMat.color.set(cssVar('--brand-ink'));
    dustMat.color.set(cssVar('--brand')); dustMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    ghost.material.color.set(cssVar('--accent-ink'));
    coinMat.color.set(dark ? 0xD9B38C : 0xB88F7A);
  }
  applyTheme(); bus.on('theme', applyTheme);

  function resize() {
    const r = stage.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false); labels.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    // keep the 16:11 framing on taller screens (phones, portrait fullscreen) by widening the view
    const design = 16 / 11, h = Math.tan(21 * Math.PI / 180);
    baseFov = camera.aspect < design ? Math.min(80, 2 * Math.atan(h * design / camera.aspect) * 180 / Math.PI) : 42;
    camera.fov = baseFov; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage); resize();

  const poses = [
    [new THREE.Vector3(0, 2.2, 12.5), new THREE.Vector3(0, .7, 0)],
    [new THREE.Vector3(0, 2.4, 10.5), new THREE.Vector3(0, .6, 0)],
    [new THREE.Vector3(2.8, 3, 9.6), new THREE.Vector3(0, .4, 0)],
    [new THREE.Vector3(-2.6, 2.4, 9.2), new THREE.Vector3(0, .4, 0)],
    [new THREE.Vector3(0, 1.4, 6.6), new THREE.Vector3(0, -.2, .4)],
    [new THREE.Vector3(2.2, 2.2, 9.4), new THREE.Vector3(1.8, -.2, .3)],
    [new THREE.Vector3(0, 5.2, 13), new THREE.Vector3(.6, .2, 0)],
  ];
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  const segAt = t => { for (let i = timeline.length - 1; i >= 0; i--) if (t >= timeline[i].start) return i; return 0; };
  let wasPlaying = false;

  function orbPos(i, t) {
    const s1 = timeline[0], s6 = timeline[6];
    const inP = easeOut(clamp((t - s1.start - .3 - i * .35) / 2.4, 0, 1));
    const p = far[i].clone().lerp(arc(i), inP);
    p.y += Math.sin(t * 1.3 + i) * .08;
    const toRing = easeInOut(clamp((t - s6.start) / 2.2, 0, 1));
    if (toRing > 0) p.lerp(ring(i, t - s6.start), toRing);
    return p;
  }

  function draw(t, idle, playing, dt) {
    const si = segAt(t), seg = timeline[si], local = t - seg.start;
    // orbs
    orbs.forEach((o, i) => {
      o.grp.position.copy(orbPos(i, t));
      const labelOn = t > timeline[1].start + .4 + i * .3;
      o.el.style.opacity = labelOn ? 1 : 0;
      const pend = si >= 3 && ghostCoins.some(g => g.k === i);
      o.mat.emissiveIntensity = pend ? .1 + Math.sin(t * 3) * .05 : .35;
      o.glow.material.opacity = pend ? .35 : .9;
    });
    // coins
    let landed = 0;
    plan.forEach((c, i) => {
      if (t < c.launch) { tmpM.compose(zero, tmpQ.identity(), zero); coins.setMatrixAt(i, tmpM); return; }
      const u = clamp((t - c.launch) / (c.land - c.launch), 0, 1);
      const start = orbPos(c.member, c.launch).sub(jar.position);
      const end = stackPos[i];
      let p;
      if (u < 1) {
        const e = easeInOut(u);
        const ctrl = new THREE.Vector3((start.x + end.x) / 2, Math.max(start.y, 1.6) + 1.2, (start.z + end.z) / 2);
        p = start.clone().multiplyScalar((1 - e) ** 2).add(ctrl.multiplyScalar(2 * (1 - e) * e)).add(end.clone().multiplyScalar(e * e));
        tmpE.set(u * 9, u * 4, 0);
      } else { p = end; landed++; tmpE.set(0, i * .7, 0); }
      const o = outByIdx.get(i);
      if (o && t >= o.launch) {
        const v = clamp((t - o.launch) / (o.land - o.launch), 0, 1);
        if (v >= 1) { tmpM.compose(zero, tmpQ.identity(), zero); coins.setMatrixAt(i, tmpM); return; }
        const e = easeInOut(v);
        const ctrl = new THREE.Vector3((end.x + giftLocal.x) / 2, 2.6, (end.z + giftLocal.z) / 2);
        p = end.clone().multiplyScalar((1 - e) ** 2).add(ctrl.multiplyScalar(2 * (1 - e) * e)).add(giftLocal.clone().multiplyScalar(e * e));
        tmpE.set(v * 8, v * 5, 0);
      }
      tmpQ.setFromEuler(tmpE); tmpM.compose(p, tmpQ, one); coins.setMatrixAt(i, tmpM);
    });
    coins.instanceMatrix.needsUpdate = true;
    // gift appears for "Giving back" and stays
    const gIn = easeOut(clamp((t - timeline[5].start - .3) / 1.2, 0, 1));
    gift.scale.setScalar(Math.max(.001, gIn)); gift.rotation.y = Math.sin(t * .6) * .25;
    giftEl.style.opacity = gIn; giftAmtEl.style.opacity = gIn;
    const given = out.filter(o => t >= o.land).length;
    giftAmtEl.textContent = fmtINR(given * D.due) + ' given';
    const pulse = out.some(o => t >= o.land && t < o.land + .4);
    giftGlow.material.opacity = gIn * (pulse ? .9 : .35);
    lid.position.y = .6 + (pulse ? .12 : 0);
    // pending ghost slot near James in November onwards
    const g0 = ghostCoins[0];
    if (g0) {
      const vis = si >= 3 && si < 6 ? clamp((t - timeline[3].start - 1.5) / .6, 0, 1) : si === 6 ? clamp(1 - (t - timeline[6].start) / 1, 0, 1) : 0;
      ghost.material.opacity = vis * (.6 + Math.sin(t * 4) * .3);
      pendEl.style.opacity = vis;
      ghost.position.copy(orbPos(g0.k, t)).add(new THREE.Vector3(0, -.9, .3));
      ghost.rotation.set(Math.PI / 2 + Math.sin(t) * .2, 0, t * .8);
    }
    // jar glow in scene 5
    const glowAmt = si === 4 ? easeOut(clamp(local / 1.5, 0, 1)) : si >= 5 ? .5 : 0;
    jarLight.intensity = glowAmt * 6; jarLight.color.set(cssVar('--accent'));
    jar.rotation.y = Math.sin(t * .3) * .05;
    dust.rotation.y = idle * .02;
    // camera: driven by the timeline while playing; free orbit when paused
    if (playing) {
      const next = Math.min(si + 1, poses.length - 1);
      const blend = easeInOut(clamp((local - (seg.dur - 1.6)) / 1.6, 0, 1));
      camPos.copy(poses[si][0]).lerp(poses[next][0], blend);
      camTgt.copy(poses[si][1]).lerp(poses[next][1], blend);
      if (si === 6) { camPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), local * .05); }
      camera.position.lerp(camPos, wasPlaying ? .08 : .04);
      controls.target.lerp(camTgt, .08);
      camera.lookAt(controls.target);
    } else {
      if (!wasPlaying && camera.position.lengthSq() === 0) { camera.position.copy(poses[1][0]); controls.target.copy(poses[1][1]); }
      controls.autoRotate = !prefs.reduced && idle > 4; controls.autoRotateSpeed = .5;
      controls.update();
    }
    wasPlaying = playing;
    fovKick *= .92;
    camera.fov = baseFov + fovKick; camera.updateProjectionMatrix();
    renderer.render(scene, camera); labels.render(scene, camera);
    return landed;
  }
  camera.position.copy(poses[1][0]); camera.lookAt(poses[1][1]);

  return {
    controls, draw,
    breath() { if (!prefs.reduced) fovKick = 2; },
  };
}
