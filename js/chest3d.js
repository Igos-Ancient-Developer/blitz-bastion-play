// 3D-открытие сундука (three.js). Если есть models/chest_<вид>.glb с узлами lid/body — берём модель, иначе строим мультяшный сундук сами.
// Сценарий: падение с отскоком → 3 удара (тряска, накал) → вспышка и луч цвета редкости → добыча вылетает по одной (касание — дальше) → итог.
import * as THREE from './vendor/three.module.min.js?v=20261111201705';
import { TOWER_DEFS, RARITIES, BOOSTERS, CHESTS, GRADES } from './data.js?v=20261111201705';
import { cardImg, uiImg } from './sprites.js?v=20261111201705';
import { Sfx } from './audio.js?v=20261111201705';
import { h, esc, fmt, fmtShort, ic, cardHTML, fitCards } from './ui.js?v=20261111201705';

const COL = { common: 0xb8c2cf, magic: 0x3d8bff, legend: 0xffb020, weekly: 0xff2d7a };
const WOOD = { common: 0x9b5f2c, magic: 0x2d4fa8, legend: 0xc77a12, weekly: 0x5a0f2a };
const loadTex = src => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

function toonMat(color, opts = {}) { return new THREE.MeshToonMaterial({ color, gradientMap: TOON, ...opts }); }
const TOON = (() => { const d = new Uint8Array([90, 160, 220, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
function rbox(w, h, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - r * 2) / 2); return g;
}
function outline(mesh, k = 1.04) { const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x14193a, side: THREE.BackSide })); o.scale.setScalar(k); mesh.add(o); }

// Сундук в стиле Supercell: толстые доски, металлические пояса, золотая окантовка, замок с камнем, внутри — гора золота и самоцветов.
const PAL = {
  common: { wood: ['#b9783f', '#8a5126'], band: 0x8f9bb0, trim: 0xe0b44a, gem: 0xff5a5a },
  magic:  { wood: ['#6f4fcf', '#432a94'], band: 0xd6e2ff, trim: 0x7df9ff, gem: 0x4dd2ff },
  legend: { wood: ['#f2a62c', '#c26f0c'], band: 0xffd84a, trim: 0xfff2a8, gem: 0xff3b5c },
  weekly: { wood: ['#a8265e', '#6a1238'], band: 0x30303f, trim: 0xff6aa6, gem: 0xff8ad8 },
};
const outlineMats = {};
const outlineMat = th => outlineMats[th] ??= new THREE.ShaderMaterial({ side: THREE.BackSide,
  vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * ${th.toFixed(4)}, 1.0); }`,
  fragmentShader: 'void main(){ gl_FragColor = vec4(0.078, 0.098, 0.227, 1.0); }' });
function woodTex([c0, c1]) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, i % 2 ? c0 : c1); gr.addColorStop(0.5, i % 2 ? c1 : c0); gr.addColorStop(1, i % 2 ? c0 : c1); g.fillStyle = gr; g.fillRect(i * 64, 0, 64, 256); }
  g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, 0, 256, 8);
  for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(40,18,6,${0.05 + Math.random() * 0.1})`; g.lineWidth = 1 + Math.random() * 1.5; const x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 3, y + 20, x - 3, y + 40, x, y + 30 + Math.random() * 60); g.stroke(); }
  for (let i = 0; i < 3; i++) { const x = 20 + Math.random() * 216, y = 20 + Math.random() * 216; g.strokeStyle = 'rgba(40,18,6,.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 7, 4, 0, 0, 7); g.stroke(); g.beginPath(); g.ellipse(x, y, 3, 2, 0, 0, 7); g.stroke(); }
  g.fillStyle = '#24120a'; for (let i = 0; i < 4; i++) g.fillRect(i * 64 - 1.5, 0, 3, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.7, 0.7); t.anisotropy = 4; return t;
}
function buildChest(kind) {
  const P = PAL[kind] || PAL.common, g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTex(P.wood), roughness: 0.55, metalness: 0.05 });
  const band = new THREE.MeshStandardMaterial({ color: P.band, metalness: 0.75, roughness: 0.32 });
  const trim = new THREE.MeshStandardMaterial({ color: P.trim, metalness: 0.85, roughness: 0.26 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 0.85, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: 0.9 });
  const gemMat = new THREE.MeshStandardMaterial({ color: P.gem, emissive: P.gem, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.1 });
  const add = (parent, geo, mat, x, y, z, ol = 0.016) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ol) m.add(new THREE.Mesh(geo, outlineMat(ol))); parent.add(m); return m; };
  // корпус, цоколь, пояса, окантовка проёма (рамкой — внутри видно золото)
  add(g, rbox(1.7, 0.95, 1.2, 0.09), wood, 0, 0.475, 0, 0.02);
  add(g, rbox(1.78, 0.14, 1.28, 0.05), band, 0, 0.07, 0);
  for (const x of [-0.52, 0.52]) { add(g, rbox(0.2, 0.97, 1.26, 0.04), band, x, 0.485, 0); for (const y of [0.25, 0.55, 0.82]) add(g, new THREE.SphereGeometry(0.036, 10, 8), trim, x, y, 0.645, 0); }
  add(g, rbox(1.82, 0.12, 0.14, 0.04), trim, 0, 0.95, 0.62); add(g, rbox(1.82, 0.12, 0.14, 0.04), trim, 0, 0.95, -0.62);
  add(g, rbox(0.14, 0.12, 1.3, 0.04), trim, 0.86, 0.95, 0); add(g, rbox(0.14, 0.12, 1.3, 0.04), trim, -0.86, 0.95, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05), dark); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.94; g.add(floor);
  // гора золота: купол + монеты + самоцветы
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: 0xc98a12, metalness: 0.8, roughness: 0.4 })); mound.scale.set(0.74, 0.24, 0.46); mound.position.y = 0.93; g.add(mound);
  const cg = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), N = 190, heap = new THREE.InstancedMesh(cg, gold, N), d = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()), x = Math.cos(a) * r * 0.74, z = Math.sin(a) * r * 0.46, k = 1 - (x * x / 0.55 + z * z / 0.21);
    d.position.set(x, 0.95 + Math.max(0, k) * 0.2 + Math.random() * 0.03, z); d.rotation.set((Math.random() - 0.5) * 1.1, Math.random() * 6.3, (Math.random() - 0.5) * 1.1); d.updateMatrix(); heap.setMatrixAt(i, d.matrix);
  }
  g.add(heap);
  for (const [c, x, z] of [[P.gem, 0.3, 0.1], [0x6dff9a, -0.35, 0.18], [0x7ab8ff, 0.05, -0.15], [0xffffff, -0.1, 0.3], [P.gem, -0.5, -0.1], [0xffd23f, 0.52, -0.1]]) {
    const gm = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, roughness: 0.15 })); const k = 1 - (x * x / 0.55 + z * z / 0.21);
    gm.position.set(x, 0.99 + Math.max(0, k) * 0.2, z); gm.rotation.set(Math.random(), Math.random(), 0); g.add(gm);
  }
  // замок на корпусе
  add(g, rbox(0.34, 0.4, 0.12, 0.05), trim, 0, 0.78, 0.66); add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), dark, 0, 0.76, 0.735, 0).rotation.x = Math.PI / 2;
  // крышка с петлёй сзади
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.96, -0.6); g.add(lidPivot);
  add(lidPivot, rbox(1.74, 0.52, 1.24, 0.2), wood, 0, 0.26, 0.6, 0.02);
  for (const x of [-0.52, 0.52]) add(lidPivot, rbox(0.21, 0.55, 1.3, 0.09), band, x, 0.265, 0.6);
  add(lidPivot, rbox(1.82, 0.1, 1.3, 0.04), trim, 0, 0.04, 0.6);
  const gem = add(lidPivot, new THREE.OctahedronGeometry(0.13), gemMat, 0, 0.3, 1.26, 0.012); gem.scale.y = 1.3;
  add(lidPivot, rbox(0.3, 0.2, 0.1, 0.04), trim, 0, 0.14, 1.23);
  // облако света из открытого сундука
  const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gx = gc.getContext('2d'), gg = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gg.addColorStop(0, 'rgba(255,250,225,1)'); gg.addColorStop(0.25, 'rgba(255,226,140,.85)'); gg.addColorStop(0.6, 'rgba(255,190,80,.25)'); gg.addColorStop(1, 'rgba(255,170,60,0)'); gx.fillStyle = gg; gx.fillRect(0, 0, 256, 256);
  const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); inner.position.set(0, 1.15, 0); inner.scale.set(2.2, 1.3, 1); g.add(inner);
  g.scale.setScalar(1.05);
  return { group: g, lidPivot, inner, gem };
}
async function chestModel(kind) { return buildChest(kind); }

// мультяшный контур: копия меша, раздутая по нормалям, видна только изнанкой
const OUTLINE = new THREE.ShaderMaterial({ side: THREE.BackSide,
  vertexShader: 'void main(){ vec3 p = position + normal * 0.012; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: 'void main(){ gl_FragColor = vec4(0.078, 0.098, 0.227, 1.0); }' });
// окружение для бликов: тёмная комната с тёплым и холодным софтбоксами
function makeEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene(); env.background = new THREE.Color(0x2a2f5a);
  const box = (c, x, y, z, sx, sy) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  box(0xfff1d6, 3, 5, 4, 6, 4); box(0x9fb4ff, -5, 2, -3, 4, 6); box(0xffffff, 0, 6, 0, 5, 5); box(0xffc86b, 4, 0, -4, 3, 3);
  const t = pm.fromScene(env, 0.03).texture; pm.dispose(); return t;
}

// Открыть сундук. items — ответ сервера ([{kind, prisms, card?, rarity?, booster?}]). Возвращает Promise, который решается после закрытия.
export function openChest(kind, items, { more = 0 } = {}) {
  return new Promise(async resolve => {
    const root = h(`<div class="chest3d"><canvas></canvas>${lootStrip(kind)}</div>`);
    document.body.appendChild(root);
    const cv = root.querySelector('canvas');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: devicePixelRatio < 1.5, alpha: true }); } catch { root.remove(); return resolve(flatSummary(kind, items)); }
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    const sceneEnv = makeEnv(renderer); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    scene.environment = sceneEnv;
    cam.position.set(0, 2.6, 5.6); cam.lookAt(0, 0.8, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a3a8a, 0.9));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(3, 6, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 1.8); rim.position.set(-3, 3, -4); scene.add(rim);   // контровой свет — силуэт модели
    const glow = new THREE.PointLight(COL[kind], 0, 8); glow.position.set(0, 1.3, 0.6); scene.add(glow);
    // пола-подиума нет: невидимый пол y = 0, мягкая контактная тень под сундуком и тёплое пятно света, которое разгорается при открытии
    const radial = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); };
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,.75)'], [0.45, 'rgba(0,0,0,.35)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,214,120,.55)'], [0.35, 'rgba(255,190,90,.18)'], [1, 'rgba(255,170,60,0)']]), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.001; scene.add(ring);
    // луч света
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.75, 8, 32, 1, true), new THREE.MeshBasicMaterial({ color: COL[kind], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 4.4; scene.add(beam);
    const rayC = document.createElement('canvas'); rayC.width = rayC.height = 512; const rc = rayC.getContext('2d'); rc.translate(256, 256);
    for (let i = 0; i < 16; i++) { rc.rotate(Math.PI / 8); const gr = rc.createLinearGradient(0, 0, 0, -256); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); rc.fillStyle = gr; rc.beginPath(); rc.moveTo(0, 0); rc.lineTo(-22, -256); rc.lineTo(22, -256); rc.fill(); }
    const rays = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rayC), color: COL[kind], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    rays.position.set(0, 1.4, -1.2); scene.add(rays);
    // искры
    const N = 300, pg = new THREE.BufferGeometry(), pp = new Float32Array(N * 3), pv = [];
    for (let i = 0; i < N; i++) pv.push(new THREE.Vector3(), 0);
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const sparks = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff3b0, size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(sparks);
    const P = []; const emit = (n, y, spd, col) => { for (let i = 0; i < n; i++) P.push({ p: new THREE.Vector3((Math.random() - .5) * 0.8, y, (Math.random() - .5) * 0.5), v: new THREE.Vector3((Math.random() - .5) * spd, Math.random() * spd * 1.4, (Math.random() - .5) * spd), life: 1 + Math.random() }); if (col) sparks.material.color.set(col); };

    const chest = await chestModel(kind);
    scene.add(chest.group); chest.group.position.y = 6;

    const fit = () => { const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.fov = w < hh ? 52 : 40; cam.updateProjectionMatrix(); };
    fit(); addEventListener('resize', fit);

    let state = 'drop', t = 0, taps = 0, shake = 0, vy = 0, lidA = 0, done = false;
    const coins = [];
    const coinGeo = new THREE.OctahedronGeometry(0.09); coinGeo.scale(1, 1.35, 1);
    const gemCols = [0xff4fd8, 0x4dd2ff, 0x7dff6a, 0xffd23f].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.1 }));

    function spawnCoins(n) {
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(coinGeo, gemCols[Math.floor(Math.random() * gemCols.length)]); m.position.set((Math.random() - 0.5) * 0.9, 1.1, (Math.random() - 0.5) * 0.4);
        const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
        m.userData = { v: new THREE.Vector3(Math.cos(a) * sp, 3.5 + Math.random() * 3, Math.sin(a) * sp * 0.8 + 1.2), spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 0), rest: false };
        scene.add(m); coins.push(m);
      }
    }
    // Одна награда крупно поверх сундука + две кнопки. Остальное из сундука — маленькими значками без подписей.
    function showPrize() {
      state = 'prize'; root.querySelector('.loot')?.classList.add('hide');
      const main = items.find(x => x.card) || items.find(x => x.booster) || items[0], rest = items.filter(x => x !== main);
      const big = main.card ? cardHTML(main.card, { big: true, grade: main.grade || 0 })
        : main.booster ? `<div class="pbig"><img src="${uiImg(BOOSTERS[main.booster].icon)}" alt=""><b class="tx">${esc(BOOSTERS[main.booster].name)}</b></div>`
        : `<div class="pbig"><img src="${uiImg('ic_prism')}" alt=""><b class="tx">+${fmt(main.prisms || 0)}</b></div>`;
      const chip = x => x.prisms ? `<span class="pchip tx">${ic('ic_prism')}+${fmtShort(x.prisms)}</span>` : x.booster ? `<span class="pchip tx">${ic(BOOSTERS[x.booster].icon)}</span>` : x.card ? `<span class="pchip tx">${ic('ic_cards')}</span>` : '';
      const el = h(`<div class="prize"><div class="pwrap">${big}</div><div class="pchips">${rest.map(chip).join('')}</div>
        <div class="pbtns"><button class="btn green" data-a="take">Забрать</button>${more > 0 ? `<button class="btn blue" data-a="again">Крутить ещё</button>` : ''}</div></div>`);
      root.appendChild(el); fitCards(el);
      const rar = main.card ? main.rarity : null;
      if (rar) { const c = RARITIES[rar].color; beam.material.color.set(c); glow.color.set(c); emit(80, 1.2, 4, c); if (rar === 'legendary' || rar === 'mystic') { shake = 1; Sfx.play('ult'); } }
      Sfx.play('reveal', main.card ? 3 : 2);
      if (main.prisms) spawnCoins(Math.min(24, 6 + main.prisms));
      el.querySelectorAll('button').forEach(b => b.onclick = () => { Sfx.play('click'); finish(b.dataset.a === 'again'); });
    }
    function finish(again = false) { if (done) return; done = true; removeEventListener('resize', fit); renderer.setAnimationLoop(null); renderer.dispose(); root.remove(); resolve({ again }); }

    root.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      Sfx.unlock();
      if (state === 'wait') {
        taps++; shake = 0.5 + taps * 0.2; Sfx.play('chestTap', taps); emit(14 + taps * 8, 1, 2 + taps, null);
        chest.inner.material.opacity = taps * 0.25; glow.intensity = taps * 6;
        if (taps >= 3) { state = 'open'; t = 0; Sfx.play('chestOpen'); shake = 1.2; emit(160, 1, 6, COL[kind]); spawnCoins(26); }
      }
    });

    const clock = new THREE.Clock();
    let acc = 0;
    renderer.setAnimationLoop(() => {
      acc += clock.getDelta(); if (acc < 0.032) return;
      const dt = Math.min(0.05, acc); acc = 0; t += dt;
      ring.material.opacity = state === 'open' || state === 'spin' || state === 'prize' ? Math.min(1, ring.material.opacity + dt * 2) : 0.25 + Math.sin(t * 2) * 0.05;
      shadow.scale.setScalar(Math.max(0.4, 1 - chest.group.position.y * 0.12)); rays.rotation.z -= dt * 0.35; if (state === 'open' || state === 'spin' || state === 'prize') rays.material.opacity = Math.min(0.42, rays.material.opacity + dt * 1.5);
      if (state === 'drop') {
        vy -= 22 * dt; chest.group.position.y += vy * dt;
        if (chest.group.position.y <= 0) { chest.group.position.y = 0; if (Math.abs(vy) > 3) { vy = -vy * 0.35; shake = 0.6; Sfx.play('chestTap', 0); emit(30, 0.1, 2.5, 0xffffff); } else { vy = 0; state = 'wait'; } }
      }
      if (state === 'wait') { const s = 1 + Math.sin(t * 6) * 0.02; chest.group.scale.set(s, 1 / s, s); if (chest.gem) chest.gem.rotation.y += dt * 3; }
      if (state === 'open') {
        lidA = Math.min(1, lidA + dt * 3); chest.lidPivot.rotation.x = -lidA * 1.9 * (1 + Math.sin(lidA * Math.PI) * 0.1);
        beam.material.opacity = Math.min(0.16, t * 0.4); glow.intensity = 4; chest.inner.material.opacity = 0.4;
        if (t > 0.9) { state = 'spin'; spinLoot(root, kind, items).then(showPrize); }
      }
      if (state === 'prize') beam.material.opacity = Math.max(0.06, beam.material.opacity - dt * 0.3);
      // самоцветы: летят, кувыркаясь, отскакивают от пола и ложатся (не крутятся на месте)
      for (const m of coins) {
        const u = m.userData, v = u.v;
        if (u.rest) continue;
        v.y -= 14 * dt; m.position.addScaledVector(v, dt);
        m.rotation.x += u.spin.x * dt; m.rotation.y += u.spin.y * dt;
        const rr = Math.hypot(m.position.x, m.position.z); if (rr > 2.4) { m.position.x *= 2.4 / rr; m.position.z *= 2.4 / rr; v.x *= -0.4; v.z *= -0.4; }
        if (m.position.y <= 0.02) {
          m.position.y = 0.02;
          if (Math.abs(v.y) > 1.6) { v.y = -v.y * 0.35; v.x *= 0.6; v.z *= 0.6; u.spin.multiplyScalar(0.5);  }
          else { u.rest = true; v.set(0, 0, 0); m.rotation.set(0, Math.random() * Math.PI * 2, 0); m.rotation.x = 0.3; }
        }
      }
      // искры
      for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; q.v.y -= 6 * dt; q.p.addScaledVector(q.v, dt); q.life -= dt; if (q.life <= 0) P.splice(i, 1); }
      for (let i = 0; i < N; i++) { const q = P[i]; pp[i * 3] = q ? q.p.x : 0; pp[i * 3 + 1] = q ? q.p.y : -99; pp[i * 3 + 2] = q ? q.p.z : 0; }
      pg.attributes.position.needsUpdate = true;
      if (shake > 0) { shake = Math.max(0, shake - dt * 2.5); chest.group.rotation.z = Math.sin(t * 60) * 0.06 * shake; chest.group.position.x = Math.sin(t * 47) * 0.05 * shake; cam.position.x = Math.sin(t * 53) * 0.06 * shake; } else { chest.group.rotation.z = 0; chest.group.position.x = 0; cam.position.x = 0; }
      renderer.render(scene, cam);
    });
  });
}
// Лента возможных наград (как кейсы в Baalgor/CS2): плитки карт пула с обводкой цвета редкости, монеты и бустеры.
// Пока сундук закрыт — лента медленно бежит; после открытия она раскручивается и останавливается на выпавшем.
function poolTiles(kind) {
  const C = CHESTS[kind]; if (!C) return [];
  const rar = Object.keys(C.cardOdds);
  const cards = Object.entries(TOWER_DEFS).filter(([, d]) => rar.includes(d.rarity)).map(([id, d]) => ({ key: 'card:' + id, html: `<div class="lt r-${d.rarity}"><img src="${cardImg(id)}" alt=""><span>${esc(d.name)}</span></div>`, w: C.cardOdds[d.rarity] }));
  const boosts = Object.entries(BOOSTERS).map(([id, b]) => ({ key: 'boost:' + id, html: `<div class="lt boost"><img src="${uiImg(b.icon)}" alt=""><span>${esc(b.name)}</span></div>`, w: 6 }));
  const coin = { key: 'prisms', html: `<div class="lt coin r-magic"><img src="${uiImg('ic_prism')}" alt=""><span>Самоцветы</span></div>`, w: 40 };
  return [coin, ...boosts, ...cards];
}
function lootStrip(kind) {
  const tiles = poolTiles(kind); if (!tiles.length) return '';
  const row = tiles.map(t => t.html).join('');
  return `<div class="loot"><div class="ltrack"><i class="lmark"></i><div class="lrow idle" style="--n:${tiles.length}">${row}${row}</div></div></div>`;
}
// Раскрутка ленты до выпавшей награды; возвращает Promise после остановки
function spinLoot(root, kind, items) {
  const tiles = poolTiles(kind), track = root.querySelector('.ltrack'), row = root.querySelector('.lrow');
  if (!tiles.length || !row) return Promise.resolve();
  const it = items.find(x => x.card) || items.find(x => x.booster) || items[0];
  const key = it.card ? 'card:' + it.card : it.booster ? 'boost:' + it.booster : 'prisms';
  const target = tiles.find(t => t.key === key) || tiles[0];
  const tot = tiles.reduce((a, t) => a + t.w, 0), pick = () => { let r = Math.random() * tot; for (const t of tiles) if ((r -= t.w) < 0) return t; return tiles[0]; };
  const N = 46, at = 40, seq = Array.from({ length: N }, (_, i) => i === at ? target : pick());
  row.classList.remove('idle'); row.style.animation = 'none'; row.style.transition = 'none'; row.style.transform = 'translateX(0)';
  row.innerHTML = seq.map((t, i) => t.html.replace('class="lt', `class="lt${i === at ? ' win' : ''}`)).join('');
  return new Promise(done => requestAnimationFrame(() => {
    const el = row.children[at], tw = el.offsetWidth, gap = 8, center = track.clientWidth / 2;
    const x = -(at * (tw + gap) + tw / 2 - center) - (Math.random() - 0.5) * tw * 0.6;
    let last = -1; const tick = () => { const m = new DOMMatrix(getComputedStyle(row).transform), i = Math.floor((-m.m41 + center) / (tw + gap)); if (i !== last) { last = i; Sfx.play('click'); } if (row.dataset.spin) requestAnimationFrame(tick); };
    row.dataset.spin = '1';
    row.style.transition = 'transform 3.2s cubic-bezier(.12,.72,.1,1)'; row.style.transform = `translateX(${x}px)`; tick();
    row.addEventListener('transitionend', () => { delete row.dataset.spin; el.classList.add('hit'); Sfx.play('reveal', it.card ? 3 : 1); setTimeout(done, 650); }, { once: true });
  }));
}
function flatSummary() { return undefined; }
