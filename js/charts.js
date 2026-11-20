// Insights: six interactive 3D chart views with orbit controls, hotspots and fallbacks.
import { $, $$, bus, store, prefs, fmtINR, clamp, easeOut, easeBack, cssVar } from './core.js';

const VIEWS = {
  overview: { title: 'Who paid, every month', desc: 'Each column is one member in one month. Solid columns are paid; the hollow outline is a payment still to come.' },
  monthly: { title: 'Money in, money out', desc: 'Bars above the floor are what came in each month: five full months of ₹2,500, then ₹2,000 in November. The block below the floor is the ₹5,000 UESI sponsorship paid out.' },
  growth: { title: 'The jar, growing', desc: 'The upper line is everything collected, climbing to ₹14,500. The lower line is the balance in the jar, which drops to ₹9,500 after the November sponsorship.' },
  share: { title: 'Who put in what', desc: 'Each slice is one member’s contribution. Hover to lift a slice, click to focus that member across the page.' },
  collection: { title: 'Collection rate', desc: 'Share of the money expected so far that is already in the jar. The glowing gap is the amount outstanding.' },
  heatmap: { title: 'Payment heatmap', desc: 'Months across, members down. Raised tiles are paid; the sunken glowing tile is pending.' },
};
const ORDER = Object.keys(VIEWS);

export async function initCharts({ D, webgl, toast }) {
  const tabs = $$('#tabs [role=tab]'), ind = $('.tabs__ind'), panel = $('#chartPanel');
  const frame = $('#chartFrame'), host = $('#chartCanvas'), skel = $('#chartSkel'), tip = $('#chartTip');
  const titleEl = $('#chartTitle'), descEl = $('#chartDesc'), legendEl = $('#legend'), tableEl = $('#chartTable');
  const activateBtn = $('#chartActivate'), flyBtn = $('#flyBtn'), chip = $('#filterChip');

  // ---- tabs (roving tabindex, arrow keys) ----
  function moveInd(btn) { ind.style.width = btn.offsetWidth + 'px'; ind.style.transform = `translateX(${btn.offsetLeft - 4}px)`; }
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => select(b.dataset.view, true));
    b.addEventListener('keydown', e => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); tabs[j].focus(); select(tabs[j].dataset.view, true); }
    });
  });
  addEventListener('resize', () => moveInd(tabs.find(t => t.getAttribute('aria-selected') === 'true')));

  // ---- text content per view (works with or without WebGL) ----
  function sideFor(view) {
    const v = VIEWS[view];
    titleEl.textContent = v.title; descEl.textContent = v.desc;
    legendEl.innerHTML = '';
    const add = (sw, label, val, member) => {
      const li = document.createElement('li');
      const inner = `<span class="sw ${sw.cls || ''}" style="background:${sw.c || 'transparent'}"></span><span>${label}</span>${val ? `<b>${val}</b>` : ''}`;
      if (member) { li.innerHTML = `<button type="button" aria-pressed="${store.get().filter === member}">${inner}</button>`; li.firstChild.addEventListener('click', () => bus.emit('filter', { id: store.get().filter === member ? null : member })); }
      else li.innerHTML = inner;
      legendEl.append(li);
    };
    if (view === 'monthly') { add({ c: cssVar('--paid') }, 'All five paid', '5 months'); add({ c: cssVar('--accent') }, 'Partly paid', 'Nov'); add({ cls: 'sw--stripe' }, 'Still expected', fmtINR(D.outstanding)); add({ c: cssVar('--accent-ink') }, 'Sponsorship paid out', '−' + fmtINR(D.spent)); }
    else if (view === 'growth') { add({ c: cssVar('--accent') }, 'Collected', fmtINR(D.total)); add({ c: cssVar('--brand-ink') }, 'Balance in jar', fmtINR(D.balance)); add({ c: cssVar('--accent-ink') }, 'Sponsorship', '−' + fmtINR(D.spent)); }
    else if (view === 'collection') { add({ c: cssVar('--brand') }, 'Collected', fmtINR(D.total)); add({ cls: 'sw--stripe' }, 'Outstanding', fmtINR(D.outstanding)); }
    else D.members.forEach(m => add({ c: m.color }, m.name, fmtINR(m.amount), m.id));
    // accessible table
    const rows = D.months.map(mo => `<tr><th scope="row">${mo.name}</th>${D.members.map(m => `<td>${mo.paid.includes(m.id) ? 'Paid' : 'Pending'}</td>`).join('')}<td>${fmtINR(mo.total)}</td><td>${fmtINR(mo.cum)}</td><td>${mo.spent ? '−' + fmtINR(mo.spent) : '—'}</td><td>${fmtINR(mo.balance)}</td></tr>`).join('');
    tableEl.innerHTML = `<table><caption>${v.title}. Contributions of ${fmtINR(D.due)} per member per month.</caption><tr><th>Month</th>${D.members.map(m => `<th>${m.name}</th>`).join('')}<th>Month total</th><th>Collected so far</th><th>Paid out</th><th>Balance</th></tr>${rows}<tr><th>Per member</th>${D.members.map(m => `<td>${fmtINR(m.amount)} in, ${fmtINR(m.sponsored)} sponsored</td>`).join('')}<td colspan="4">${fmtINR(D.total)} collected of ${fmtINR(D.expected)} (${(D.rate * 100).toFixed(1)}%), ${fmtINR(D.spent)} paid out, ${fmtINR(D.balance)} in hand</td></tr></table>`;
    flyBtn.hidden = view !== 'growth' || !three;
  }

  // ---- filter chip ----
  bus.on('filter', ({ id }) => {
    const m = D.members.find(x => x.id === id);
    chip.hidden = !m;
    if (m) {
      chip.innerHTML = `<span>Filtered: ${m.name}</span><button type="button" aria-label="Clear filter">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => bus.emit('filter', { id: null }));
    }
    $$('#legend button').forEach(b => b.setAttribute('aria-pressed', 'false'));
    three?.applyFilter(id);
    sideFor(store.get().view);
  });

  let three = null;
  if (webgl) { try { three = await build3D(); } catch (e) { console.warn('3D charts unavailable', e); } }
  if (!three) fallback2D();
  skel.classList.add('is-gone');

  function select(view, user) {
    if (!VIEWS[view]) view = 'overview';
    tabs.forEach(t => { const on = t.dataset.view === view; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on) { moveInd(t); panel.setAttribute('aria-labelledby', t.id); } });
    store.set({ view });
    sideFor(view);
    if (three) three.show(view);
    if (user) try { history.replaceState(null, '', '#insights-' + view); } catch {}
  }
  select(store.get().view || 'overview', false);
  // live data from the Google Sheet: rebuild the current view with the new numbers
  bus.on('data', d => { D = d; select(store.get().view || 'overview', false); });

  // ---- 2D fallback (no WebGL) ----
  function fallback2D() {
    const fb = $('#chartFallback'); fb.hidden = false;
    const W = 600, H = 320, bw = 56, max = D.due * D.members.length;
    const bars = D.months.map((mo, i) => {
      const h = mo.total / max * 220, x = 40 + i * 92;
      return `<rect x="${x}" y="${260 - h}" width="${bw}" height="${h}" rx="8" fill="${mo.full ? cssVar('--paid') : cssVar('--accent')}"/>
        <text x="${x + bw / 2}" y="${250 - h}" text-anchor="middle" font-size="14" fill="${cssVar('--text')}" font-family="JetBrains Mono, monospace">${fmtINR(mo.total)}</text>
        <text x="${x + bw / 2}" y="288" text-anchor="middle" font-size="14" fill="${cssVar('--text-2')}">${mo.short}</text>`;
    }).join('');
    fb.innerHTML = `<p style="margin:0 0 16px;color:var(--text-2)">3D needs WebGL, which isn’t available here, so this is a flat view of monthly totals.</p><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly totals bar chart">${bars}<line x1="32" x2="580" y1="260" y2="260" stroke="${cssVar('--line')}"/></svg>`;
    $('#snapBtn').hidden = true; $('#resetView').hidden = true;
  }

  // =================== 3D ===================
  async function build3D() {
    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    const { CSS2DRenderer, CSS2DObject } = await import('three/addons/renderers/CSS2DRenderer.js');
    const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
    const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
    const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    host.append(renderer.domElement);
    const labels = new CSS2DRenderer();
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    host.append(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 4 / 3, .1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08; controls.enablePan = false;
    controls.minDistance = 5; controls.maxDistance = 26; controls.maxPolarAngle = Math.PI * .92;
    controls.enabled = false; controls.autoRotateSpeed = .8;
    renderer.domElement.style.touchAction = 'pan-y';

    const hemi = new THREE.HemisphereLight(0xffffff, 0x445048, .9); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(6, 12, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
    sun.shadow.radius = 6; scene.add(sun);
    const rimL = new THREE.DirectionalLight(0xffffff, .6); rimL.position.set(-8, 4, -6); scene.add(rimL);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.ShadowMaterial({ opacity: .18 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.01; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(18, 18, 0x000000, 0x000000); grid.material.transparent = true; grid.material.opacity = .06; scene.add(grid);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .35, .5, .82);
    composer.addPass(bloom); composer.addPass(new OutputPass());
    let useBloom = true;

    function applyTheme() {
      const dark = store.get().dark;
      scene.background = new THREE.Color(cssVar('--bg-2'));
      hemi.intensity = dark ? .7 : 1; floor.material.opacity = dark ? .35 : .16;
      grid.material.color.set(cssVar('--text')); grid.material.opacity = dark ? .08 : .06;
      bloom.strength = dark ? .55 : .25;
    }
    applyTheme();

    function resize() {
      const r = frame.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false); labels.setSize(r.width, r.height); composer.setSize(r.width, r.height);
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(frame); resize();

    // ---- helpers ----
    const label = (text, cls = '', html = false) => { const el = document.createElement('div'); el.className = 'lbl ' + cls; html ? el.innerHTML = text : el.textContent = text; return new CSS2DObject(el); };
    const mat = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: .28, metalness: .05, clearcoat: .6, clearcoatRoughness: .25, ...o });
    const memberColor = i => new THREE.Color(D.members[i].color);
    const nM = D.members.length, nMo = D.months.length;

    // ---- view builders: each returns { group, picks, cam, target, tick(t), filter(id) } ----
    const builders = {
      overview() {
        const group = new THREE.Group(), picks = [], anim = [];
        const gx = i => (i - (nMo - 1) / 2) * 1.35, gz = j => (j - (nM - 1) / 2) * 1.35;
        const geo = new RoundedBoxGeometry(.9, 2, .9, 4, .14);
        D.months.forEach((mo, i) => D.members.forEach((m, j) => {
          const paid = mo.paid.includes(m.id);
          let mesh;
          if (paid) { mesh = new THREE.Mesh(geo, mat(memberColor(j))); mesh.castShadow = true; }
          else {
            mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cssVar('--accent'), transparent: true, opacity: .12, depthWrite: false }));
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: cssVar('--accent-ink') }));
            mesh.add(edges);
          }
          mesh.position.set(gx(i), 1, gz(j));
          mesh.userData = { member: m.id, paid, row: j, tip: `<b>${m.name}</b> · ${mo.name}<br>${paid ? '✅ Paid ' + fmtINR(D.due) : 'Pending ' + fmtINR(D.due)}` };
          group.add(mesh); picks.push(mesh); anim.push({ mesh, delay: (i + j) * .06 });
        }));
        D.months.forEach((mo, i) => { const l = label(mo.short, 'lbl--muted'); l.position.set(gx(i), 0, gz(nM - 1) + 1.1); group.add(l); });
        D.members.forEach((m, j) => { const l = label(m.short, 'lbl--muted'); l.position.set(gx(0) - 1.3, 0, gz(j)); group.add(l); });
        return {
          group, picks, cam: [9.5, 10, 13.5], target: [0, .6, 0],
          tick(t) { anim.forEach(({ mesh, delay }) => { const u = clamp((t - delay) / .7, 0, 1); const s = Math.max(.001, easeBack(u)); mesh.scale.set(1, s, 1); mesh.position.y = s; }); },
          filter(id) { picks.forEach(p => { const on = !id || p.userData.member === id; if (p.userData.paid) { p.material.transparent = !on; p.material.opacity = on ? 1 : .18; p.material.needsUpdate = true; } else p.material.opacity = on ? .12 : .04; }); },
        };
      },
      monthly() {
        const group = new THREE.Group(), picks = [], anim = [];
        const H = 3.6, max = Math.max(D.due * nM, ...D.months.map(m => m.spent));
        const full = D.due * nM / max * H;
        D.months.forEach((mo, i) => {
          const h = mo.total / max * H, x = (i - (nMo - 1) / 2) * 1.7;
          const geo = new RoundedBoxGeometry(1.2, h, 1.2, 4, .16);
          const mesh = new THREE.Mesh(geo, mat(mo.full ? cssVar('--paid') : cssVar('--accent'), { emissive: mo.full ? 0x000000 : new THREE.Color(cssVar('--accent')), emissiveIntensity: .25 }));
          mesh.castShadow = true; mesh.position.set(x, h / 2, 0);
          mesh.userData = { tip: `<b>${mo.name} ${mo.year}</b><br>${fmtINR(mo.total)} · ${mo.paid.length} of ${nM} paid` };
          group.add(mesh); picks.push(mesh); anim.push({ mesh, h, delay: i * .08 });
          if (!mo.full) {
            const g2 = new RoundedBoxGeometry(1.22, full, 1.22, 2, .16);
            const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(g2, 30), new THREE.LineDashedMaterial({ color: cssVar('--accent-ink'), dashSize: .14, gapSize: .1 }));
            ghost.computeLineDistances(); ghost.position.set(x, full / 2, 0); group.add(ghost);
            const lw = label(`${fmtINR(D.due * (nM - mo.paid.length))} expected`, 'lbl--warn'); lw.position.set(x, full + .9, 0); group.add(lw);
          }
          const v = label(fmtINR(mo.total)); v.position.set(x, h + .35, 0); mesh.userData.lbl = v; group.add(v);
          const n = label(mo.short, 'lbl--muted'); n.position.set(x, 0, 1.1); group.add(n);
          if (mo.spent) {
            const d = mo.spent / max * H;
            const out = new THREE.Mesh(new RoundedBoxGeometry(1.2, d, 1.2, 4, .16), mat(cssVar('--accent-ink'), { emissive: new THREE.Color(cssVar('--accent-ink')), emissiveIntensity: .35, transparent: true, opacity: .92 }));
            out.position.set(x, -d / 2, 0);
            out.userData = { tip: `<b>${mo.expenses.map(e => e.title).join(', ')}</b><br>−${fmtINR(mo.spent)} (${fmtINR(mo.expenses[0].perMember)} × ${mo.expenses[0].members.length}) · balance ${fmtINR(mo.balance)}` };
            group.add(out); picks.push(out); anim.push({ mesh: out, h: -d, delay: .7 });
            const ol = label(`−${fmtINR(mo.spent)} sponsorship`, 'lbl--warn'); ol.position.set(x + 1.6, -d / 2, 0); out.userData.lbl = ol; group.add(ol);
          }
        });
        return {
          group, picks, cam: [0, 3.2, 15], target: [0, 0, 0],
          tick(t) { anim.forEach(({ mesh, h, delay }) => { const s = Math.max(.001, easeBack(clamp((t - delay) / .8, 0, 1))); mesh.scale.y = s; mesh.position.y = h * s / 2; if (h > 0) mesh.userData.lbl.position.y = h * s + .35; }); },
        };
      },
      growth() {
        const group = new THREE.Group(), picks = [];
        const H = 4.4, pts = D.months.map((mo, i) => new THREE.Vector3((i - (nMo - 1) / 2) * 1.6, mo.cum / D.total * H + .1, 0));
        const shape = new THREE.Shape();
        shape.moveTo(pts[0].x, 0); pts.forEach(p => shape.lineTo(p.x, p.y)); shape.lineTo(pts.at(-1).x, 0); shape.closePath();
        const area = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .8, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 2 }),
          mat(cssVar('--brand'), { transparent: true, opacity: .55, transmission: 0 }));
        area.position.z = -.4; area.castShadow = true; group.add(area);
        const curve = new THREE.CatmullRomCurve3(pts.map(p => p.clone().add(new THREE.Vector3(0, 0, .42))), false, 'centripetal');
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, .07, 12, false), new THREE.MeshStandardMaterial({ color: cssVar('--accent'), emissive: cssVar('--accent'), emissiveIntensity: .9 }));
        group.add(tube);
        // balance line (after money paid out)
        const bpts = D.months.map((mo, i) => new THREE.Vector3(pts[i].x, mo.balance / D.total * H + .1, .9));
        const bcurve = new THREE.CatmullRomCurve3(bpts, false, 'centripetal');
        const btube = new THREE.Mesh(new THREE.TubeGeometry(bcurve, 120, .06, 12, false), new THREE.MeshStandardMaterial({ color: cssVar('--brand-ink'), emissive: cssVar('--brand-ink'), emissiveIntensity: .5 }));
        group.add(btube);
        D.months.forEach((mo, i) => {
          if (!mo.spent) return;
          const bs = new THREE.Mesh(new THREE.SphereGeometry(.18, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: cssVar('--brand-ink'), emissiveIntensity: .7 }));
          bs.position.copy(bpts[i]); bs.userData = { tip: `<b>Balance, end of ${mo.name}</b><br>${fmtINR(mo.balance)} after −${fmtINR(mo.spent)} sponsorship` };
          group.add(bs); picks.push(bs);
          const bl = label(`Balance ${fmtINR(mo.balance)}`, 'lbl--warn'); bl.position.copy(bpts[i]).add(new THREE.Vector3(0, -.5, 0)); group.add(bl);
        });
        btube.geometry.setDrawRange(0, 0);
        const bcount = btube.geometry.index.count;
        pts.forEach((p, i) => {
          const s = new THREE.Mesh(new THREE.SphereGeometry(.16, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: cssVar('--accent'), emissiveIntensity: .6 }));
          s.position.copy(p).add(new THREE.Vector3(0, 0, .42)); s.userData = { tip: `<b>End of ${D.months[i].name}</b><br>${fmtINR(D.months[i].cum)} collected so far` };
          group.add(s); picks.push(s);
          const l = label(fmtINR(D.months[i].cum)); l.position.copy(s.position).add(new THREE.Vector3(0, .45, 0)); group.add(l);
          const n = label(D.months[i].short, 'lbl--muted'); n.position.set(p.x, 0, 1); group.add(n);
        });
        tube.geometry.setDrawRange(0, 0);
        const count = tube.geometry.index.count;
        return {
          group, picks, cam: [-2, 4, 11], target: [0, 2, 0], curve,
          tick(t) { const u = easeOut(clamp(t / 1.6, 0, 1)), ub = easeOut(clamp((t - .6) / 1.6, 0, 1)); tube.geometry.setDrawRange(0, Math.floor(count * u / 6) * 6); btube.geometry.setDrawRange(0, Math.floor(bcount * ub / 6) * 6); area.scale.y = Math.max(.001, u); },
        };
      },
      share() {
        const group = new THREE.Group(), picks = [], R = 3.2, r = 1.7;
        let a0 = Math.PI / 2;
        const slices = D.members.map((m, i) => {
          const ang = m.amount / D.total * Math.PI * 2, a1 = a0 - ang, gap = .025;
          const s = new THREE.Shape();
          s.absarc(0, 0, R, a0 - gap, a1 + gap, true); s.absarc(0, 0, r, a1 + gap, a0 - gap, false); s.closePath();
          const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: .7, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 3, curveSegments: 48 }), mat(memberColor(i)));
          mesh.rotation.x = -Math.PI / 2; mesh.castShadow = true;
          const mid = (a0 + a1) / 2;
          mesh.userData = { member: m.id, mid, lift: 0, tip: `<b>${m.name}</b><br>${fmtINR(m.amount)} paid in · ${(m.amount / D.total * 100).toFixed(1)}%<br>${fmtINR(m.sponsored)} sponsored · ${fmtINR(m.net)} in jar` };
          const l = label(`${m.short} ${(m.amount / D.total * 100).toFixed(1)}%`); l.position.set(Math.cos(mid) * (R + .9), .4, -Math.sin(mid) * (R + .9)); group.add(l);
          group.add(mesh); picks.push(mesh); a0 = a1;
          return mesh;
        });
        const c = label(`${fmtINR(D.total)}`, 'lbl--big'); c.position.set(0, .4, 0); group.add(c);
        return {
          group, picks, cam: [0, 10.5, 9.5], target: [0, 0, 0], hoverLift: true,
          tick(t, hovered) {
            slices.forEach((s, i) => {
              const grow = easeBack(clamp((t - i * .08) / .7, 0, 1));
              const focus = store.get().filter;
              const want = (hovered === s ? 1 : 0) + (focus === s.userData.member ? .8 : 0);
              s.userData.lift += (want - s.userData.lift) * .15;
              const mid = s.userData.mid, push = s.userData.lift * .35;
              s.position.set(Math.cos(mid) * push, s.userData.lift * .35, -Math.sin(mid) * push);
              s.scale.set(Math.max(.001, grow), Math.max(.001, grow), 1);
            });
          },
          click(obj) { const id = obj.userData.member; bus.emit('filter', { id: store.get().filter === id ? null : id }); },
        };
      },
      collection() {
        const group = new THREE.Group(), picks = [];
        const R = 2.6, tube = .42, arc = D.rate * Math.PI * 2;
        const done = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 32, 200, arc), mat(cssVar('--brand'), { metalness: .2 }));
        done.castShadow = true; done.userData = { tip: `<b>Collected</b><br>${fmtINR(D.total)} · ${(D.rate * 100).toFixed(1)}%` };
        const gapMat = new THREE.MeshStandardMaterial({ color: cssVar('--accent'), emissive: cssVar('--accent'), emissiveIntensity: 1.2, transparent: true, opacity: .9 });
        const rest = new THREE.Mesh(new THREE.TorusGeometry(R, tube * .8, 24, 40, Math.PI * 2 - arc), gapMat);
        rest.rotation.z = arc; rest.userData = { tip: `<b>Outstanding</b><br>${fmtINR(D.outstanding)} · James, ${D.members.find(m => m.missed.length)?.missed.join(', ') || ''}` };
        const ring = new THREE.Group(); ring.add(done, rest); ring.rotation.z = Math.PI / 2; ring.position.y = 3.2;
        group.add(ring); picks.push(done, rest);
        const back = new THREE.Mesh(new THREE.TorusGeometry(R, tube * .3, 12, 200), new THREE.MeshBasicMaterial({ color: cssVar('--text'), transparent: true, opacity: .06 }));
        ring.add(back);
        const big = label(`${(D.rate * 100).toFixed(1)}%`, 'lbl--big'); big.position.set(0, 3.35, 0); group.add(big);
        const sub = label(`of ${fmtINR(D.expected)} collected`, 'lbl--muted'); sub.position.set(0, 2.65, 0); group.add(sub);
        const warn = label(`${fmtINR(D.outstanding)} outstanding`, 'lbl--warn'); group.add(warn);
        const wa = Math.PI / 2 + arc + (Math.PI * 2 - arc) / 2; warn.position.set(Math.cos(wa) * (R + 1.1), 3.2 + Math.sin(wa) * (R + 1.1), 0);
        return {
          group, picks, cam: [0, 3.8, 13.5], target: [0, 3.4, 0],
          tick(t) { const u = easeOut(clamp(t / 1.2, 0, 1)); ring.scale.setScalar(Math.max(.001, u)); ring.rotation.y = (1 - u) * Math.PI; gapMat.emissiveIntensity = 1 + Math.sin(t * 3) * .4; },
        };
      },
      heatmap() {
        const group = new THREE.Group(), picks = [];
        const gx = i => (i - (nMo - 1) / 2) * 1.2, gz = j => (j - (nM - 1) / 2) * 1.2;
        const geo = new RoundedBoxGeometry(1.05, .4, 1.05, 3, .1);
        const anim = [];
        D.months.forEach((mo, i) => D.members.forEach((m, j) => {
          const paid = mo.paid.includes(m.id);
          const c = new THREE.Color(cssVar('--paid')).lerp(new THREE.Color(cssVar('--brand-ink')), i / (nMo - 1) * .5);
          const mesh = new THREE.Mesh(geo, paid ? mat(c) : new THREE.MeshStandardMaterial({ color: cssVar('--accent'), emissive: cssVar('--accent'), emissiveIntensity: .9 }));
          mesh.castShadow = paid; mesh.position.set(gx(i), paid ? .2 : -.05, gz(j));
          mesh.userData = { member: m.id, base: paid ? .2 : -.05, h: paid ? 1 : .35, tip: `<b>${m.name}</b> · ${mo.name}<br>${paid ? '✅ ' + fmtINR(D.due) + ' received' : 'Pending'}` };
          group.add(mesh); picks.push(mesh); anim.push({ mesh, delay: (i * nM + j) * .02 });
        }));
        D.months.forEach((mo, i) => { const l = label(mo.short, 'lbl--muted'); l.position.set(gx(i), 0, gz(nM - 1) + 1); group.add(l); });
        D.members.forEach((m, j) => { const l = label(m.short, 'lbl--muted'); l.position.set(gx(0) - 1.2, 0, gz(j)); group.add(l); });
        return {
          group, picks, cam: [0, 11, 9], target: [0, 0, .4], hoverLift: true,
          tick(t, hovered) {
            anim.forEach(({ mesh, delay }) => {
              const u = easeBack(clamp((t - delay) / .6, 0, 1)), ud = mesh.userData;
              const lift = hovered === mesh ? .35 : 0;
              mesh.scale.y = Math.max(.001, u * ud.h);
              mesh.position.y += ((ud.base * u + lift) - mesh.position.y) * .25;
            });
          },
          filter(id) { picks.forEach(p => { const on = !id || p.userData.member === id; p.material.transparent = true; p.material.opacity = on ? 1 : .2; }); },
        };
      },
    };

    // ---- view lifecycle ----
    let cur = null, curName = null, builtAt = 0, hovered = null;
    function disposeView(v) {
      scene.remove(v.group);
      v.group.traverse(o => {
        if (o.isCSS2DObject) o.element.remove();
        o.geometry?.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose());
      });
    }
    let fovKick = 0;
    function show(name, keepCam) {
      if (cur) disposeView(cur);
      curName = name; cur = builders[name](); scene.add(cur.group);
      builtAt = performance.now() / 1000;
      if (prefs.reduced) builtAt -= 10;
      if (!keepCam) { camera.position.set(...cur.cam); controls.target.set(...cur.target); controls.update(); }
      if (!prefs.reduced) { host.classList.remove('is-swapping'); void host.offsetWidth; host.classList.add('is-swapping'); fovKick = 2; }
      cur.filter?.(store.get().filter);
      hovered = null; tip.hidden = true;
    }
    bus.on('theme', () => { applyTheme(); if (curName) show(curName, true); });

    // ---- interaction: activation, hover, click ----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let lastInput = performance.now(), active = false;
    function setActive(on) {
      active = on; controls.enabled = on; frame.classList.toggle('is-active', on && !prefs.fine);
      renderer.domElement.style.touchAction = on ? 'none' : 'pan-y';
      if (!prefs.fine) { activateBtn.hidden = false; activateBtn.textContent = on ? 'Done' : 'Tap to interact'; }
    }
    if (!prefs.fine) activateBtn.hidden = false;
    activateBtn.addEventListener('click', () => setActive(!active));
    frame.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') setActive(true); });
    frame.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { setActive(false); hovered = null; tip.hidden = true; } });
    bus.on('escape', () => { if (active) setActive(false); });
    function pick(e) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(cur.picks, false)[0];
      return { obj: hit?.object || null, x: e.clientX - r.left, y: e.clientY - r.top };
    }
    renderer.domElement.addEventListener('pointermove', e => {
      lastInput = performance.now(); controls.autoRotate = false;
      if (!cur) return;
      const { obj, x, y } = pick(e);
      hovered = obj;
      if (obj) { tip.innerHTML = obj.userData.tip; tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
      else tip.hidden = true;
      renderer.domElement.style.cursor = obj ? 'pointer' : '';
    });
    let downAt = null;
    renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; lastInput = performance.now(); controls.autoRotate = false; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
      const { obj, x, y } = pick(e);
      if (obj && e.pointerType !== 'mouse') { tip.innerHTML = obj.userData.tip; tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px'; hovered = obj; }
      if (obj && cur.click) cur.click(obj);
      if (prefs.fine && !active) setActive(true);
    });
    controls.addEventListener('start', () => { lastInput = performance.now(); controls.autoRotate = false; });

    // ---- buttons ----
    $('#resetView').addEventListener('click', () => { flying = null; camera.position.set(...cur.cam); controls.target.set(...cur.target); controls.update(); toast('View reset'); });
    $('#snapBtn').addEventListener('click', () => {
      renderFrame(true);
      // composite labels: draw canvas only (labels are HTML); good enough for sharing the 3D view
      const url = renderer.domElement.toDataURL('image/png');
      $('#snapImg').src = url; $('#snapModal').showModal(); toast('Snapshot ready');
    });
    let flying = null;
    flyBtn.addEventListener('click', () => { if (cur?.curve) { flying = { t0: performance.now() / 1000 }; lastInput = performance.now(); } });

    // ---- loop ----
    let visible = false, raf = 0, frames = 0, acc = 0, lastT = performance.now();
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); }, { rootMargin: '100px' }).observe(frame);
    function renderFrame(force) {
      const now = performance.now() / 1000, t = now - builtAt;
      cur?.tick?.(t, hovered);
      if (flying && cur?.curve) {
        const u = clamp((now - flying.t0) / 5, 0, 1), e = (1 - Math.cos(u * Math.PI)) / 2;
        const p = cur.curve.getPointAt(e), look = cur.curve.getPointAt(Math.min(1, e + .08));
        camera.position.set(p.x - 1.2, p.y + 1.3, p.z + 3.4); controls.target.copy(look);
        if (u >= 1) flying = null;
      }
      controls.autoRotate = !prefs.reduced && !flying && performance.now() - lastInput > 4000;
      controls.update();
      fovKick *= .9; camera.fov = 40 + fovKick; camera.updateProjectionMatrix();
      if (useBloom) composer.render(); else renderer.render(scene, camera);
      labels.render(scene, camera);
    }
    function loop(now) {
      if (!visible || document.hidden) { raf = 0; return; }
      raf = requestAnimationFrame(loop);
      const dt = (now - lastT) / 1000; lastT = now;
      renderFrame();
      acc += dt; frames++;
      if (frames === 60) { if (acc / 60 > .022 && useBloom) { useBloom = false; } frames = 0; acc = 0; }
    }
    function start() { if (!raf && !document.hidden) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
    document.addEventListener('visibilitychange', start);

    return { show, applyFilter: id => cur?.filter?.(id) };
  }
}
