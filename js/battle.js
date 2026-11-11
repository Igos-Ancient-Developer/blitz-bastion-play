// Бой: симуляция, рендер на canvas, касания (добивание, строительство, орбитальный удар).
// Координаты — в клетках: центр клетки (x, y) = (x + 0.5, y + 0.5). Поле 9×14, база ниже последнего ряда.
// Вид 2.5D (как Clash Royale): земля сжата по вертикали в K раз (камера смотрит сверху под углом), всё «стоящее»
// (башни, монстры, деревья, снаряды) рисуется без сжатия в точке проекции своей опоры: экранный y = y·K − высота.
// Анимации: монстры — лист 4×4 (вниз, вверх, вправо/зеркально влево, смерть); башни — 8 направлений (dir8)
// с точками ствола из img/meta.json или 4 кадра атаки (act4). Смерть врага зависит от башни, которая его добила.
import { TOWER_DEFS, ENEMY_DEFS, RARITIES, BATTLE, COMBOS, CARD_LV_MULT, FIELD_UP, GRADES } from './data.js?v=20261111110834';
import { COLS, ROWS, genWaves, pathCells, obstacleCells } from './levels.js?v=20261111110834';
import { towerImg, enemyImg, decorImg, ok, META, img, uiImg, fxImg } from './sprites.js?v=20261111110834';
import { Sfx } from './audio.js?v=20261111110834';

const FIELD_H = ROWS + 1.1;
// мир вокруг поля: лес по бокам, полоса сверху, замок снизу; плато обрывается скалой к воде
const MX = 1.8, MT = 1.6, MB = 3.4;
const WX0 = -MX, WX1 = COLS + MX, WY0 = -MT, WY1 = ROWS + MB;
const K = 0.74;                      // сжатие земли (наклон камеры)
const GATE_Y = ROWS + 2.4;           // дорога уходит в ворота замка
const CLIFF = 1.5, PY0 = WY0 * K - 1.2, PY1 = WY1 * K + CLIFF + 1.2;   // вертикальные границы мира в экранных клетках
const TAU = Math.PI * 2;
// размеры спрайтов снарядов img/fx (× клетка); пока файла нет (не в FX_HAVE) — процедурная заглушка
const FX_S = { rock: 0.42, bomb: 0.46, barrel: 0.5, acid: 0.36, sheep: 0.6, arrow: 0.42, bolt: 0.52, spear: 0.9 };
const ESZ = 1.95, FOOT = 0.16;       // масштаб спрайтов монстров (× size клетки) и смещение ступней от центра дороги
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const DIR8_ANG = [0, 45, 90, 135, 180, 225, 270, 315];
const angDiff = (a, b) => { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

// Силуэты спрайтов заданного цвета (обугливание, электричество, лёд, вспышка попадания)
const tintCache = new Map();
function tinted(im, color) {
  const key = im.src + color;
  let c = tintCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
  }
  return c;
}

// что показывать на поле боя (Настройки → «Бой»): цифры урона, ману за убийство, полоски здоровья, боевые надписи
export const VIEW = { dmg: true, bounty: true, hp: true, words: true };
// у части листов монстр занимает меньше кадра (морж 55 %, ведьма и йети 67 %) — подтягиваем к общим ~77 %
const ENEMY_FIT = { walrus: 1.38, witch: 1.14, yeti: 1.14, scorpion: 1.1, bear: 1.08 };
const TOWER_FIT = {acid: 0.95, ballista: 0.9, basilisk: 1.15, bombard: 0.82, candy: 1.04, catapult: 1.15, crossbow: 1.15, drum: 0.85, fairy: 1.07, grease: 1.15, sheep: 0.85, treant: 0.89};
export class Battle {
  constructor(canvas, { level, deck, skills = {}, onHud, onEnd, onToast }) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.level = level; this.deck = deck; this.sk = skills;
    this.onHud = onHud || (() => {}); this.onEnd = onEnd || (() => {}); this.onToast = onToast || (() => {});
    const s = k => skills[k] || 0;
    this.mod = {
      dmg: 1 + s('atk1') * 0.04, crit: s('atk2') * 0.05, rate: 1 + s('atk3') * 0.05, finish: BATTLE.finishAt + s('atk4') * 0.04, splash: 1 + s('atk5') * 0.08, boss: 1 + s('atk6') * 0.1,
      bounty: 1 + s('eco2') * 0.1, mill: 1 + s('eco3') * 0.1, upDisc: s('eco4'), early: s('eco5'),
      range: 1 + s('def2') * 0.05, eslow: s('def3') * 0.04, slowPow: 1 + s('def4') * 0.1, air: 1 + s('def5') * 0.1, second: s('def6') > 0,
    };
    this.paths = level.paths.map(p => {
      const pts = p.map(([x, y]) => [x + 0.5, y + 0.5]);
      pts.push([pts.at(-1)[0], GATE_Y]);
      const seg = []; let L = 0;
      for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); L += d; }
      return { pts, seg, len: L };
    });
    this.portals = [...new Map(this.paths.map(p => [p.pts[0].join(','), p.pts])).values()];
    this.blocked = pathCells(level);
    // здания ставятся на любую клетку поля, кроме дороги и естественных преград (пруды, валуны, деревья)
    const ob = obstacleCells(level); this.ponds = ob.ponds; this.decor = ob.props; this.mountains = ob.mountains;
    for (const k of ob.blocked) this.blocked.add(k);
    this.waves = genWaves(level);
    this.reset();
    this.ground = null; this.raf = 0; this.lastT = 0;
    this.bindInput();
  }

  reset() {
    this.t = 0; this.speed = 1; this.paused = false; this.over = false;
    this.energy = BATTLE.energyStart + (this.sk.eco1 || 0); this.lives = BATTLE.baseLives + (this.sk.def1 || 0) * 2; this.maxLives = this.lives;
    this.towers = []; this.enemies = []; this.shots = []; this.fx = []; this.texts = []; this.zones = []; this.bolts = []; this.corpses = []; this.candies = []; this.vines = []; this.traps = []; this.units = [];
    this.wave = 0; this.spawnQ = []; this.waveT = BATTLE.firstWave; this.waveActive = false;
    this.score = 0; this.kills = 0; this.finishers = 0; this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.shake = 0; this.slowmo = 0; this.secondUsed = false;
    this.sel = null; this.hover = null; this.active = new Set();
  }

  // ───────── жизненный цикл ─────────
  start() { this.resize(); this.lastT = performance.now(); const loop = now => { this.raf = requestAnimationFrame(loop); if (now - this.lastT < 32 || document.hidden) return; if (this.paused && !this.over && this.pausedDrawn) { this.lastT = now; return; } this.pausedDrawn = this.paused; this.frame(now); }; this.raf = requestAnimationFrame(loop); this.hud(); }
  stop() { cancelAnimationFrame(this.raf); this.unbind?.(); }
  resize() {
    const r = this.cv.parentElement.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.vw = r.width; this.vh = r.height;
    this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px';
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr); this.dpr = dpr;
    // видно ~7.5 клеток в ширину (как в Baalgor), щипком — от 5.5 до всей карты
    // крупно, как в Baalgor: видно ~6 клеток в ширину, щипком — от 4.5 до всей карты
    this.viewMax = Math.max(WX1 - WX0, (PY1 - PY0) * r.width / r.height);
    this.view = Math.min(this.viewMax, Math.max(4.5, this.view || 6.2));
    this.setZoom(this.view);
    if (!this.cam) { this.cam = { x: (COLS - this.vw / this.cell) / 2, y: PY0 }; }
    this.clampCam();
    this.ground = null;
  }
  setZoom(view, fx, fy) {
    const old = this.cell;
    this.view = Math.min(this.viewMax, Math.max(4.5, view));
    this.cell = this.vw / this.view; this.w = this.cell * COLS; this.h = this.cell * FIELD_H;
    if (old && fx != null && this.cam) { const wx = fx / old + this.cam.x, wy = fy / old + this.cam.y; this.cam.x = wx - fx / this.cell; this.cam.y = wy - fy / this.cell; }
    this.ground = null;
  }
  clampCam() {
    const vwC = this.vw / this.cell, vhC = this.vh / this.cell;
    this.cam.x = vwC >= WX1 - WX0 ? (WX0 + WX1 - vwC) / 2 : Math.min(WX1 - vwC, Math.max(WX0, this.cam.x));
    this.cam.y = vhC >= PY1 - PY0 ? (PY0 + PY1 - vhC) / 2 : Math.min(PY1 - vhC, Math.max(PY0, this.cam.y));
  }
  // точка земли (x, y) на высоте z (клеток) → пиксели экрана
  toScreen(x, y, z = 0) { return { x: (x - this.cam.x) * this.cell, y: (y * K - z - this.cam.y) * this.cell }; }
  frame(now) {
    let dt = Math.min(0.05, (now - this.lastT) / 1000); this.lastT = now;
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.3; }
    if (!this.paused && !this.over) for (let i = 0; i < this.speed; i++) this.update(dt);
    else if (this.over) this.updateVisual(dt);
    this.render();
  }

  // ───────── волны ─────────
  callWave(early = false) {
    if (this.wave >= this.waves.length || this.over) return;
    if (early && this.waveT > 0) { const bonus = Math.round(this.waveT * 7); this.score += bonus; this.energy = Math.min(BATTLE.energyMax, this.energy + BATTLE.earlyBonus + this.mod.early); this.floatText(4.5, 1.5, `+${bonus}`, '#7df9ff', 0.5); }
    const w = this.waves[this.wave++];
    let delay = 0;
    for (const g of w.groups) {
      for (let i = 0; i < g.n; i++) this.spawnQ.push({ at: this.t + delay + i * g.gap, kind: g.kind, path: g.path, hpMul: w.hpMul, elite: w.elite || 1 });
      delay += g.n * g.gap * 0.55 + 0.6;
    }
    this.spawnQ.sort((a, b) => a.at - b.at);
    this.waveT = 0; this.waveActive = true;
    Sfx.play('wave');
    this.banner(this.wave === this.waves.length ? 'ПОСЛЕДНЯЯ ВОЛНА!' : `ВОЛНА ${this.wave}`);
    this.hud();
  }
  pickPath(i) {
    const p0 = this.paths[i].pts[0].join(',');
    const same = this.paths.map((p, k) => [p, k]).filter(([p]) => p.pts[0].join(',') === p0);
    return same[Math.floor(Math.random() * same.length)][1];
  }
  spawn(kind, pathI, hpMul, distAt = 0) {
    const d = ENEMY_DEFS[kind], hp = d.hp * hpMul;
    const e = { kind, d, hp, max: hp, path: pathI, dist: distAt, x: 0, y: 0, dx: 0, dy: 1, face: 0, flip: false, turnT: 0,
      slow: 0, slowT: 0, burn: 0, burnT: 0, poison: 0, poisonT: 0, grease: 0, melt: 0, frozen: 0, stun: 0, stop: 0, root: 0, panic: 0, eat: 0, fat: 0,
      frog: false, shrink: 0, anim: Math.random() * 4, flash: 0, hitSq: 0, blinkT: rand(1, 3), phased: false, under: false, burT: rand(1, 2),
      slideT: rand(0, 3), rollT: 0, rollCd: 0, chargeT: rand(2, 4), honkT: rand(3, 5), curseT: rand(3, 6), trailT: 1, bubbleT: 0, fear: 0, spin: 0, healT: 2, sumT: 6, roarT: 7, rage: false, id: Math.random(), last: null };
    this.placeEnemy(e); this.enemies.push(e);
    return e;
  }
  placeEnemy(e) {
    const p = this.paths[e.path]; let d = Math.max(0, e.dist);
    for (let i = 0; i < p.seg.length; i++) {
      if (d <= p.seg[i] || i === p.seg.length - 1) {
        const k = Math.min(1, d / p.seg[i]), a = p.pts[i], b = p.pts[i + 1];
        e.x = a[0] + (b[0] - a[0]) * k; e.y = a[1] + (b[1] - a[1]) * k;
        const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
        if (dx !== e.dx || dy !== e.dy) { e.dx = dx; e.dy = dy; const face = dy > 0 ? 0 : dy < 0 ? 1 : 2; if (face !== e.face || (dx < 0) !== e.flip) e.turnT = 0.14; e.face = face; e.flip = dx < 0; }
        return;
      }
      d -= p.seg[i];
    }
  }
  posAt(path, dist) { const e = { path, dist, x: 0, y: 0, dx: 0, dy: 0 }; this.placeEnemy(e); return e; }

  // ───────── обновление ─────────
  update(dt) {
    this.t += dt;
    // мана — как золото в Baalgor: сама не копится; её дают убийства, ранний вызов волны и башни-добытчики
    let regen = 0;
    for (const t of this.towers) if (t.def.energy) regen += t.def.energy * CARD_LV_MULT[t.lvl] * FIELD_UP[t.flv].mult * this.mod.mill;
    this.energy = Math.min(BATTLE.energyMax, this.energy + regen * dt);
    if (!this.waveActive && this.wave < this.waves.length) { this.waveT -= dt; if (this.waveT <= 0) this.callWave(); }
    while (this.spawnQ.length && this.spawnQ[0].at <= this.t) { const s = this.spawnQ.shift(); { const e = this.spawn(s.kind, this.pickPath(s.path), s.hpMul); e.elite = s.elite; } }
    if (this.waveActive && !this.spawnQ.length) { this.waveActive = false; this.waveT = this.wave < this.waves.length ? BATTLE.waveGap(this.wave) : 0; }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.updateEnemies(dt);
    this.updateCandies(dt);
    this.updateUnits(dt);
    this.updateTowers(dt);
    this.updateShots(dt);
    this.updateZones(dt);
    this.updateVisual(dt);
    if (this.lives <= 0 && !this.over) this.finish(false);
    else if (!this.over && this.wave >= this.waves.length && !this.spawnQ.length && !this.enemies.length) this.finish(true);
    this.hudT = (this.hudT || 0) - dt; if (this.hudT <= 0) { this.hudT = 0.1; this.hud(); }
  }
  updateVisual(dt) {
    for (const f of this.fx) { f.t += dt; if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += (f.grav ?? 9) * dt; if (f.vr) f.rot = (f.rot || 0) + f.vr * dt; } }
    this.fx = this.fx.filter(f => f.t < f.life);
    for (const c of this.corpses) { c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.h += c.vh * dt; c.vh -= (c.grav || 0) * dt; c.rot += c.vr * dt; c.vx *= 1 - dt * (c.drag || 0); }
    for (const c of this.corpses) if (c.chunks) for (const k of c.chunks) {
      if (k.rest) continue;
      k.x += k.vx * dt; k.y += k.vy * dt; k.h += k.vh * dt; k.vh -= 9 * dt; k.rot += k.vr * dt;
      if (k.h <= 0) { k.h = 0; if (Math.abs(k.vh) < 1.2) { k.rest = true; k.vr = 0; } else { k.vh = -k.vh * 0.32; k.vx *= 0.5; k.vy *= 0.5; k.vr *= 0.5; } }
    }
    this.corpses = this.corpses.filter(c => c.t < c.life);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < t.life);
    this.bolts = this.bolts.filter(b => (b.t += dt) < b.life);
    this.vines = this.vines.filter(v => (v.t += dt) < v.life);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      const d = e.d;
      e.flash = Math.max(0, e.flash - dt * 5); e.hitSq = Math.max(0, e.hitSq - dt * 6); e.turnT = Math.max(0, e.turnT - dt);
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.burnT > 0) { e.burnT -= dt; const k = e.grease > 0 ? (this.active.has('roast') || this.active.has('roast2') ? 2.5 : 2) : 1; this.damage(e, e.burn * k * dt, e.burnBy, { dot: 'char' }); }
      if (e.poisonT > 0) { e.poisonT -= dt; this.damage(e, e.poison * dt, e.poisonBy, { dot: 'puff' }); }
      e.grease = Math.max(0, e.grease - dt); e.melt = Math.max(0, e.melt - dt);
      e.frozen = Math.max(0, e.frozen - dt); e.stun = Math.max(0, e.stun - dt); e.stop = Math.max(0, e.stop - dt); e.root = Math.max(0, e.root - dt); e.panic = Math.max(0, e.panic - dt); e.shrink = Math.max(0, e.shrink - dt);
      if (e.hp <= 0) continue;
      if (d.blink) { e.blinkT -= dt; if (e.blinkT <= 0) { e.phased = !e.phased; e.blinkT = e.phased ? 1.1 : rand(2.2, 3.4); } }
      if (d.burrow) { e.burT -= dt; if (e.burT <= 0) { e.under = !e.under; e.burT = e.under ? 1.8 : rand(1.8, 2.6); this.dirt(e.x, e.y); } }
      if (d.heals) { e.healT -= dt; if (e.healT <= 0) { e.healT = 2.2; for (const o of this.enemies) if (o !== e && o.hp > 0 && !o.frog && dist2(o.x, o.y, e.x, e.y) < 2.3) { o.hp = Math.min(o.max, o.hp + d.heals * (e.max / d.hp)); this.fx.push({ kind: 'heal', x: o.x, y: o.y, t: 0, life: 0.6 }); } this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 1.5, t: 0, life: 0.5, c: '#5fd35a' }); } }
      if (d.rage && !e.rage && e.hp < e.max * 0.5) { e.rage = true; this.floatText(e.x, e.y - 1, 'ЯРОСТЬ!', '#ff4d6d', 0.5); }
      if (d.boss && !e.rage && e.hp < e.max * 0.5) { e.rage = true; this.banner(`${d.name} в ярости!`, '#ff4d6d'); this.shake = 0.8; }
      if (d.summon) { e.sumT -= dt; if (e.sumT <= 0) { e.sumT = e.rage ? 4.5 : 7; for (let i = 0; i < (d.summon === 'goblin' ? 3 : 2); i++) this.spawn(d.summon, e.path, e.max / d.hp * 0.08, Math.max(0, e.dist - 0.5 - i * 0.35)); this.floatText(e.x, e.y - 1.4, 'В АТАКУ!', '#ffcf33', 0.5); } }
      if (d.roar) { e.roarT -= dt; if (e.roarT <= 0) { e.roarT = e.rage ? 5.5 : 8; this.roar(e); } }
      if (d.slide) { e.slideT += dt; }
      if (d.charge) { e.chargeT -= dt; if (e.chargeT <= 0) { e.chargeT = 4.5; e.charging = 1; this.floatText(e.x, e.y - 1, 'ТАРАН!', '#ff7043', 0.42); this.dirt(e.x, e.y); } }
      e.charging = Math.max(0, (e.charging || 0) - dt);
      if (d.honk) { e.honkT -= dt; if (e.honkT <= 0) { e.honkT = 5; let hit = 0; for (const t of this.towers) if (dist2(t.x, t.y, e.x, e.y) < 2.25) { t.stunT = 1; hit++; } if (hit) { this.floatText(e.x, e.y - 1, 'ГА-ГА-ГА!', '#fff', 0.45); this.fx.push({ kind: 'ring', x: e.x, y: e.y - 0.4, r: 1.5, t: 0, life: 0.4, c: '#fff' }); Sfx.play('leak'); } } }
      if (d.curse) { e.curseT -= dt; if (e.curseT <= 0) { e.curseT = 6; const t = this.towers.filter(t => t.def.type === 'tower' && dist2(t.x, t.y, e.x, e.y) < 5).sort((a, b) => dist2(a.x, a.y, e.x, e.y) - dist2(b.x, b.y, e.x, e.y))[0]; if (t) { t.curse = 3; this.bolts.push({ a: [e.x, e.y - 0.9], b: [t.x, t.y - 0.6], t: 0, life: 0.35, c: '#b388ff' }); this.floatText(t.x, t.y - 1.2, 'ПРОКЛЯТИЕ!', '#b388ff', 0.4); } } }
      if (d.trail) { e.trailT -= dt; if (e.trailT <= 0) { e.trailT = 0.8; this.zones.push({ kind: 'trail', x: e.x, y: e.y, r: 0.45, t: 0, life: 3.5 }); } }
      if (e.bubbleT > 0) { e.bubbleT -= dt; if (e.bubbleT <= 0) { this.fx.push({ kind: 'ring', x: e.x, y: e.y - 0.6, r: 0.6, t: 0, life: 0.3, c: '#e1bee7' }); this.floatText(e.x, e.y - 0.8, 'ПЛЮХ!', '#e1bee7', 0.45); e.hitSq = 1; this.shake = Math.max(this.shake, 0.15); if (e.bubbleBy) this.damage(e, e.bubbleBy.def.dmg * CARD_LV_MULT[e.bubbleBy.lvl] * 2, e.bubbleBy); } }
      e.spin = Math.max(0, e.spin - dt);
      e.fear = 0; for (const t of this.towers) if (t.def.fear && dist2(t.x, t.y, e.x, e.y) <= t.def.aura ** 2) e.fear = Math.max(e.fear, t.def.fear * (1 + t.flv * 0.3));
      if (d.roll) { e.rollCd = Math.max(0, e.rollCd - dt); e.rollT = Math.max(0, e.rollT - dt); }
      const stopped = e.frozen > 0 || e.stun > 0 || e.root > 0 || e.eat > 0 || e.bubbleT > 0 || (e.stop > 0 && !d.boss);
      if (e.eat > 0) e.eat -= dt;
      let spd = d.spd * (1 - e.slow) * (1 - this.mod.eslow) * (e.rage ? (d.boss ? 1.3 : 1.5) : 1);
      if (e.stop > 0 && d.boss) spd *= 0.4;
      if (e.frog) spd *= 0.5;
      if (e.shrink > 0) spd *= 0.6;
      if (e.fat >= 3) spd *= 0.6;
      if (e.grease > 0) spd *= 0.65;
      if (d.slide && (e.slideT % 3) < 1.4) spd *= 2.4;
      if (e.rollT > 0) spd *= 2.6;
      if (e.charging > 0) spd *= 3;
      if (e.fear) spd *= 1 - e.fear;
      if (!d.trail && this.zones.some(z => z.kind === 'trail' && dist2(z.x, z.y, e.x, e.y) < 0.2)) spd *= 1.3;
      if (stopped) spd = 0;
      if (e.panic > 0) spd = -Math.abs(spd) * 0.9;
      if (e.pull) { e.dist += (e.pull.to - e.dist) * Math.min(1, dt * e.pull.k); e.pull = null; }
      e.dist = Math.max(0, e.dist + spd * dt); e.anim += dt * (stopped ? 0 : 3 + Math.abs(spd) * 4);
      const p = this.paths[e.path];
      if (e.dist >= p.len) { e.hp = 0; e.leaked = true; this.leak(e); continue; }
      this.placeEnemy(e);
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
  }
  roar(e) {
    this.banner('ЛЕДЯНОЙ РЁВ!', '#bdf3ff'); this.shake = 0.6; Sfx.play('ice');
    this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 2.4, t: 0, life: 0.7, c: '#bdf3ff' });
    for (const t of this.towers) if (dist2(t.x, t.y, e.x, e.y) < 2.4 * 2.4) { t.frozen = 2; }
  }
  leak(e) {
    this.lives -= e.d.lives; Sfx.play('leak'); this.shake = Math.max(this.shake, 0.5);
    this.floatText(4.5, ROWS + 0.3, `-${e.d.lives} ❤`, '#ff4d6d', 0.7);
    if (this.lives <= 0 && this.mod.second && !this.secondUsed) { this.secondUsed = true; this.lives = 1; this.banner('ВТОРОЙ ШАНС!'); }
    this.combo = 0;
  }
  dirt(x, y) { for (let i = 0; i < 8; i++) { const a = rand(Math.PI, TAU); this.fx.push({ kind: 'dot', x, y: y + 0.2, vx: Math.cos(a) * 2, vy: Math.sin(a) * 3, t: 0, life: 0.5, c: '#8d6e63', r: 0.07 }); } }

  // Сладости на дороге: монстр останавливается, ест, толстеет; обжора лопается.
  updateCandies(dt) {
    for (const c of this.candies) {
      c.t += dt;
      if (c.k < 1) { c.k = Math.min(1, c.k + dt / 0.5); continue; }       // ещё летит
      for (const e of this.enemies) {
        if (c.bites <= 0) break;
        if (e.hp <= 0 || e.eat > 0 || e.d.flying || e.under || e.frog || e.phased || dist2(e.x, e.y, c.x, c.y) > 0.16) continue;
        if (e.d.boss) { e.slow = Math.max(e.slow, 0.35); e.slowT = 2; c.bites--; continue; }
        if (e.d.glutton) { c.bites = 0; e.hp = Math.min(e.max, e.hp + e.max * 0.15); e.fat++; this.floatText(e.x, e.y - 1, 'ЧАВК!', '#ff7ac8', 0.45); if (e.fat >= 6) { e.last = 'burst'; this.kill(e, 'burst', c.tower); } continue; }
        e.eat = 1.1; e.fat++; c.bites--; e.candyBy = c.tower;
        this.floatText(e.x, e.y - 0.9, e.fat >= 4 ? 'ОБЪЕЛСЯ!' : 'НЯМ!', '#ff7ac8', 0.42);
        if (e.fat >= 5 && !e.d.boss) setTimeout(() => { if (e.hp > 0) { e.last = 'burst'; this.kill(e, 'burst', c.tower); } }, 450);
      }
    }
    this.candies = this.candies.filter(c => c.bites > 0 && c.t < 9);
  }

  nearestPathPoint(x, y) {
    let best = null;
    this.paths.forEach((p, pi) => { for (let d = 0; d <= p.len; d += 0.25) { const q = this.posAt(pi, d); const dd = dist2(q.x, q.y, x, y); if (!best || dd < best.dd) best = { path: pi, dist: d, x: q.x, y: q.y, dd }; } });
    return best && best.dd < 9 ? best : null;
  }
  // Куры и смерчи идут по дороге навстречу врагам; капканы лежат на дороге.
  updateUnits(dt) {
    for (const u of this.units) {
      u.t += dt; u.life -= dt;
      const spd = u.kind === 'tornado' ? 1.7 : 2.4;
      u.dist = Math.max(0, u.dist - spd * dt);
      const q = this.posAt(u.path, u.dist); u.x = q.x; u.y = q.y; u.face = q.dx; u.dyy = q.dy;
      if (u.dist <= 0) u.life = 0;
      if (u.kind === 'chicken') {
        u.cd -= dt;
        const e = this.enemies.find(e => this.targetable(e, false) && dist2(e.x, e.y, u.x, u.y) < 0.2);
        if (e && u.cd <= 0) { u.cd = 0.3; u.pecks--; u.peck = 0.15; this.damage(e, u.dmg * (e.eat > 0 && this.active.has('henhouse') ? 3 : 1), u.tower); e.hitSq = 0.6; this.fx.push({ kind: 'feather', x: u.x, y: u.y - 0.3, vx: rand(-1.5, 1.5), vy: -2, grav: 3, t: 0, life: 0.6, rot: 0, vr: rand(-6, 6) }); if (u.pecks <= 0) u.life = 0; }
        u.peck = Math.max(0, (u.peck || 0) - dt);
      } else {
        for (const e of this.enemies) if (this.targetable(e, true) && !e.d.boss && dist2(e.x, e.y, u.x, u.y) < 0.36) {
          e.dist = Math.max(0, e.dist - u.push * dt); e.spin = 0.3; this.damage(e, u.dmg * dt, u.tower, { dot: 'launch' });
          if (this.active.has('firestorm')) { e.burn = Math.max(e.burn, 8); e.burnT = 2; e.burnBy = u.tower; }
        }
      }
    }
    this.units = this.units.filter(u => u.life > 0);
    for (const tr of this.traps) {
      tr.t += dt; if (tr.k < 1) { tr.k = Math.min(1, tr.k + dt / 0.45); continue; }
      if (!tr.open) continue;
      const r = this.active.has('scare') ? 0.3 : 0.18;
      const e = this.enemies.find(e => this.targetable(e, false) && dist2(e.x, e.y, tr.x, tr.y) < r * (e.fear ? 2 : 1));
      if (e) { tr.open = false; tr.snap = 0; e.root = e.d.boss ? 0.6 : tr.tower.def.trapT; this.damage(e, tr.dmg, tr.tower); e.hitSq = 1; this.floatText(e.x, e.y - 0.9, 'ХРЯСЬ!', '#ffdd33', 0.5); Sfx.play('hit'); this.shake = Math.max(this.shake, 0.15); }
    }
    for (const tr of this.traps) if (!tr.open) tr.snap += dt;
    this.traps = this.traps.filter(tr => tr.t < 14 && (tr.open || tr.snap < 1.5));
  }

  // эффективные характеристики башни
  stat(t) {
    const d = t.def, m = CARD_LV_MULT[t.lvl] * FIELD_UP[t.flv].mult * (t.gm || 1);
    let haste = 0;
    for (const b of this.towers) if (b.def.haste && b !== t && dist2(b.x, b.y, t.x, t.y) <= (b.def.aura * (1 + b.flv * 0.15)) ** 2) haste = Math.max(haste, b.def.haste * (1 + b.flv * 0.25));
    if (t.id === 'crossbow' && this.active.has('rapid')) haste += 0.25;
    if (t.id === 'sheep' && this.active.has('woolfarm')) haste += 0.3;
    return { dmg: d.dmg * m * this.mod.dmg, rate: d.rate * (1 + haste) * this.mod.rate * (t.curse > 0 ? 0.5 : 1), range: d.range * this.mod.range * (1 + t.flv * 0.08) };
  }
  targetable(e, air) { return e.hp > 0 && !e.phased && !e.under && (air || !e.d.flying); }
  inRange(t, range, air = true) { const r2 = range * range; return this.enemies.filter(e => this.targetable(e, air) && dist2(e.x, e.y, t.x, t.y) <= r2); }
  first(list) { let b = null; for (const e of list) if (!b || e.dist / this.paths[e.path].len > b.dist / this.paths[b.path].len) b = e; return b; }

  // ── вид башни: кадр направления и точка ствола ──
  towerMeta(t) { return META['tower_' + t.id] || null; }
  // dirpose: ряды — направления правой половины (S, SE, E, NE, N), левая половина — зеркально; колонки — позы
  dirPose(t) {
    const m = t.meta, a = ((t.face * 180 / Math.PI) % 360 + 360) % 360;
    let best = 0, bd = 1e9, mirror = false;
    m.dirs.forEach((d, i) => { for (const [ang, mir] of [[d, false], [(540 - d) % 360, true]]) { let x = Math.abs(ang - a) % 360; x = x > 180 ? 360 - x : x; if (x < bd - 0.01) { bd = x; best = i; mirror = mir; } } });
    const pose = t.fireT > 0 ? 2 : t.windup ? 1 : 0;
    return { row: best, col: pose, mirror };
  }
  dirFrame(t) {
    const m = t.meta, a = ((t.face * 180 / Math.PI) % 360 + 360) % 360;
    const dirs = m?.dirs || DIR8_ANG;
    let best = 0, bd = 1e9;
    dirs.forEach((d, i) => { if (d == null) return; let x = Math.abs(d - a) % 360; x = x > 180 ? 360 - x : x; if (x < bd) { bd = x; best = i; } });
    return best;
  }
  // видимая часть спрайтов разная (бомбарда во весь кадр, гряземёт узкий) — выравниваем, чтобы все башни были примерно одного размера
  spriteSize(t) { return this.cell * (2.3 + t.flv * 0.08) * (TOWER_FIT[t.id] || 1); }
  // точка ствола в координатах земли: считаем на экране (основание на фундаменте) и переводим обратно делением на K
  muzzle(t) {
    const S = this.spriteSize(t) / this.cell, bx = t.x, by = t.y * K + 0.15;
    const out = (mx, my) => [mx, my / K];
    if (t.meta?.kind === 'dirpose') {
      const { row, col, mirror } = this.dirPose(t), mz = t.meta.muzzle?.[row * t.meta.cols + col];
      if (mz) { const fx = mirror ? 1 - mz[0] : mz[0]; return out(bx - S / 2 + fx * S, by - S + mz[1] * S); }
      return out(bx + Math.cos(t.face) * 0.35, by - S * 0.55 + Math.sin(t.face) * 0.25);
    }
    if (t.meta?.kind === 'dir8') {
      const i = this.dirFrame(t), mz = t.meta.muzzle?.[i];
      if (mz) return out(bx - S / 2 + mz[0] * S, by - S + mz[1] * S);
      return out(bx + Math.cos(t.face) * 0.35, by - S * 0.55 + Math.sin(t.face) * 0.25);
    }
    const mz = t.meta?.muzzle?.[3];
    if (mz) return out(bx - S / 2 + mz[0] * S, by - S + mz[1] * S);
    return out(bx, by - S * 0.75);
  }

  updateTowers(dt) {
    for (const t of this.towers) {
      t.recoil = Math.max(0, t.recoil - dt * 5); t.pop = Math.max(0, t.pop - dt * 3); t.anim = (t.anim || 0) + dt;
      t.fireT = Math.max(0, (t.fireT || 0) - dt);
      if (t.frozen > 0) { t.frozen -= dt; continue; }
      if (t.stunT > 0) { t.stunT -= dt; continue; }
      t.curse = Math.max(0, (t.curse || 0) - dt);
      const d = t.def;
      if (d.type === 'building') continue;
      const s = this.stat(t);
      t.cd -= dt;
      const targets = this.inRange(t, s.range, d.air);
      if (d.minRange) for (let i = targets.length - 1; i >= 0; i--) if (dist2(targets[i].x, targets[i].y, t.x, t.y) < d.minRange ** 2) targets.splice(i, 1);
      const tg = this.first(targets);
      // поворот к цели (для башен с 8 направлениями — плавно, стреляет, когда довернула)
      if (tg) t.aim = Math.atan2((tg.y - t.y) * K, tg.x - t.x);   // угол на экране — по нему кадр направления
      const turns = t.meta?.kind === 'dir8' || t.meta?.kind === 'dirpose';
      if (turns || d.proj === 'flame') {
        let diff = ((t.aim - t.face + Math.PI * 3) % TAU) - Math.PI;
        t.face += Math.sign(diff) * Math.min(Math.abs(diff), dt * 7);
      }
      const aligned = !turns || angDiff(t.face, t.aim) < 0.45;
      if (d.proj === 'dragon') { this.updateDragon(t, s, dt, targets); continue; }
      if (d.proj === 'flame') { this.updateFlame(t, s, d, tg, targets, aligned); continue; }
      t.windup = !!tg && t.cd > 0 && t.cd <= 0.35;          // кадр замаха перед выстрелом (рычаг взведён, тетива натянута)
      if (t.cd > 0 || !tg) continue;
      if (!aligned) { t.windup = true; continue; }
      t.windup = false; t.cd = 1 / s.rate; t.recoil = 1; t.fireT = 0.26;
      this.fire(t, s, d, tg, targets);
      const mir = this.towers.find(m => m.def.echo && dist2(m.x, m.y, t.x, t.y) <= m.def.aura ** 2);
      if (mir && d.proj !== 'time' && (Math.random() < mir.def.echo + mir.flv * 0.15 || (t.id === 'sheep' && this.active.has('mirrorsheep')))) {
        mir.pop = 0.6; setTimeout(() => { if (!this.over && this.towers.includes(t)) { const tg2 = tg.hp > 0 ? tg : this.first(this.inRange(t, s.range, d.air)); if (tg2) { this.fire(t, s, d, tg2, this.inRange(t, s.range, d.air)); this.fx.push({ kind: 'ring', x: t.x, y: t.y - 0.5, r: 0.5, t: 0, life: 0.3, c: '#ff8ad8' }); } } }, 180 / this.speed);
      }
    }
  }
  fire(t, s, d, tg, targets) {
    const [mx, my] = this.muzzle(t);
    this.fx.push({ kind: 'flash', x: mx, y: my, t: 0, life: 0.12, c: d.proj === 'ice' ? '#bdf3ff' : d.proj === 'acid' ? '#9cff57' : '#fff3b0' });
    switch (d.proj) {
      case 'zap': {
        let jumps = d.chain + (this.active.has('supercond') ? 2 : 0), cur = tg, hit = new Set(), from = [mx, my];
        while (cur && jumps-- > 0) {
          hit.add(cur); this.bolts.push({ a: from, b: [cur.x, cur.y - 0.3], t: 0, life: 0.2, c: '#b9a7ff' });
          let dmg = s.dmg; if (cur.frog && this.active.has('froggy')) dmg *= 3;
          this.damage(cur, dmg, t); cur.zapT = 0.35;
          if (cur.grease > 0 && this.active.has('greasefire')) { cur.burn = Math.max(cur.burn, 8); cur.burnT = 3; cur.burnBy = t; }
          from = [cur.x, cur.y - 0.3];
          cur = this.enemies.filter(e => this.targetable(e, true) && !hit.has(e) && dist2(e.x, e.y, cur.x, cur.y) < (this.active.has('supercond') && cur.slow > 0 ? 3.2 : 2.2)).sort((a, b) => dist2(a.x, a.y, cur.x, cur.y) - dist2(b.x, b.y, cur.x, cur.y))[0];
        }
        Sfx.play('zap'); break;
      }
      case 'roots': {
        const pool = targets.filter(e => !e.d.flying).sort((a, b) => b.dist - a.dist).slice(0, d.roots);
        for (const e of pool) { e.root = d.rootT; this.damage(e, s.dmg, t); this.vines.push({ e, x: e.x, y: e.y, t: 0, life: d.rootT }); e.hitSq = 1; }
        this.shake = Math.max(this.shake, 0.2); Sfx.play('place'); break;
      }
      case 'time': {
        for (const e of targets) e.stop = Math.max(e.stop, d.stopT);
        this.zones.push({ kind: 'time', x: t.x, y: t.y, r: s.range, t: 0, life: 0.9 });
        this.floatText(t.x, t.y - 1.6, 'БОМ!', '#7df9ff', 0.5); Sfx.play('ice'); break;
      }
      case 'poly': {
        const pool = targets.filter(e => !e.frog).sort((a, b) => b.hp - a.hp);
        const e = pool[0]; if (!e) break;
        this.bolts.push({ a: [mx, my], b: [e.x, e.y - 0.3], t: 0, life: 0.3, c: '#ffb3e6', sparkle: true });
        if (e.d.boss) { e.shrink = 3; this.floatText(e.x, e.y - 1.2, 'УМЕНЬШЕН!', '#ffb3e6', 0.5); }
        else { e.frog = true; this.floatText(e.x, e.y - 0.9, 'КВА!', '#5fd35a', 0.55); }
        this.burst(e.x, e.y - 0.3, '#ffb3e6', 16, 4); this.fx.push({ kind: 'smoke', x: e.x, y: e.y - 0.3, t: 0, life: 0.5, big: true });
        Sfx.play('upgrade'); break;
      }
      case 'bees': {
        const pool = [...targets].sort(() => Math.random() - 0.5);
        for (let i = 0; i < d.swarm; i++) this.shots.push({ kind: 'bee', x: mx + rand(-0.2, 0.2), y: my + rand(-0.2, 0.2), tg: pool[i % pool.length], spd: 4.5, dmg: s.dmg, tower: t, vx: rand(-3, 3), vy: rand(-3, 0), life: 3, wob: rand(0, 6) });
        Sfx.play('hit'); break;
      }
      case 'chicken': {
        const near = this.nearestPathPoint(t.x, t.y);
        if (near) for (let i = 0; i < 2 + t.flv; i++) this.units.push({ kind: 'chicken', path: near.path, dist: near.dist - i * 0.25, life: 4.5, pecks: 4, cd: 0, dmg: s.dmg, tower: t, x: near.x, y: near.y, t: 0 });
        this.floatText(t.x, t.y - 1.3, 'КО-КО!', '#fff', 0.42); Sfx.play('click'); break;
      }
      case 'bubble': {
        this.shots.push({ kind: 'bubble', x: mx, y: my, tg, spd: 4, dmg: 0, tower: t, life: 3, vx: 0, vy: 0 });
        Sfx.play('ice'); break;
      }
      case 'trap': {
        const at = Math.min(this.paths[tg.path].len - 0.5, tg.dist + 1 + Math.random() * 0.5), p = this.posAt(tg.path, at);
        this.traps.push({ x: p.x, y: p.y, sx: mx, sy: my, k: 0, t: 0, tower: t, dmg: s.dmg, open: true });
        Sfx.play('click'); break;
      }
      case 'tornado': {
        const p = this.posAt(tg.path, Math.min(this.paths[tg.path].len, tg.dist + 0.8));
        this.units.push({ kind: 'tornado', path: tg.path, dist: p.dist ?? tg.dist + 0.8, life: 2.6, dmg: s.dmg, tower: t, x: p.x, y: p.y, t: 0, push: t.def.push });
        Sfx.play('flame'); this.floatText(t.x, t.y - 1.3, 'ВЖУХ!', '#b3e5fc', 0.45); break;
      }
      case 'candy': {
        // кидает конфету на дорогу перед первым врагом
        const e = tg, at = Math.min(this.paths[e.path].len - 0.5, e.dist + 0.9 + Math.random() * 0.4), p = this.posAt(e.path, at);
        this.candies.push({ x: p.x, y: p.y, sx: mx, sy: my, k: 0, t: 0, bites: 2 + t.flv, tower: t, kind: Math.floor(Math.random() * 4) });
        Sfx.play('click'); break;
      }
      case 'rock': case 'bomb': case 'barrel': case 'acid': case 'sheep': {
        const lead = tg.d.spd * (1 - tg.slow) * (d.proj === 'bomb' ? 1.1 : 0.6);
        const p = this.posAt(tg.path, Math.min(this.paths[tg.path].len, tg.dist + lead));
        const dur = { rock: 0.65, bomb: 1.1, barrel: 0.6, acid: 0.55, sheep: 0.9 }[d.proj];
        this.shots.push({ kind: d.proj, x: mx, y: my, sx: mx, sy: my, ex: p.x, ey: p.y, k: 0, dur, dmg: s.dmg, splash: d.splash, tower: t, rot: 0 });
        Sfx.play(d.proj === 'bomb' ? 'boom' : 'shot', 0.4); if (d.proj === 'sheep') this.floatText(mx, my - 0.3, 'БЭЭ!', '#fff', 0.4); break;
      }
      case 'bolt': case 'spear': {      // прямой прошивающий выстрел
        const a = Math.atan2(tg.y - 0.25 - my, tg.x - mx), spd = d.proj === 'spear' ? 16 : 13;
        this.shots.push({ kind: d.proj, x: mx, y: my, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg: s.dmg, tower: t, hit: new Set(), left: d.pierce, life: (s.range + 1.5) / spd, line: true });
        Sfx.play('shot'); break;
      }
      default: {   // arrow, ice
        const n = d.proj === 'arrow' && this.active.has('volley') ? 2 : 1;
        for (let i = 0; i < n; i++) this.shots.push({ kind: d.proj, x: mx + i * 0.1, y: my, tg: i ? (targets[1] || tg) : tg, spd: d.proj === 'arrow' ? 14 : 9, dmg: s.dmg, tower: t, life: 2.5, vx: 0, vy: 0 });
        Sfx.play(d.proj === 'ice' ? 'ice' : 'shot');
      }
    }
  }
  updateFlame(t, s, d, tg, targets, aligned) {
    t.flameOn = !!tg && aligned;
    if (!t.flameOn || t.cd > 0) return;
    t.cd = 1 / s.rate; t.fireT = 0.15;
    const [mx, my] = this.muzzle(t);
    for (const e of targets) {
      const a = Math.atan2((e.y - t.y) * K, e.x - t.x);
      if (angDiff(a, t.face) < 0.55) { this.damage(e, s.dmg, t); e.burn = Math.max(e.burn, d.burn * CARD_LV_MULT[t.lvl]); e.burnT = 3; e.burnBy = t; }
    }
    Sfx.play('flame');
    for (let i = 0; i < 3; i++) { const a = t.face + rand(-0.4, 0.4), v = rand(3.5, 5.5); this.fx.push({ kind: 'flame', x: mx, y: my, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: -1, t: 0, life: s.range / v }); }
  }
  updateDragon(t, s, dt, targets) {
    t.orb = (t.orb || 0) + dt * 1.6;
    const R = s.range * 0.65, dx = t.x + Math.cos(t.orb) * R, dy = t.y + Math.sin(t.orb) * R * 0.7;
    t.drag = [dx, dy];
    t.breath = (t.breath || 0) - dt;
    const under = this.enemies.filter(e => this.targetable(e, true) && dist2(e.x, e.y, dx, dy) < 0.9);
    t.flameOn = under.length > 0 || targets.length > 0;
    if (t.breath <= 0 && t.flameOn) {
      t.breath = 0.1; t.fireT = 0.15;   // кадр атаки логова, пока дракон дышит огнём
      for (const e of under) { this.damage(e, s.dmg * 0.1, t); e.burn = Math.max(e.burn, t.def.burn); e.burnT = 3; e.burnBy = t; }
      for (let i = 0; i < 2; i++) this.fx.push({ kind: 'flame', x: dx, y: dy - 0.9, vx: rand(-0.8, 0.8), vy: rand(2.5, 4), grav: 0, t: 0, life: 0.3 });
      if (Math.random() < 0.3) Sfx.play('flame');
    }
  }

  updateShots(dt) {
    for (const s of this.shots) {
      if (s.k !== undefined) {           // навесные: камень, бомба, бочка, кислота, овца
        s.k += dt / s.dur; s.x = s.sx + (s.ex - s.sx) * s.k; s.y = s.sy + (s.ey - s.sy) * s.k; s.rot += dt * 8;
        if (s.k >= 1) { s.done = true; this.explode(s.ex, s.ey, s); }
        continue;
      }
      s.life -= dt;
      if (s.line) {                      // болт / копьё: летит прямо, прошивает
        s.x += s.vx * dt; s.y += s.vy * dt;
        for (const e of this.enemies) {
          if (s.left <= 0) break;
          if (!this.targetable(e, true) || s.hit.has(e) || dist2(e.x, e.y - 0.25, s.x, s.y) > 0.16) continue;
          s.hit.add(e); s.left--;
          this.hitWith(e, s);
          if (s.tower.def.knock && !e.d.boss) { e.dist = Math.max(0, e.dist - s.tower.def.knock); e.hitSq = 1; }
        }
        if (s.left <= 0 || s.life <= 0 || s.x < -1 || s.x > COLS + 1 || s.y < -1 || s.y > FIELD_H + 1) s.done = true;
        continue;
      }
      const tg = s.tg && s.tg.hp > 0 && !s.tg.under ? s.tg : null;
      if (tg) { s.tx = tg.x; s.ty = tg.y - 0.3; }
      if (s.tx === undefined) { s.done = true; continue; }
      const dx = s.tx - s.x, dy = s.ty - s.y, L = Math.hypot(dx, dy);
      if (s.kind === 'bubble') { if (!e.d.boss) { e.bubbleT = s.tower.def.liftT; e.bubbleBy = s.tower; } else { e.slow = Math.max(e.slow, 0.4); e.slowT = 1.5; } }
    if (s.kind === 'bee') {
        s.wob += dt * 14;
        const ax = dx / (L || 1) * s.spd + Math.cos(s.wob) * 2, ay = dy / (L || 1) * s.spd + Math.sin(s.wob) * 2;
        s.vx += (ax - s.vx) * Math.min(1, dt * 5); s.vy += (ay - s.vy) * Math.min(1, dt * 5);
        s.x += s.vx * dt; s.y += s.vy * dt;
      } else { const step = s.spd * dt; if (L > 0) { s.x += dx / L * Math.min(step, L); s.y += dy / L * Math.min(step, L); } s.ang = Math.atan2(dy, dx); }
      if (L < 0.22 || s.life <= 0) { s.done = true; if (tg) this.hitWith(tg, s); }
    }
    this.shots = this.shots.filter(s => !s.done);
  }
  hitWith(e, s) {
    const d = s.tower.def;
    let dmg = s.dmg;
    if (d.execute && e.hp / e.max <= d.execute && !e.d.boss) { this.floatText(e.x, e.y - 0.8, 'КАЗНЬ!', '#ff4d6d', 0.6); dmg = e.hp + 1; }
    this.damage(e, dmg, s.tower);
    this.applyFx(e, d, s.tower);
    e.hitSq = Math.max(e.hitSq, s.kind === 'spear' ? 1 : 0.6);
    if (s.kind === 'bee') {
      e.poison = Math.max(e.poison, d.poison * CARD_LV_MULT[s.tower.lvl]); e.poisonT = 3; e.poisonBy = s.tower;
      if (Math.random() < d.panic && !e.d.boss) { e.panic = 0.8; this.floatText(e.x, e.y - 0.8, 'А-А-А!', '#ffdd33', 0.4); }
      if (e.fat > 0 && this.active.has('honey')) e.stun = Math.max(e.stun, 1);
    }
    this.burst(e.x, e.y - 0.3, { ice: '#bdf3ff', arrow: '#ffe8a3', bolt: '#ffe8a3', spear: '#fff', bee: '#ffd23f' }[s.kind] || '#fff', s.kind === 'spear' ? 10 : 5, s.kind === 'spear' ? 5 : 3);
    if (s.kind === 'spear') this.shake = Math.max(this.shake, 0.25);
    Sfx.play('hit');
  }
  applyFx(e, d, tower) {
    if (d.slow) { const sp = Math.min(0.85, d.slow * this.mod.slowPow); e.slow = Math.max(e.slow, e.d.boss ? sp * 0.5 : sp); e.slowT = d.slowT; }
    if (d.freeze && Math.random() < d.freeze && !e.d.boss) { e.frozen = 1.3; this.floatText(e.x, e.y - 0.8, 'ЛЕДЫШКА!', '#bdf3ff', 0.42); }
    if (d.burn) { e.burn = Math.max(e.burn, d.burn * CARD_LV_MULT[tower.lvl]); e.burnT = 3; e.burnBy = tower; }
    if (d.grease) { e.grease = d.grease; }
    if (d.wool) { e.slow = Math.max(e.slow, d.wool); e.slowT = 2; }
  }
  explode(x, y, s) {
    const d = s.tower.def, r = s.splash * (1 + s.tower.flv * 0.1) * this.mod.splash;
    for (const e of this.enemies) {
      if (!this.targetable(e, d.air)) continue;
      const dd = dist2(e.x, e.y, x, y);
      if (dd > r * r) continue;
      let dmg = s.dmg * (1 - Math.sqrt(dd) / r * 0.4);
      if (this.active.has('icebreak') && (e.frozen > 0 || e.slow >= 0.5)) dmg *= 1.5;
      if (e.eat > 0 && (this.active.has('surprise') || this.active.has('surprise2'))) dmg *= 2;
      if (e.root > 0 && this.active.has('rootrock')) dmg *= 1.5;
      this.damage(e, dmg, s.tower); this.applyFx(e, d, s.tower);
      e.hitSq = 1;
      if (s.kind !== 'barrel' && s.kind !== 'acid' && !e.d.boss) { const push = (1 - Math.sqrt(dd) / r) * 0.25; e.dist = Math.max(0, e.dist - push); }
    }
    const big = r > 1;
    if (s.kind === 'barrel') { this.zones.push({ kind: 'grease', x, y, r: r * 0.95, t: 0, life: 3 }); this.fx.push({ kind: 'gsplash', x, y, t: 0, life: 0.45 }); this.burst(x, y, '#ffd54f', 12, 3.5); Sfx.play('splat'); return; }
    if (s.kind === 'acid') { this.zones.push({ kind: 'acid', x, y, r: r * 0.9, t: 0, life: 2.6, tower: s.tower, dps: d.pool * CARD_LV_MULT[s.tower.lvl] }); this.burst(x, y, '#9cff57', 12, 3.5); Sfx.play('splat'); return; }
    if (s.kind === 'sheep') { this.zones.push({ kind: 'wool', x, y, r: r * 0.9, t: 0, life: 2 }); for (let i = 0; i < 14; i++) { const a = rand(0, TAU), v = rand(2, 5); this.fx.push({ kind: 'wool', x, y: y - 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, grav: 6, t: 0, life: rand(0.6, 1), r: rand(0.08, 0.16) }); } }
    this.fx.push({ kind: 'boom', x, y, r, t: 0, life: 0.4 });
    this.fx.push({ kind: 'ring', x, y, r, t: 0, life: 0.35, c: '#ffb347' });
    this.burst(x, y, '#ff9f1c', big ? 18 : 10, big ? 5.5 : 4);
    for (let i = 0; i < (big ? 6 : 3); i++) this.fx.push({ kind: 'smoke', x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.1), t: 0, life: rand(0.5, 0.9), big: true });
    Sfx.play('boom', big ? 1 : 0.6); this.shake = Math.max(this.shake, big ? 0.4 : 0.18);
  }
  updateZones(dt) {
    for (const z of this.zones) {
      z.t += dt;
      if (z.kind === 'grease' || z.kind === 'wool') for (const e of this.enemies) if (!e.d.flying && dist2(e.x, e.y, z.x, z.y) < z.r * z.r) { e.slow = Math.max(e.slow, 0.3); e.slowT = Math.max(e.slowT, 0.3); if (z.kind === 'grease') e.grease = Math.max(e.grease, 1); }
      if (z.kind === 'acid') for (const e of this.enemies) if (this.targetable(e, false) && dist2(e.x, e.y, z.x, z.y) < z.r * z.r) { e.melt = 1; this.damage(e, z.dps * (e.fat > 0 && this.active.has('sour') ? 2 : 1) * dt, z.tower, { dot: 'melt' }); }
    }
    this.zones = this.zones.filter(z => z.t < z.life);
  }

  damage(e, dmg, tower, o = {}) {
    if (e.hp <= 0) return;
    if (e.stop > 0) dmg *= 1.25;
    if (e.d.boss) dmg *= this.mod.boss;
    if (e.d.flying) dmg *= this.mod.air;
    if (e.bubbleT > 0 && (tower?.id === 'ballista' || tower?.id === 'crossbow') && (this.active.has('bubbleup') || this.active.has('bubbleup2'))) dmg *= 2;
    if (e.frog) dmg *= 2;
    if (e.shrink > 0) dmg *= 1.3;
    let armor = e.d.armor * (e.melt > 0 ? 0.5 : 1);
    if (e.rollT > 0) armor = Math.max(armor, 0.6);
    if (!tower?.def.pierce || tower.def.proj === 'bolt') dmg *= 1 - armor;
    let crit = false;
    if (tower && !o.dot) {
      const c = (tower.def.crit || 0) + this.mod.crit;
      if (c > 0 && Math.random() < c) { crit = true; dmg *= (tower.id === 'ballista' && e.stop > 0 && this.active.has('timeshot')) ? 3 : 2; }
      if (e.d.roll && e.rollCd <= 0 && e.rollT <= 0) { e.rollT = 1.6; e.rollCd = 3.5; }
    }
    e.hp -= dmg;
    if (!o.dot) { e.flash = 1; e.last = e.frog ? 'puff' : tower?.def.death || 'pin'; }
    else e.last = e.frog ? 'puff' : o.dot;
    if (e.zapT > 0) e.last = 'electro';
    e.lastBy = tower;
    if (crit) { this.floatText(e.x, e.y - 0.7, `КРИТ ${Math.round(dmg)}`, '#ffdd33', 0.55, false, 'dmg'); this.slowmo = Math.max(this.slowmo, 0.06); }
    else if (!o.dot && dmg >= 20) this.floatText(e.x + rand(-0.2, 0.2), e.y - 0.6, Math.round(dmg), '#fff', 0.36, false, 'dmg');
    if (e.hp <= 0) this.kill(e, o.how || 'tower', tower);
  }

  kill(e, how, tower) {
    e.hp = 0;
    this.kills++;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1; this.comboT = BATTLE.comboWindow;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = 1 + Math.min(this.combo - 1, BATTLE.comboMax - 1) * 0.5;
    let pts = Math.round(e.d.pts * mult);
    const bounty = (BATTLE.bountyBase + e.d.pts * BATTLE.bountyPerPt) * this.mod.bounty * (e.d.minion ? 0.4 : 1) * (e.elite || 1);
    this.energy = Math.min(BATTLE.energyMax, this.energy + bounty);
    if (bounty >= 1) this.floatText(e.x, e.y - 0.6, `+${Math.round(bounty)}`, '#7fd6ff', 0.6, false, 'bounty');
    // никаких полётов в небо: взрывы и добивания разрывают на куски, жир — засасывает в лужу
    let style = how === 'finisher' ? 'pieces' : how === 'burst' ? 'burst' : e.last || 'pin';
    style = { launch: 'pieces', slip: 'sink', ko: 'pieces' }[style] || style;
    if (e.d.boss) style = 'boss';
    if (e.d.flying && (style === 'pieces' || style === 'sink')) style = 'pieces';
    if (how === 'finisher') {
      pts += Math.round(25 * mult); this.finishers++;
      this.energy = Math.min(BATTLE.energyMax, this.energy + BATTLE.energyPerFinisher);
      this.slowmo = 0.28; this.shake = Math.max(this.shake, 0.6);
      this.floatText(e.x, e.y - 1, ['ДОБИТ!', 'НОКАУТ!', 'БАЦ!', 'ХРЯСЬ!'][Math.floor(Math.random() * 4)], '#ff2d7a', 0.95, true);
      this.fx.push({ kind: 'slash', x: e.x, y: e.y - 0.3, t: 0, life: 0.35, a: rand(-0.8, 0.8) });
      this.burst(e.x, e.y - 0.3, '#fff', 14, 6); Sfx.play('finisher');
    } else Sfx.play('splat');
    this.score += pts;
    this.corpse(e, style);
    this.floatText(e.x, e.y - 0.5, `+${pts}`, '#fff', 0.38);
    if (this.combo >= 3) Sfx.play('combo', Math.min(8, this.combo));
    if (this.combo === 5 || this.combo === 10 || this.combo === 20) this.banner(`СЕРИЯ ×${this.combo}!`, '#ffdd33');
    if (e.d.splits) for (let i = 0; i < 2; i++) this.spawn(e.d.splits, e.path, e.max / e.d.hp * 0.6, Math.max(0, e.dist - 0.25 * i));
    if (e.d.drops) { const g = this.spawn(e.d.drops, e.path, e.max / e.d.hp * 0.5, e.dist); g.stun = 0.6; this.floatText(e.x, e.y - 0.6, 'ПЛЮХ!', '#fff', 0.4); }
    if (e.d.boss) { this.shake = 1.4; this.slowmo = 0.6; this.banner(`${e.d.name} повержен!`, '#ffcf33'); }
  }

  // Мультяшная смерть: труп-анимация своего стиля
  corpse(e, style) {
    const c = { style, kind: e.kind, d: e.d, x: e.x, y: e.y, h: 0, vx: 0, vy: 0, vh: 0, grav: 0, rot: 0, vr: 0, t: 0, life: 1, flip: e.flip, face: e.face, frame: Math.floor(e.anim) % 4, frog: e.frog, fat: e.fat, fly: e.d.flying };
    const away = e.flip ? 1 : -1;
    switch (style) {
      case 'ko': c.vx = away * 3.5; c.vh = 4; c.grav = 10; c.vr = away * 9; c.life = 1.1; c.drag = 1.5; break;
      case 'launch': c.vx = rand(-1.5, 1.5); c.vh = rand(6, 8); c.grav = 9; c.vr = rand(-12, 12); c.life = 1.3; break;
      case 'pin': c.vx = away * 1.2; c.drag = 4; c.life = 1.0; break;
      case 'slip': c.vx = away * 2.4; c.drag = 2; c.vr = away * 6; c.life = 1.0; break;
      case 'squash': c.life = 0.9; break;
      case 'shatter': c.life = 0.9; setTimeout(() => this.shards(c.x, c.y), 220 / this.speed); break;
      case 'melt': c.life = 1.3; break;
      case 'burst': c.life = 0.55; setTimeout(() => { this.confetti(c.x, c.y - 0.4); this.floatText(c.x, c.y - 1, 'ЛОПНУЛ!', '#ff7ac8', 0.7, true); Sfx.play('boom', 0.5); }, 480 / this.speed); break;
      case 'char': c.life = 1.1; break;
      case 'electro': c.life = 0.9; break;
      case 'puff': c.life = 0.5; this.fx.push({ kind: 'smoke', x: c.x, y: c.y - 0.3, t: 0, life: 0.6, big: true }); break;
      case 'pieces': c.life = 1.5; c.chunks = this.chunks(e, 3, 3); this.splat(c.x, c.y, e.d.color); break;
      case 'sink': c.life = 1.6; c.vx = (e.flip ? -1 : 1) * 0.3; c.drag = 3; break;
      case 'boss': c.life = 2.2; c.chunks = this.chunks(e, 4, 4, 1.4); this.splat(c.x, c.y, e.d.color, 1.6); for (let i = 0; i < 4; i++) setTimeout(() => this.fx.push({ kind: 'boom', x: c.x + rand(-0.6, 0.6), y: c.y + rand(-0.8, 0), r: 1.2, t: 0, life: 0.45 }), i * 250); break;
    }
    if (c.fly && !c.chunks) { c.h = 0.6; c.grav = c.grav || 8; }
    if (c.fly && c.chunks) for (const k of c.chunks) k.h += 0.6;
    this.corpses.push(c);
    this.burst(e.x, e.y - 0.3, e.d.color, style === 'puff' ? 6 : 10, 3.5);
  }
  // куски спрайта: сетка cols×rows текущего кадра, разлетаются по земле, подпрыгивают и ложатся
  chunks(e, cols, rows, pow = 1) {
    const out = [], away = e.flip ? 1 : -1;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const fx = (q + 0.5) / cols - 0.5, fy = 1 - (r + 0.5) / rows;
      out.push({ q, r, cols, rows, x: e.x + fx * 0.6 * e.d.size, y: e.y, h: fy * e.d.size * ESZ * 0.85 / K * K, vx: (fx * 4 + rand(-1.2, 1.2) + away * 0.6) * pow, vy: rand(-0.9, 0.9) * pow, vh: rand(1.2, 2.6) * pow, rot: 0, vr: rand(-9, 9), rest: false });
    }
    return out;
  }
  splat(x, y, color, k = 1) { this.zones.push({ kind: 'splat', x, y, r: 0.55 * k, t: 0, life: 3.5, c: color }); for (let i = 0; i < 10 * k; i++) { const a = rand(0, TAU), v = rand(1.5, 4); this.fx.push({ kind: 'dot', x, y: y - 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, grav: 10, t: 0, life: rand(0.35, 0.6), c: color, r: rand(0.05, 0.1) }); } }
  shards(x, y) { for (let i = 0; i < 12; i++) { const a = rand(0, TAU), v = rand(2, 5); this.fx.push({ kind: 'shard', x, y: y - 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, grav: 10, t: 0, life: rand(0.5, 0.8), rot: rand(0, 6), vr: rand(-10, 10), r: rand(0.08, 0.16) }); } Sfx.play('ice'); }
  confetti(x, y) { const C = ['#ff7ac8', '#ffd23f', '#7df9ff', '#8dff5a', '#ff5d5d']; for (let i = 0; i < 26; i++) { const a = rand(0, TAU), v = rand(2, 6); this.fx.push({ kind: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, grav: 7, t: 0, life: rand(0.6, 1.1), c: C[i % 5], rot: rand(0, 6), vr: rand(-12, 12) }); } }
  burst(x, y, c, n = 8, v = 4) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.3, 1) * v; this.fx.push({ kind: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, t: 0, life: rand(0.3, 0.6), c, r: rand(0.05, 0.11) }); } }
  floatText(x, y, s, c = '#fff', size = 0.45, big = false, kind = 'words') { if (!VIEW[kind]) return; this.texts.push({ x, y, s: String(s), c, size: size * 0.78, t: 0, life: big ? 1 : 0.8, big }); }
  banner(s, c = '#fff') { this.onToast(s, c); }

  // ───────── действия игрока ─────────
  cardCost(c) { return RARITIES[TOWER_DEFS[c.card].rarity].cost + this.towers.filter(t => t.id === c.card).length; }
  canPlace(cx, cy) { return cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && !this.blocked.has(cx + ',' + cy) && !this.towers.some(t => t.cx === cx && t.cy === cy); }
  place(c, cx, cy) {
    const cost = this.cardCost(c);
    if (!this.canPlace(cx, cy) || this.energy < cost) return false;
    this.energy -= cost;
    const t = { id: c.card, def: TOWER_DEFS[c.card], lvl: c.lvl || 1, grade: c.grade || 0, gm: GRADES[c.grade || 0].mult, flv: 0, cx, cy, x: cx + 0.5, y: cy + 0.5, cd: 0.4, recoil: 0, pop: 1, aim: Math.PI / 2, face: Math.PI / 2, spent: cost, frozen: 0 };
    t.meta = this.towerMeta(t);
    this.towers.push(t);
    Sfx.play('place'); this.burst(t.x, t.y, RARITIES[t.def.rarity].color, 16, 4);
    for (let i = 0; i < 6; i++) this.fx.push({ kind: 'smoke', x: t.x + rand(-0.4, 0.4), y: t.y + 0.3, t: 0, life: 0.5 });
    this.fx.push({ kind: 'ring', x: t.x, y: t.y + 0.3, r: 0.9, t: 0, life: 0.4, c: RARITIES[t.def.rarity].color });
    this.refreshCombos(); this.hud();
    return true;
  }
  upCost(t) { return t.flv >= 2 ? null : Math.max(1, FIELD_UP[t.flv + 1].cost + RARITIES[t.def.rarity].order - this.mod.upDisc); }
  upgrade(t) {
    const c = this.upCost(t); if (c == null || this.energy < c) return false;
    this.energy -= c; t.flv++; t.spent += c; t.pop = 1; Sfx.play('upgrade');
    this.burst(t.x, t.y - 0.3, '#ffdd33', 18, 4); this.floatText(t.x, t.y - 1.1, '★'.repeat(t.flv + 1), '#ffdd33', 0.55);
    this.hud(); return true;
  }
  sell(t) {
    this.energy = Math.min(BATTLE.energyMax, this.energy + Math.floor(t.spent * 0.5));
    this.towers = this.towers.filter(x => x !== t); this.burst(t.x, t.y, '#ccc', 12); this.refreshCombos(); this.hud();
  }
  refreshCombos() {
    const ids = new Set(this.towers.map(t => t.id)), was = this.active;
    this.active = new Set(COMBOS.filter(c => ids.has(c.a) && ids.has(c.b)).map(c => c.id));
    for (const id of this.active) if (!was.has(id)) { const c = COMBOS.find(x => x.id === id); this.banner(`КОМБО: ${c.name}!`, '#7df9ff'); }
  }
  tapAt(x, y) {
    Sfx.unlock();
    let best = null, bd = 1e9;
    const py = y * K;          // касание — в экранных клетках, тела монстров «стоят» над землёй
    for (const e of this.enemies) {
      if (!this.targetable(e, true)) continue;
      const s = e.d.size * ESZ, hy = e.y * K + FOOT - s * 0.45 - (e.d.flying ? 0.5 : 0), r = Math.max(0.6, s * 0.5);
      const d = dist2(e.x, hy, x, py); if (d < r * r && d < bd) { best = e; bd = d; }
    }
    if (best) {
      if (best.hp / best.max <= this.mod.finish && !best.d.boss) { this.kill(best, 'finisher'); return { finisher: true }; }
      best.last = 'ko';
      this.damage(best, BATTLE.tapDmg * (1 + this.level.idx * 0.12), null, { how: 'tower' }); best.flash = 1; best.hitSq = 1;
      this.fx.push({ kind: 'tap', x, y, t: 0, life: 0.25 }); this.burst(x, y, '#fff', 5, 3); Sfx.play('hit');
      return { hit: true };
    }
    const cx = Math.floor(x), cy = Math.floor(y);
    const t = this.towers.find(t => t.cx === cx && t.cy === cy) || this.towers.find(t => {
      const S = this.spriteSize(t) / this.cell, by = t.y * K + 0.15;
      return Math.abs(x - t.x) < 0.45 && py < by + 0.1 && py > by - S * 0.85;
    });
    if (t) return { tower: t };
    return { cell: [cx, cy] };
  }

  finish(win) {
    this.over = true;
    if (win) { this.score += this.lives * 150; Sfx.play('win'); } else Sfx.play('lose');
    this.onEnd({ win, score: this.score, kills: this.kills, waves: this.wave, secs: Math.round(this.t), lives: Math.max(0, this.lives), finishers: this.finishers, bestCombo: this.bestCombo });
  }
  hud() {
    this.onHud({ energy: this.energy, emax: BATTLE.energyMax, lives: Math.max(0, this.lives), maxLives: this.maxLives, wave: this.wave, waves: this.waves.length,
      score: this.score, combo: this.combo, comboT: this.comboT,
      next: !this.waveActive && this.wave < this.waves.length ? Math.ceil(this.waveT) : null, speed: this.speed, paused: this.paused });
  }

  // ───────── ввод ─────────
  bindInput() {
    const cv = this.cv, pts = new Map();
    let drag = null, pinch = null;
    const pos = ev => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    const world = ([x, y]) => [x / this.cell + this.cam.x, (y / this.cell + this.cam.y) / K];
    const down = ev => {
      cv.setPointerCapture?.(ev.pointerId);
      pts.set(ev.pointerId, pos(ev));
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), view: this.view }; drag = null; return; }
      drag = { start: pos(ev), cam: { ...this.cam }, moved: false, t: performance.now() };
    };
    const move = ev => {
      if (!pts.has(ev.pointerId)) { if (this.sel) { const [x, y] = world(pos(ev)); this.hover = [Math.floor(x), Math.floor(y)]; } return; }
      pts.set(ev.pointerId, pos(ev));
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); this.setZoom(pinch.view * pinch.d / Math.max(20, d), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); this.clampCam(); return; }
      if (!drag) return;
      const [x, y] = pos(ev), dx = x - drag.start[0], dy = y - drag.start[1];
      if (!drag.moved && Math.hypot(dx, dy) > 9) drag.moved = true;
      if (drag.moved) { this.cam.x = drag.cam.x - dx / this.cell; this.cam.y = drag.cam.y - dy / this.cell; this.clampCam(); this.onPan?.(); }
      if (this.sel) { const [wx, wy] = world([x, y]); this.hover = [Math.floor(wx), Math.floor(wy)]; }
    };
    const up = ev => {
      const p = pts.get(ev.pointerId); pts.delete(ev.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; drag = null; return; }
      if (!drag || this.over) { drag = null; return; }
      const moved = drag.moved; drag = null;
      if (moved) return;
      const [wx, wy] = world(p);
      if (this.sel) { this.onPlaceTry?.(Math.floor(wx), Math.floor(wy)); return; }
      const r = this.tapAt(wx, wy);
      this.onTap?.(r);
    };
    const wheel = ev => { ev.preventDefault(); const [x, y] = pos(ev); this.setZoom(this.view * (ev.deltaY > 0 ? 1.1 : 0.9), x, y); this.clampCam(); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', wheel, { passive: false });
    const rs = () => this.resize(); window.addEventListener('resize', rs);
    this.unbind = () => { cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel); window.removeEventListener('resize', rs); };
  }

  // ───────── рендер ─────────
  // Листы пропсов мира: props_<мир>1/2 — мелочь для поля, props_<мир>3 — крупные деревья и скалы для краёв.
  propSheets() {
    const W = this.level.world.id, L = s => img(`img/level/${s}.webp`);
    const small = [L(`props_${W}1`), L(`props_${W}2`), decorImg(W)].filter(ok), big = [L(`props_${W}3`)].filter(ok);
    return { small, big: big.length ? big : small };
  }
  // пропс стоит основанием в точке (x, y) экрана; S — размер в пикселях
  drawProp(g, p, x, y, S, sheets) {
    const bim = p.boulder && img(`img/level/boulder_${this.level.world.id}.webp`);
    if (bim && ok(bim)) {   // большой валун — отдельный спрайт
      const b = META[`boulder_${this.level.world.id}`]?.base || [0.5, 0.96], w = S * 1.05;
      g.drawImage(bim, x - w * b[0], y - w * b[1], w, w); return;
    }
    const list = p.edge ? sheets.big : sheets.small;
    if (list.length) {
      const sh = list[(p.v + (p.edge ? 0 : this.level.idx)) % list.length], fw = sh.naturalWidth / 6;
      if (p.flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(sh, (p.v % 6) * fw, 0, fw, sh.naturalHeight, -S / 2, y - S * 0.96, S, S); g.restore(); }
      else g.drawImage(sh, (p.v % 6) * fw, 0, fw, sh.naturalHeight, x - S / 2, y - S * 0.96, S, S);
    } else this.drawDecor(g, { x: x / this.cell - 0.5, y: y / this.cell - 0.95, s: S / this.cell / 1.05, v: p.v }, this.cell);
  }
  // Статичный слой в экранной проекции: вода, плато с текстурой земли, дорога с бордюром, скальный обрыв, лес по краям.
  buildGround() {
    const C = this.cell, dpr = this.dpr, W = this.level.world;
    const ww = (WX1 - WX0) * C, wh = (PY1 - PY0) * C, c = document.createElement('canvas');
    c.width = Math.round(ww * dpr); c.height = Math.round(wh * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr); g.translate(-WX0 * C, -PY0 * C);
    let seed = this.level.idx * 99 + 1; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pat = (id, cells, sy = 1) => { const im = img(`img/level/${id}.webp`); if (!ok(im)) return null; const p = g.createPattern(im, 'repeat'); p.setTransform(new DOMMatrix().scale(cells * C / im.naturalWidth, cells * C / im.naturalWidth * sy)); return p; };
    const WATER = { meadow: '#3d8796', canyon: '#3a8090', glacier: '#4d80a0' }[W.id] || '#3d8796';
    // вода внизу
    g.fillStyle = pat('water', 3) || WATER; g.fillRect(WX0 * C, PY0 * C, ww, wh);
    const ey = WY1 * K * C, wob = x => Math.sin(x * 1.7) * 0.06 * C + Math.sin(x * 4.3 + 1) * 0.03 * C;
    // скальный обрыв (передняя грань плато)
    g.save();
    g.beginPath(); g.moveTo(WX0 * C, ey);
    for (let x = WX0; x <= WX1 + 0.01; x += 0.25) g.lineTo(x * C, ey + wob(x));
    for (let x = WX1; x >= WX0 - 0.01; x -= 0.25) g.lineTo(x * C, ey + CLIFF * C + wob(x + 3) * 2);
    g.closePath();
    const cp = pat(`cliff_${W.id}`, CLIFF * 2);
    if (cp) { cp.setTransform(new DOMMatrix().translate(0, ey).scale(CLIFF * 2 * C / img(`img/level/cliff_${W.id}.webp`).naturalWidth)); g.fillStyle = cp; g.fill(); }
    else {
      const gr = g.createLinearGradient(0, ey, 0, ey + CLIFF * C);
      const rock = { meadow: ['#8a7a66', '#5e5144'], canyon: ['#c08452', '#7d4f2e'], glacier: ['#9fb3c4', '#5f7488'] }[W.id];
      gr.addColorStop(0, rock[0]); gr.addColorStop(1, rock[1]); g.fillStyle = gr; g.fill();
      g.save(); g.clip(); g.strokeStyle = 'rgba(30,20,10,.28)'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const yy = ey + (0.18 + i * 0.27) * CLIFF * C; g.beginPath(); for (let x = WX0; x <= WX1; x += 0.3) g.lineTo(x * C, yy + Math.sin(x * 2.1 + i) * 0.05 * C); g.stroke(); }
      for (let i = 0; i < 40; i++) { const x = (WX0 + r() * (WX1 - WX0)) * C, yy = ey + r() * CLIFF * C; g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.12)'; g.beginPath(); g.ellipse(x, yy, C * (0.15 + r() * 0.3), C * (0.06 + r() * 0.08), 0, 0, TAU); g.fill(); }
      g.restore();
    }
    g.strokeStyle = 'rgba(20,25,58,.6)'; g.lineWidth = 2.5; g.stroke();
    g.restore();
    // пена у подножия
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = C * 0.07; g.lineCap = 'round';
    for (let x = WX0; x < WX1; x += 0.7) { const yy = ey + CLIFF * C + wob(x + 3) * 2 + C * 0.1; g.beginPath(); g.moveTo(x * C, yy); g.lineTo((x + 0.35) * C, yy + C * 0.02); g.stroke(); }
    // плато: земля в проекции (сжата по вертикали)
    g.save();
    g.beginPath(); g.moveTo(WX0 * C, PY0 * C); g.lineTo(WX1 * C, PY0 * C);
    for (let x = WX1; x >= WX0 - 0.01; x -= 0.25) g.lineTo(x * C, ey + wob(x));
    g.closePath(); g.clip();
    g.scale(1, K);
    const Y0 = PY0 / K, gh = (WY1 - Y0) * C;
    const gp = pat(`ground_${W.id}`, 3.2);
    if (gp) { g.fillStyle = gp; g.fillRect(WX0 * C, Y0 * C, ww, gh); }
    else { for (let y = Math.floor(Y0); y < WY1; y++) for (let x = Math.floor(WX0); x < WX1; x++) { g.fillStyle = W.grass[(x + y) & 1]; g.fillRect(x * C, y * C, C + 1, C + 1); } }
    for (let i = 0; i < 30; i++) { const x = (WX0 + r() * (WX1 - WX0)) * C, y = (Y0 + r() * (WY1 - Y0)) * C, rad = C * (1 + r() * 2); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() > 0.5 ? 'rgba(255,250,220,.10)' : 'rgba(0,30,0,.09)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    // пруды: песчаный берег, вода с текстурой, блики и кувшинки (это преграда — строить нельзя)
    const SH = { meadow: '#c9b27a', canyon: '#d9a86a', glacier: '#e8f1f6' }[W.id] || '#c9b27a';
    let sc = null;
    for (const pond of this.ponds) {
      // единый контур пруда: круги в клетках + перемычки между соседями (без швов и «бусин»)
      const has = new Set(pond.map(([x, y]) => x + ',' + y));
      const blob = (rad, ctx = g) => { ctx.beginPath(); for (const [x, y] of pond) { ctx.moveTo((x + 0.5 + rad) * C, (y + 0.5) * C); ctx.arc((x + 0.5) * C, (y + 0.5) * C, rad * C, 0, TAU);
        if (has.has(x + 1 + ',' + y)) ctx.rect((x + 0.5) * C, (y + 0.5 - rad) * C, C, rad * 2 * C);
        if (has.has(x + ',' + (y + 1))) ctx.rect((x + 0.5 - rad) * C, (y + 0.5) * C, rad * 2 * C, C); } };
      g.fillStyle = SH; blob(0.72); g.fill();
      g.fillStyle = W.id === 'glacier' ? '#9cc7e0' : '#2f7f93'; blob(0.6); g.fill();
      const wp = pat('water', 2.2); if (wp) { g.fillStyle = wp; blob(0.58); g.fill(); }
      // внутренняя тень у верхнего берега: тёмный слой минус сдвинутый вниз контур (обводка кругов давала кольца на стыках)
      if (!sc) { sc = document.createElement('canvas'); sc.width = c.width; sc.height = c.height; }
      const s2 = sc.getContext('2d'); s2.setTransform(1, 0, 0, 1, 0, 0); s2.globalCompositeOperation = 'source-over'; s2.clearRect(0, 0, sc.width, sc.height);
      s2.setTransform(dpr, 0, 0, dpr, -WX0 * C * dpr, -PY0 * C * dpr); s2.fillStyle = 'rgba(0,30,40,.3)'; blob(0.62, s2); s2.fill();
      s2.globalCompositeOperation = 'destination-out'; s2.translate(0, C * 0.13); blob(0.6, s2); s2.fill();
      g.save(); blob(0.58); g.clip(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(sc, 0, 0); g.restore();
      for (const [x, y] of pond) {
        if (r() < 0.5) { g.fillStyle = W.id === 'glacier' ? '#f2f8fb' : '#5aa845'; g.strokeStyle = 'rgba(20,25,58,.5)'; g.lineWidth = 1.5; const lx = (x + 0.25 + r() * 0.5) * C, ly = (y + 0.25 + r() * 0.5) * C; g.beginPath(); g.arc(lx, ly, C * 0.13, 0.4, TAU - 0.1); g.lineTo(lx, ly); g.closePath(); g.fill(); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse((x + 0.3 + r() * 0.4) * C, (y + 0.3 + r() * 0.4) * C, C * 0.14, C * 0.05, 0, 0, Math.PI); g.stroke();
      }
    }
    // дорога: тень-«канавка», бордюр, текстура, камни по краю
    const roadPath = () => { for (const p of this.paths) { g.beginPath(); const s0 = p.pts[0], s1 = p.pts[1]; g.moveTo((s0[0] - (s1[0] - s0[0]) * 2) * C, (s0[1] - (s1[1] - s0[1]) * 2) * C); p.pts.forEach(([x, y]) => g.lineTo(x * C, y * C)); g.stroke(); } };
    const stroke = (w, style, dy = 0) => { g.save(); g.translate(0, dy * C); g.strokeStyle = style; g.lineWidth = w * C; g.lineJoin = 'round'; g.lineCap = 'round'; roadPath(); g.restore(); };
    stroke(1.22, 'rgba(0,0,0,.18)', 0.06);
    stroke(1.1, W.edge);
    stroke(0.96, pat(`road_${W.id}`, 1.6) || W.path[0]);
    stroke(0.96, 'rgba(0,0,0,.16)', -0.04);
    stroke(0.86, pat(`road_${W.id}`, 1.6) || W.path[0], 0.03);
    for (const p of this.paths) for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i], b = p.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      for (let t = 0; t < L; t += 0.3) for (const side of [-1, 1]) {
        if (r() < 0.3) continue;
        const x = (a[0] + (b[0] - a[0]) * t / L + nx * side * 0.55) * C, y = (a[1] + (b[1] - a[1]) * t / L + ny * side * 0.55) * C, rw = C * (0.08 + r() * 0.05);
        g.fillStyle = W.id === 'glacier' ? '#e6eff6' : W.id === 'canyon' ? '#c49468' : '#aaa497'; g.strokeStyle = 'rgba(20,25,58,.55)'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(x, y, rw, rw * 0.8, r() * 3, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(x - rw * 0.25, y - rw * 0.3, rw * 0.4, rw * 0.25, 0, 0, TAU); g.fill();
      }
    }
    // тень вдоль кромки обрыва
    const eg = g.createLinearGradient(0, (WY1 - 0.9) * C, 0, WY1 * C); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = eg; g.fillRect(WX0 * C, (WY1 - 0.9) * C, ww, 0.9 * C);
    g.restore();
    // кромка травы над обрывом
    g.strokeStyle = W.id === 'glacier' ? '#f4f9fc' : W.id === 'canyon' ? '#e8bd7c' : '#86b85a'; g.lineWidth = C * 0.12; g.lineCap = 'round';
    g.beginPath(); for (let x = WX0; x <= WX1; x += 0.25) g.lineTo(x * C, ey + wob(x) + C * 0.03); g.stroke();
    // лес и скалы по краям — стоят «вертикально», запекаем в слой по глубине
    const sheets = this.propSheets(), props = [];
    const inField = (x, y) => x > -0.35 && x < COLS + 0.35 && y > -0.45 && y < ROWS + 0.2;
    const nearRoad = (x, y) => this.paths.some(p => p.pts.some(([px, py], i) => { const q = p.pts[i + 1]; if (!q) return Math.hypot(px - x, py - y) < 1.2; const L = Math.hypot(q[0] - px, q[1] - py) || 1, t = Math.max(0, Math.min(1, ((x - px) * (q[0] - px) + (y - py) * (q[1] - py)) / (L * L))); return Math.hypot(px + (q[0] - px) * t - x, py + (q[1] - py) * t - y) < 1.15; }));
    for (let y = WY0 - 0.6; y < WY1 - 0.35; y += 0.58) for (let x = WX0 + 0.2; x < WX1; x += 0.6) {
      const jx = x + (r() - 0.5) * 0.45, jy = y + (r() - 0.5) * 0.4;
      if (inField(jx, jy) || (jy > ROWS + 0.2 && Math.abs(jx - 4.5) < 2.7) || nearRoad(jx, jy)) continue;
      if (this.portals.some(pts => Math.hypot(pts[0][0] - jx, pts[0][1] - jy) < 1.6)) continue;
      if (r() < 0.85) props.push({ x: jx, y: jy, s: 1.25 + r() * 0.7, v: Math.floor(r() * 6), edge: r() < 0.7, flip: r() < 0.5 });
    }
    // кусты и цветы у подножия замка
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) props.push({ x: 4.5 + sx * (2.9 + i * 0.55), y: ROWS + 2.7 + (i % 2) * 0.5, s: 0.9 + r() * 0.3, v: Math.floor(r() * 6), flip: sx < 0 });
    props.sort((a, b) => a.y - b.y);
    for (const p of props) this.drawProp(g, p, p.x * C, p.y * K * C, p.s * C, sheets);
    this.ground = c;
    this.massifs = this.mountains.map(m => this.buildMountain(m, r, sheets));
    // мелкий декор на поле — в общую сортировку по глубине (башни и монстры могут заходить за него)
    this.fieldProps = this.decor.map(d => ({ x: d.x + 0.5, y: d.y + 0.72, s: d.s * 1.15 + 0.1, v: d.v, flip: (d.x + d.y) % 2 === 0, boulder: d.v < 2 }));
  }

  // Гора (скальный массив) на клетках cells: верх — приподнятая площадка с землёй мира, спереди — слоистая скала
  // высотой H, сверху деревья/камни. Рисуется один раз в отдельный холст и встаёт в сортировку по южному краю.
  buildMountain(cells, r, sheets) {
    const C = this.cell, dpr = this.dpr, W = this.level.world, H = C * (1.25 + r() * 0.4), pad = C * 1.0;
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    const w = (x1 - x0) * C + pad * 2, h = (y1 - y0) * K * C + H + pad * 2, cv = document.createElement('canvas');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const X = x => (x - x0) * C + pad, Y = y => (y - y0) * K * C + pad + H;       // точка земли → холст (вершина выше на H)
    const has = (x, y) => cells.some(c => c[0] === x && c[1] === y);
    // готовый спрайт горы от художника (mountain_<мир>, основание — META.base) — растягиваем на площадь массива
    const ms = img(`img/level/mountain_${W.id}.webp`);
    if (ok(ms)) {
      const bw = (x1 - x0 + 0.5) * C, bh = bw * ms.naturalHeight / ms.naturalWidth, base = META[`mountain_${W.id}`]?.base || [0.5, 0.92];
      g.drawImage(ms, X((x0 + x1) / 2) - bw * base[0], Y(y1) - bh * base[1], bw, bh);
      return { c: cv, sx: x0 * C - pad, sy: y0 * K * C - pad - H, w, h, key: y1 - 0.02 };
    }
    // пока спрайта нет — не рисуем «стены»: густая группа крупных скал и деревьев на клетках массива
    if (sheets.big.length) {
      const pr = [];
      for (const [x, y] of cells) for (let i = 0; i < 2; i++) pr.push({ x: x + 0.25 + r() * 0.5, y: y + 0.35 + i * 0.4 + r() * 0.15, s: 1.35 + r() * 0.45, v: Math.floor(r() * 6), edge: true, flip: r() < 0.5 });
      pr.sort((a, b) => a.y - b.y);
      for (const p of pr) this.drawProp(g, p, X(p.x), Y(p.y), p.s * C, sheets);
      return { c: cv, sx: x0 * C - pad, sy: y0 * K * C - pad - H, w, h, key: y1 - 0.02 };
    }
    const rock = { meadow: ['#9a8f7c', '#6b6152', '#4c4439'], canyon: ['#c98a55', '#9a5f34', '#6f4024'], glacier: ['#b7c7d4', '#8299ad', '#5d7184'] }[W.id] || ['#9a8f7c', '#6b6152', '#4c4439'];
    const cp = (() => { const im = img(`img/level/cliff_${W.id}.webp`); if (!ok(im)) return null; const p = g.createPattern(im, 'repeat'); p.setTransform(new DOMMatrix().scale(H * 1.6 / im.naturalHeight)); return p; })();
    // передние грани: у клеток без соседа снизу — от края вершины вниз до земли
    for (const [x, y] of cells) {
      if (has(x, y + 1)) continue;
      const lx = X(x) - (has(x - 1, y) ? 0 : C * 0.04), rx = X(x + 1) + (has(x + 1, y) ? 0 : C * 0.04), top = Y(y + 1) - H;
      g.beginPath(); g.moveTo(lx, top); g.lineTo(rx, top);
      for (let k = 1; k >= 0; k -= 0.25) g.lineTo(lx + (rx - lx) * k, Y(y + 1) + Math.sin((x + k) * 5.3) * C * 0.06);
      g.closePath();
      const gr = g.createLinearGradient(0, top, 0, Y(y + 1)); gr.addColorStop(0, rock[0]); gr.addColorStop(1, rock[2]);
      g.fillStyle = gr; g.fill(); if (cp) { g.save(); g.globalAlpha = 0.85; g.fillStyle = cp; g.fill(); g.restore(); }
      g.save(); g.clip(); g.strokeStyle = 'rgba(20,15,10,.3)'; g.lineWidth = 2;
      for (let i = 1; i < 4; i++) { const yy = top + H * i / 4; g.beginPath(); for (let xx = lx; xx <= rx; xx += C * 0.2) g.lineTo(xx, yy + Math.sin(xx * 0.09 + i) * C * 0.04); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(lx, top, rx - lx, H * 0.12);
      g.restore();
    }
    // вершина: объединение скруглённых клеток со смещением вверх на H
    const topPath = (grow) => { g.beginPath(); for (const [x, y] of cells) rr(g, X(x) - grow - (has(x - 1, y) ? C * 0.2 : 0), Y(y) - H - grow - (has(x, y - 1) ? C * 0.2 : 0), C + grow * 2 + (has(x - 1, y) ? C * 0.2 : 0), K * C + grow * 2 + (has(x, y - 1) ? C * 0.2 : 0), C * 0.22); };
    topPath(C * 0.05); g.fillStyle = rock[1]; g.fill();
    const tp = (() => { const im = img(`img/level/ground_${W.id}.webp`); if (!ok(im)) return null; const p = g.createPattern(im, 'repeat'); p.setTransform(new DOMMatrix().scale(2.4 * C / im.naturalWidth, 2.4 * C * K / im.naturalWidth)); return p; })();
    topPath(-C * 0.04); g.fillStyle = tp || W.grass[0]; g.fill();
    g.fillStyle = 'rgba(255,255,230,.1)'; g.fill();
    g.strokeStyle = 'rgba(20,25,58,.65)'; g.lineWidth = 2.5; topPath(C * 0.05); g.stroke();
    // камни по краю вершины
    for (const [x, y] of cells) for (let i = 0; i < 3; i++) {
      if (r() < 0.4) continue;
      const ex = X(x) + C * (0.1 + r() * 0.8), ey = Y(y + 1) - H - C * 0.02 + (has(x, y + 1) ? -K * C * r() : 0), rw = C * (0.08 + r() * 0.06);
      g.fillStyle = rock[0]; g.strokeStyle = 'rgba(20,25,58,.55)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(ex, ey, rw, rw * 0.75, 0, 0, TAU); g.fill(); g.stroke();
    }
    // деревья/кусты на вершине
    const tops = cells.filter(() => r() < 0.6).slice(0, 3);
    tops.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of tops) this.drawProp(g, { v: Math.floor(r() * 6), edge: r() < 0.6, flip: r() < 0.5 }, X(x + 0.5) + (r() - 0.5) * C * 0.3, Y(y + 0.7) - H, C * (1.0 + r() * 0.35), sheets);
    return { c: cv, sx: x0 * C - pad, sy: y0 * K * C - pad - H, w, h, key: y1 - 0.02 };
  }

  render() {
    const g = this.g, C = this.cell;
    if (!this.ground) this.buildGround();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#2f6f80'; g.fillRect(0, 0, this.vw, this.vh);
    const sh = this.shake > 0 ? this.shake * C * 0.18 : 0;
    g.translate(-this.cam.x * C + rand(-sh, sh), -this.cam.y * C + rand(-sh, sh));
    g.drawImage(this.ground, WX0 * C, PY0 * C, (WX1 - WX0) * C, (PY1 - PY0) * C);
    const now = performance.now() / 1000;
    // «стоящий» объект с опорой на земле в y: внутри рисуем в обычных координатах клеток, сдвиг переводит опору в проекцию
    const up = (y, f) => { g.save(); g.translate(0, y * C * (K - 1)); f(); g.restore(); };
    // плоские слои на земле: лужи, круги дальности, подсветка площадок
    g.save(); g.scale(1, K);
    for (const z of this.zones) if (z.kind !== 'ult') this.drawZone(g, z, C, now);
    if (this.sel) {
      // свободные клетки — яркая зелёная сетка (тёмная подводка снизу, чтобы читалась на любой траве)
      const free = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.canPlace(x, y)) free.push([x, y]);
      const cell = ([x, y]) => rr(g, x * C + 3, y * C + 3, C - 6, C - 6, C * 0.16);
      g.fillStyle = `rgba(24,210,44,${0.4 + Math.sin(now * 5) * 0.08})`;
      for (const p of free) { cell(p); g.fill(); }
      g.strokeStyle = 'rgba(0,50,8,.7)'; g.lineWidth = 5;
      for (const p of free) { cell(p); g.stroke(); }
      g.strokeStyle = '#6dff4f'; g.lineWidth = 2.5;
      for (const p of free) { cell(p); g.stroke(); }
      if (this.hover && !this.canPlace(...this.hover) && this.hover[0] >= 0 && this.hover[0] < COLS && this.hover[1] >= 0 && this.hover[1] < ROWS) {
        g.fillStyle = 'rgba(255,60,50,.35)'; g.strokeStyle = 'rgba(255,90,80,.95)'; g.lineWidth = 2.5; cell(this.hover); g.fill(); g.stroke();
      }
      if (this.hover && this.canPlace(...this.hover)) {
        const [hx, hy] = this.hover, d = TOWER_DEFS[this.sel.card];
        g.fillStyle = 'rgba(90,255,80,.7)'; g.strokeStyle = '#f2ffe6'; g.lineWidth = 3; cell(this.hover); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,221,51,.16)'; g.strokeStyle = 'rgba(255,221,51,.9)'; g.lineWidth = 2.5;
        g.beginPath(); g.arc((hx + 0.5) * C, (hy + 0.5) * C, (d.range || d.aura || 1) * this.mod.range * C, 0, TAU); g.fill(); g.stroke();
      }
    }
    if (this.focus) { const t = this.focus, s = t.def.type === 'tower' ? this.stat(t).range : (t.def.aura || 0.6); g.fillStyle = 'rgba(255,255,255,.08)'; g.strokeStyle = 'rgba(255,255,255,.85)'; g.setLineDash([7, 6]); g.lineWidth = 2.5; g.beginPath(); g.arc(t.x * C, t.y * C, s * C, 0, TAU); g.fill(); g.stroke(); g.setLineDash([]); }
    g.restore();
    for (const v of this.vines) up((v.e.hp > 0 ? v.e : v).y, () => this.drawVines(g, v, C));
    // всё стоящее — по глубине
    const list = [], sheets = this.propSheets();
    list.push({ y: GATE_Y + 0.6, f: () => this.drawBase(g, C, now) });
    for (const pts of this.portals) list.push({ y: pts[0][1] - 0.45, f: () => this.drawDen(g, pts, C, now) });
    for (const m of this.massifs) list.push({ y: m.key, f: () => g.drawImage(m.c, m.sx, m.sy, m.w, m.h) });
    for (const p of this.fieldProps) list.push({ y: p.y, f: () => this.drawProp(g, p, p.x * C, p.y * K * C, p.s * C, sheets) });
    for (const t of this.towers) list.push({ y: t.y, f: () => up(t.y, () => this.drawTower(g, t, C, now)) });
    for (const e of this.enemies) list.push({ y: e.y + (e.d.flying ? 0.6 : 0), f: () => up(e.y, () => this.drawEnemy(g, e, C, now)) });
    for (const c of this.corpses) list.push({ y: c.y + 0.05, f: () => up(c.y, () => this.drawCorpse(g, c, C, now)) });
    for (const u of this.units) list.push({ y: u.y + 0.1, f: () => up(u.y, () => this.drawUnit(g, u, C, now)) });
    for (const c of this.candies) { const cy = c.sy + (c.y - c.sy) * c.k; list.push({ y: cy, f: () => up(cy, () => this.drawCandy(g, c, C, now)) }); }
    for (const tr of this.traps) { const ty = tr.sy + (tr.y - tr.sy) * tr.k; list.push({ y: ty - 0.1, f: () => up(ty, () => this.drawTrap(g, tr, C)) }); }
    list.sort((a, b) => a.y - b.y).forEach(o => o.f());
    for (const t of this.towers) if (t.drag) up(t.drag[1], () => this.drawDragon(g, t, C, now));
    for (const b of this.bolts) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - b.t / b.life; drawBolt(g, b.a[0] * C, b.a[1] * K * C, b.b[0] * C, b.b[1] * K * C, b.c, C / 22); g.restore(); }
    for (const s of this.shots) up(s.y, () => this.drawShot(g, s, C, now));
    for (const z of this.zones) if (z.kind === 'ult') up(z.y, () => this.drawZone(g, z, C, now));
    for (const f of this.fx) up(f.y, () => this.drawFx(g, f, C));
    for (const t of this.texts) {
      const k = t.t / t.life, sz = t.size * C * (t.big ? (1 + Math.max(0, 0.35 - k) * 2.2) : 1 + Math.max(0, 0.15 - k) * 2);
      g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
      g.font = `900 ${sz}px Rubik, sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round';
      const y = (t.y * K - k * 0.8) * C;
      g.lineWidth = sz * 0.28; g.strokeStyle = '#14193a'; g.strokeText(t.s, t.x * C, y + sz * 0.08); g.strokeText(t.s, t.x * C, y);
      g.fillStyle = t.c; g.fillText(t.s, t.x * C, y);
      g.globalAlpha = 1;
    }
    // экранные эффекты: виньетка, подсветка режима метеора
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const vg = g.createRadialGradient(this.vw / 2, this.vh * 0.5, Math.min(this.vw, this.vh) * 0.45, this.vw / 2, this.vh * 0.5, Math.max(this.vw, this.vh) * 0.75);
    vg.addColorStop(0, 'rgba(10,14,40,0)'); vg.addColorStop(1, 'rgba(10,14,40,.32)'); g.fillStyle = vg; g.fillRect(0, 0, this.vw, this.vh);
  }

  // Логово монстров у начала дороги (спрайт den_<мир>, иначе portal, иначе процедурный вихрь)
  drawDen(g, pts, C, now) {
    const [x, y] = pts[0], [nx, ny] = pts[1], W = this.level.world.id;
    let im = img(`img/level/den_${W}.webp`); if (!ok(im)) im = img('img/level/portal.webp');
    const px = x * C, py = y * K * C;
    g.save(); g.globalAlpha = 0.45 + Math.sin(now * 3) * 0.15; const gr = g.createRadialGradient(px, py, 0, px, py, C * 1.3); gr.addColorStop(0, 'rgba(160,80,230,.7)'); gr.addColorStop(1, 'rgba(160,80,230,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, C * 1.3, C * 1.3 * K, 0, 0, TAU); g.fill(); g.restore();
    if (ok(im)) {
      const S = C * 2.3, gate = META[`den_${W}`]?.gate || [0.5, 0.8];
      g.drawImage(im, px - S * gate[0], py + C * 0.2 - S * gate[1], S, S);
      return;
    }
    g.save(); g.translate(px, py - C * 0.3);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, C * 0.5); rg.addColorStop(0, 'rgba(40,0,70,.95)'); rg.addColorStop(1, 'rgba(178,75,255,0)');
    g.fillStyle = rg; g.beginPath(); g.ellipse(0, 0, C * 0.5, C * 0.42, 0, 0, TAU); g.fill();
    for (let i = 0; i < 3; i++) { g.rotate(now * (1.5 + i) * (i % 2 ? -1 : 1)); g.strokeStyle = ['#b24bff', '#ff2d7a', '#ffd23f'][i]; g.lineWidth = C * 0.07; g.beginPath(); g.arc(0, 0, C * (0.42 - i * 0.1), 0, TAU * 0.65); g.stroke(); }
    g.restore();
    const a = Math.atan2((ny - y) * K, nx - x);
    g.save(); g.translate(px + Math.cos(a) * C * 0.75, py + Math.sin(a) * C * 0.75); g.rotate(a);
    g.fillStyle = '#fff'; g.strokeStyle = '#14193a'; g.lineWidth = 3; g.beginPath(); g.moveTo(C * 0.2, 0); g.lineTo(-C * 0.1, -C * 0.16); g.lineTo(-C * 0.1, C * 0.16); g.closePath(); g.stroke(); g.fill(); g.restore();
  }
  // Замок игрока: ворота стоят там, где кончается дорога (GATE_Y); точка ворот в спрайте — META castle_<мир>.gate
  drawBase(g, C, now) {
    // ворота мира (gate_<мир>, тот же ракурс, что у башен); старый замок — запасной вариант
    const W = this.level.world.id, gim = img(`img/level/gate_${W}.webp`), cim = ok(gim) ? gim : img(`img/level/castle_${W}.webp`), gkey = ok(gim) ? 'gate' : 'castle', hurt = 1 - this.lives / this.maxLives;
    const gx = 4.5 * C, gy = GATE_Y * K * C;
    if (ok(cim)) {
      const a = cim.naturalWidth / cim.naturalHeight;
      let w = (a > 1.4 ? (gkey === 'gate' ? 4.8 : 5.6) : 4.2) * C, hgt = w / a; if (hgt > 3.1 * C) { hgt = 3.1 * C; w = hgt * a; }
      const gate = META[`${gkey}_${W}`]?.gate || [0.5, 0.86], x0 = gx - gate[0] * w, y0 = gy - gate[1] * hgt;
      g.drawImage(cim, x0, y0, w, hgt);
      if (hurt > 0.3) for (let i = 0; i < 3; i++) { const k = (now * 0.5 + i * 0.33) % 1; g.fillStyle = `rgba(80,80,80,${(1 - k) * hurt * 0.55})`; g.beginPath(); g.arc(gx + (i - 1) * w * 0.3, y0 + hgt * (0.25 - k * 0.35), C * (0.2 + k * 0.35), 0, TAU); g.fill(); }
      return;
    }
    const x = gx, y = gy + C * 0.5;
    g.save(); g.translate(x, y);
    g.strokeStyle = '#14193a'; g.lineWidth = C * 0.06;
    const tower = (wx, w, h, roof) => {
      g.fillStyle = '#d9d2c3'; rr(g, wx - w / 2, -h, w, h + C * 0.4, C * 0.1); g.fill(); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 3; i++) { rr(g, wx - w / 2 + C * 0.08, -h + C * 0.15 + i * C * 0.28, w * 0.35, C * 0.18, 3); g.fill(); }
      if (roof) { g.fillStyle = '#e8424f'; g.beginPath(); g.moveTo(wx - w * 0.62, -h); g.lineTo(wx, -h - C * 0.7); g.lineTo(wx + w * 0.62, -h); g.closePath(); g.fill(); g.stroke(); }
    };
    tower(0, C * 1.6, C * 0.55, false);
    tower(-C * 1.35, C * 0.8, C * 0.95, true); tower(C * 1.35, C * 0.8, C * 0.95, true);
    g.fillStyle = '#7a4a24'; rr(g, -C * 0.42, -C * 0.4, C * 0.84, C * 0.8, C * 0.4); g.fill(); g.stroke();
    if (hurt > 0.3) for (let i = 0; i < 2; i++) { const k = (now * 0.6 + i * 0.5) % 1; g.fillStyle = `rgba(90,90,90,${(1 - k) * hurt * 0.5})`; g.beginPath(); g.arc(C * (0.8 - i * 1.6), -C * (1 + k * 1.2), C * (0.15 + k * 0.25), 0, TAU); g.fill(); }
    g.restore();
  }
  drawDecor(g, d, C) {
    const im = decorImg(this.level.world.id), s = C * 1.05 * d.s, x = (d.x + 0.5) * C, y = (d.y + 0.95) * C;
    if (ok(im)) { const fw = im.naturalWidth / 6; g.drawImage(im, d.v * fw, 0, fw, im.naturalHeight, x - s / 2, y - s, s, s); return; }
    const W = this.level.world.id;
    g.strokeStyle = '#14193a'; g.lineWidth = C * 0.05;
    if (d.v % 2) { g.fillStyle = W === 'glacier' ? '#e9f6ff' : W === 'canyon' ? '#c97b4a' : '#9aa3ad'; g.beginPath(); g.ellipse(x, y - s * 0.22, s * 0.32, s * 0.24, 0, 0, TAU); g.fill(); g.stroke(); }
    else { g.fillStyle = W === 'glacier' ? '#2e7d5b' : W === 'canyon' ? '#4caf50' : '#2fa84f'; g.beginPath(); g.arc(x, y - s * 0.45, s * 0.3, 0, TAU); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - s * 0.1, y - s * 0.55, s * 0.09, 0, TAU); g.fill(); }
  }
  drawTower(g, t, C, now) {
    // башня стоит прямо на земле: основание спрайта — чуть ниже центра клетки, без теней
    const R = RARITIES[t.def.rarity], x = t.x * C, y = (t.y + 0.3) * C;
    // здание неподвижно (без отдачи и «дыхания»); только короткий отскок при постройке
    const im = towerImg(t.id), S = this.spriteSize(t) * (1 + t.pop * 0.12 * Math.sin(t.pop * 12));
    g.save(); g.translate(x, y);
    if (ok(im)) {
      const m = t.meta, n = m?.cols || 4, rows = m?.rows || 1, fw = im.naturalWidth / n, fh = im.naturalHeight / rows;
      let fi;
      if (m?.kind === 'dirpose') { const p = this.dirPose(t); fi = p.row * n + p.col; if (p.mirror) g.scale(-1, 1); }
      else if (m?.kind === 'dir8') fi = this.dirFrame(t);
      else fi = t.fireT > 0 ? 3 : (t.windup && t.cd > 0) ? 2 : 0;   // в покое — один неподвижный кадр (без мигания)
      const r = Math.floor(fi / n), c = fi % n;
      g.drawImage(im, c * fw, r * fh, fw, fh, -S / 2, -S, S, S);
      if (t.frozen > 0) { g.globalAlpha = 0.55; g.drawImage(tinted(im, '#bdf3ff'), c * fw, r * fh, fw, fh, -S / 2, -S, S, S); g.globalAlpha = 1; }
    } else {
      g.fillStyle = R.color; g.strokeStyle = '#14193a'; g.lineWidth = C * 0.06;
      rr(g, -S * 0.28, -S * 0.6, S * 0.56, S * 0.56, S * 0.12); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `900 ${S * 0.24}px Rubik`; g.textAlign = 'center'; g.fillText(t.def.name[0], 0, -S * 0.25);
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -S * 0.4); g.lineTo(Math.cos(t.face) * S * 0.35, -S * 0.4 + Math.sin(t.face) * S * 0.25); g.stroke();
    }
    g.restore();
    if (t.flameOn && t.def.proj === 'flame') { const [mx, my] = this.muzzle(t); g.fillStyle = 'rgba(255,200,60,.9)'; g.beginPath(); g.arc(mx * C, my * C, C * rand(0.1, 0.17), 0, TAU); g.fill(); }
    if (t.flv) { g.font = `900 ${C * 0.28}px Rubik`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#14193a'; const s = '★'.repeat(t.flv + 1); g.strokeText(s, x, y + C * 0.14); g.fillStyle = '#ffdd33'; g.fillText(s, x, y + C * 0.14); }
    if (t.def.energy) { const k = (now * 0.8 + t.x) % 1, yy = y - C * (1.25 + k * 0.5); g.globalAlpha = 1 - k; icon(g, 'ic_mana', x, yy, C * 0.36, () => { g.fillStyle = '#3aa8ff'; g.beginPath(); g.arc(x, yy, C * 0.1, 0, TAU); g.fill(); }); g.globalAlpha = 1; }
    if (t.frozen > 0) { g.strokeStyle = '#e1f5ff'; g.lineWidth = 3; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(x - Math.cos(a) * C * 0.15, y - C * 1.35 - Math.sin(a) * C * 0.15); g.lineTo(x + Math.cos(a) * C * 0.15, y - C * 1.35 + Math.sin(a) * C * 0.15); g.stroke(); } }
  }
  // кадр монстра: ряд по направлению (0 вниз, 1 вверх, 2 вбок), колонка — фаза шага
  enemyFrame(e) { return { row: e.face, col: Math.floor(e.anim) % 4, flip: e.face === 2 && e.flip }; }
  drawSprite(g, kind, row, col, x, y, s, flip, opt = {}) {
    const def = ENEMY_DEFS[kind], im = enemyImg(def.sprite || kind);
    if (!ok(im)) return false;
    const fw = im.naturalWidth / 4, fh = im.naturalHeight / 4;
    g.save(); g.translate(x, y); if (opt.rot) g.rotate(opt.rot); g.scale((flip ? -1 : 1) * (opt.sx || 1), opt.sy || 1);
    if (opt.alpha != null) g.globalAlpha = opt.alpha;
    g.drawImage(opt.tint ? tinted(im, opt.tint) : im, col * fw, row * fh, fw, fh, -s / 2, -s, s, s);
    if (opt.over) { g.globalAlpha = opt.over[1]; g.drawImage(tinted(im, opt.over[0]), col * fw, row * fh, fw, fh, -s / 2, -s, s, s); }
    g.restore();
    return true;
  }
  drawEnemy(g, e, C, now) {
    const d = e.d, s = d.size * C * ESZ * (ENEMY_FIT[d.sprite || e.kind] || 1) * (e.shrink > 0 ? 0.65 : 1) * (1 + Math.min(e.fat, 5) * 0.07), x = e.x * C;
    let y = e.y * C + C * FOOT;
    if (e.under) {     // крот под землёй: бегущий холмик
      g.fillStyle = '#7b5a43'; g.strokeStyle = '#14193a'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y - C * 0.08, C * 0.3, C * 0.15 + Math.sin(now * 20) * 2, 0, Math.PI, TAU); g.fill(); g.stroke();
      return;
    }
    if (d.flying) y += Math.sin(now * 6 + e.id * 10) * C * 0.08 - C * 0.5;
    const finishable = e.hp / e.max <= this.mod.finish && !d.boss;
    const { row, col, flip } = this.enemyFrame(e);
    const bob = Math.abs(Math.sin(e.anim * Math.PI / 2)) * 0.05;
    const sx = (1 + e.hitSq * 0.18) * (1 - e.turnT * 1.5) * (1 + bob * 0.3), sy = (1 - e.hitSq * 0.14) * (1 + bob);
    if (e.frog) { this.drawFrog(g, x, y, s * 0.7, flip, now, e); }
    else {
      let rot = 0, rrow = row, rcol = col;
      if (e.rollT > 0) { rot = now * 14 * (flip ? -1 : 1); rrow = 2; rcol = 0; }
      if (d.slide && (e.slideT % 3) < 1.4) { rot = (flip ? -1 : 1) * 0.5; rcol = 1; }
      if (e.eat > 0) { rcol = Math.floor(now * 8) % 2; }
      if (e.spin > 0) rot = now * 20;
      if (e.bubbleT > 0) { y -= C * 0.6; rcol = 1; }
      const opt = { sx, sy, rot, alpha: e.phased ? 0.32 : null };
      if (e.flash > 0) opt.over = ['#ffffff', e.flash * 0.75];
      else if (e.zapT > 0) opt.over = ['#b9a7ff', 0.6];
      else if (e.burnT > 0 && e.grease > 0) opt.over = ['#ff7b00', 0.25];
      else if (e.melt > 0) opt.over = ['#9cff57', 0.25];
      else if (e.rage) opt.over = ['#ff3b3b', 0.2 + Math.sin(now * 10) * 0.1];
      if (finishable) { g.save(); g.shadowColor = '#ff2d7a'; g.shadowBlur = C * 0.45; }
      if (!this.drawSprite(g, e.kind, rrow, rcol, x, y, s, flip, opt)) this.drawBlob(g, e, x, y, s, now);
      if (finishable) g.restore();
    }
    if (e.zapT > 0) e.zapT -= 1 / 60;
    // статусы
    if (e.bubbleT > 0) { g.save(); g.globalAlpha = 0.55; const gr = g.createRadialGradient(x - s * 0.15, y - s * 0.65, 2, x, y - s * 0.45, s * 0.55); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, 'rgba(225,190,231,.4)'); gr.addColorStop(1, 'rgba(129,212,250,.7)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y - s * 0.45, s * 0.55, 0, TAU); g.fill(); g.restore(); }
    if (e.charging > 0) { g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 3; i++) g.fillRect(x - (e.flip ? -1 : 1) * s * (0.4 + i * 0.12), y - s * (0.3 + i * 0.15), s * 0.25, 2); }
    if (e.frozen > 0 || e.stop > 0) { g.fillStyle = e.stop > 0 ? 'rgba(125,249,255,.3)' : 'rgba(190,240,255,.55)'; g.strokeStyle = '#fff'; g.lineWidth = 2.5; rr(g, x - s * 0.33, y - s * 0.9, s * 0.66, s * 0.9, s * 0.14); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x - s * 0.25, y - s * 0.82, s * 0.07, s * 0.4); }
    if (e.grease > 0) for (let i = 0; i < 3; i++) { const k = (now * 1.5 + i * 0.33) % 1; g.fillStyle = '#ffd54f'; g.beginPath(); g.ellipse(x + (i - 1) * s * 0.18, y - s * (0.75 - k * 0.6), s * 0.04, s * 0.07, 0, 0, TAU); g.fill(); }
    if (e.melt > 0) for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(156,255,87,.85)'; g.beginPath(); g.arc(x + rand(-0.25, 0.25) * s, y - rand(0.1, 0.8) * s, s * 0.05, 0, TAU); g.fill(); }
    if (e.burnT > 0) for (let i = 0; i < 2; i++) { g.fillStyle = `rgba(255,${120 + Math.random() * 100},30,.9)`; g.beginPath(); g.arc(x + rand(-0.25, 0.25) * s, y - rand(0.3, 0.9) * s, s * 0.06, 0, TAU); g.fill(); }
    if (e.poisonT > 0) for (let i = 0; i < 3; i++) { const k = (now * 1.2 + i * 0.33) % 1; g.fillStyle = `rgba(160,255,80,${1 - k})`; g.beginPath(); g.arc(x + (i - 1) * s * 0.15, y - s * (0.8 + k * 0.4), s * 0.04, 0, TAU); g.fill(); }
    if (e.stun > 0 || e.panic > 0) { g.fillStyle = '#ffdd33'; for (let i = 0; i < 3; i++) { const a = now * 6 + i * 2.1; g.beginPath(); g.arc(x + Math.cos(a) * s * 0.28, y - s * 1.02 + Math.sin(a) * s * 0.08, s * 0.05, 0, TAU); g.fill(); } }
    if (e.eat > 0) { const cy = y - s * 0.75 - Math.abs(Math.sin(now * 10)) * 4; g.fillStyle = '#ff5d8f'; g.strokeStyle = '#14193a'; g.lineWidth = 2; g.beginPath(); g.ellipse(x + s * 0.28, cy, s * 0.08, s * 0.055, 0, 0, TAU); g.fill(); g.stroke(); }
    if (VIEW.hp && (e.hp < e.max || d.boss)) {     // компактная полоска: уже и тоньше
      const w = Math.max(C * 0.46, s * 0.46), bh = C * 0.085, hx = x - w / 2, hy = y - s - C * 0.04, k = Math.max(0, e.hp / e.max);
      g.fillStyle = '#14193a'; rr(g, hx - 1.5, hy - 1.5, w + 3, bh + 3, 4); g.fill();
      g.fillStyle = finishable ? '#ff2d7a' : k > 0.5 ? '#5fd35a' : '#ffb020'; rr(g, hx, hy, Math.max(2, w * k), bh, 3); g.fill();
    }
    if (finishable) {
      const p = 1 + Math.sin(now * 12) * 0.12, r = s * 0.5 * p, cy = y - s * 0.45;
      g.strokeStyle = '#ff2d7a'; g.lineWidth = C * 0.07; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.stroke();
      g.beginPath(); for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2 + now * 2; g.moveTo(x + Math.cos(ang) * r * 0.75, cy + Math.sin(ang) * r * 0.75); g.lineTo(x + Math.cos(ang) * r * 1.25, cy + Math.sin(ang) * r * 1.25); } g.stroke();
      icon(g, 'ic_fist', x, y - s - C * 0.32, C * 0.5, () => { g.font = `900 ${C * 0.4}px Rubik`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#14193a'; g.strokeText('!', x, y - s - C * 0.2); g.fillStyle = '#ff2d7a'; g.fillText('!', x, y - s - C * 0.2); });
    }
  }
  drawBlob(g, e, x, y, s, now) {
    const d = e.d;
    g.save(); g.translate(x, y); if (e.face === 2 && e.flip) g.scale(-1, 1);
    g.fillStyle = e.flash > 0.5 ? '#fff' : d.color; g.strokeStyle = '#14193a'; g.lineWidth = s * 0.05;
    g.beginPath(); g.ellipse(0, -s * 0.38, s * 0.34, s * 0.36, 0, 0, TAU); g.fill(); g.stroke();
    if (e.face !== 1) { g.fillStyle = '#fff'; for (const ex of [-0.11, 0.11]) { g.beginPath(); g.arc(ex * s + (e.face === 2 ? s * 0.08 : 0), -s * 0.45, s * 0.08, 0, TAU); g.fill(); } g.fillStyle = '#14193a'; for (const ex of [-0.1, 0.12]) { g.beginPath(); g.arc(ex * s + (e.face === 2 ? s * 0.1 : 0), -s * 0.45, s * 0.04, 0, TAU); g.fill(); } }
    if (d.flying) { g.fillStyle = d.color; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * s * 0.4, -s * 0.5, s * 0.2, s * 0.09, sx * Math.sin(now * 20) * 0.5, 0, TAU); g.fill(); g.stroke(); } }
    g.restore();
  }
  drawFrog(g, x, y, s, flip, now, e) {
    const hop = Math.abs(Math.sin(now * 5 + e.id * 9)) * s * 0.25;
    if (fxDraw(g, 'frog', hop > s * 0.05 ? 1 : 0, x, y - hop - s * 0.5, s * 1.1, flip)) return;   // 0 — сидит, 1 — прыжок
    g.save(); g.translate(x, y - hop); if (flip) g.scale(-1, 1);
    g.fillStyle = e.flash > 0.5 ? '#fff' : '#5fd35a'; g.strokeStyle = '#14193a'; g.lineWidth = s * 0.06;
    g.beginPath(); g.ellipse(0, -s * 0.3, s * 0.42, s * 0.3, 0, 0, TAU); g.fill(); g.stroke();
    for (const ex of [-0.18, 0.18]) { g.fillStyle = '#5fd35a'; g.beginPath(); g.arc(ex * s, -s * 0.58, s * 0.14, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex * s, -s * 0.6, s * 0.09, 0, TAU); g.fill(); g.fillStyle = '#14193a'; g.beginPath(); g.arc(ex * s + s * 0.02, -s * 0.6, s * 0.045, 0, TAU); g.fill(); }
    g.strokeStyle = '#14193a'; g.beginPath(); g.arc(0, -s * 0.32, s * 0.16, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(-s * 0.12, -s * 0.72); g.lineTo(-s * 0.06, -s * 0.84); g.lineTo(0, -s * 0.74); g.lineTo(s * 0.06, -s * 0.84); g.lineTo(s * 0.12, -s * 0.72); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  drawCorpse(g, c, C, now) {
    const k = c.t / c.life, s = c.d.size * C * ESZ * (1 + Math.min(c.fat || 0, 5) * 0.07), x = c.x * C, y = c.y * C + C * FOOT - c.h * C;
    const flip = c.flip && c.face === 2;
    const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    if (c.frog) { g.globalAlpha = 1 - k; this.drawFrog(g, x, y, s * 0.7, flip, now, { id: 0, flash: 0 }); g.globalAlpha = 1; return; }
    const draw = (row, col, opt) => this.drawSprite(g, c.kind, row, col, x, y, s, flip, opt) || this.drawBlob(g, { d: c.d, face: c.face, flip: c.flip, flash: 0 }, x, y, s * (opt?.sy || 1), now);
    // тень остаётся на земле
    switch (c.style) {
      case 'ko': case 'pin': { const f = Math.min(3, Math.floor(k * 5)); draw(3, f, { rot: c.style === 'ko' ? c.rot : 0, alpha: fade }); if (k < 0.6) this.stars(g, x, y - s * 0.95, s, now); break; }
      case 'pieces': case 'boss': {
        // куски кадра монстра: каждый — свой прямоугольник листа, лежит на земле в своей точке
        const im = enemyImg(c.d.sprite || c.kind); if (!ok(im)) break;
        const fw = im.naturalWidth / 4, fh = im.naturalHeight / 4, row = c.face, col = c.frame;
        for (const k of c.chunks) {
          const cw = fw / k.cols, ch = fh / k.rows, pw = s / k.cols, ph = s / k.rows;
          const px = k.x * C, py = c.y * C + (k.y - c.y) * K * C + C * FOOT - k.h * C;
          g.save(); g.globalAlpha = fade; g.translate(px, py); g.rotate(k.rot); if (flip) g.scale(-1, 1);
          g.drawImage(im, col * fw + k.q * cw, row * fh + k.r * ch, cw, ch, -pw / 2, -ph / 2, pw * 1.02, ph * 1.02);
          g.restore();
        }
        break;
      }
      case 'sink': {
        // засасывает в жирную лужу: спрайт уходит вниз за линию земли, пузыри
        const m = Math.min(1, k * 1.05), gy = c.y * C + C * FOOT;
        g.fillStyle = `rgba(214,170,40,${0.75 * fade})`; g.beginPath(); g.ellipse(x, gy, s * (0.32 + m * 0.12), s * 0.12, 0, 0, TAU); g.fill();
        g.fillStyle = `rgba(255,230,120,${0.6 * fade})`; g.beginPath(); g.ellipse(x - s * 0.08, gy - s * 0.02, s * 0.12, s * 0.04, 0, 0, TAU); g.fill();
        g.save(); g.beginPath(); g.rect(x - s, gy - s * 2, s * 2, s * 2 + s * 0.02); g.clip();
        g.translate(0, m * s * 0.95); draw(m < 0.4 ? c.face : 3, m < 0.4 ? c.frame : 2, { over: ['#ffd54f', 0.25 + m * 0.4], rot: Math.sin(now * 14) * 0.08 * (1 - m) });
        g.restore();
        for (let i = 0; i < 3; i++) { const b = (now * 1.6 + i * 0.33) % 1; g.strokeStyle = `rgba(255,240,170,${(1 - b) * fade})`; g.lineWidth = 2; g.beginPath(); g.arc(x + (i - 1) * s * 0.15, gy - b * s * 0.25, s * 0.03 * (1 + b), 0, TAU); g.stroke(); }
        break;
      }
      case 'slip': draw(3, Math.min(3, 2 + Math.floor(k * 2)), { rot: c.rot * 0.2, alpha: fade }); break;
      case 'squash': draw(3, 3, { sx: 1 + Math.min(1, k * 6) * 0.5, sy: 1 - Math.min(1, k * 6) * 0.8, alpha: fade }); break;
      case 'shatter': if (k < 0.25) { draw(c.face, c.frame, { over: ['#bdf3ff', 0.7] }); g.strokeStyle = '#fff'; g.lineWidth = 3; rr(g, x - s * 0.34, y - s * 0.92, s * 0.68, s * 0.92, s * 0.12); g.stroke(); } break;
      case 'melt': { const m = Math.min(1, k * 1.2); g.fillStyle = `rgba(156,255,87,${0.6 * fade})`; g.beginPath(); g.ellipse(x, y - C * 0.02, s * (0.2 + m * 0.35), s * (0.06 + m * 0.08), 0, 0, TAU); g.fill(); draw(c.face, c.frame, { sx: 1 + m * 0.7, sy: Math.max(0.05, 1 - m), over: ['#9cff57', 0.2 + m * 0.6], alpha: fade }); break; }
      case 'burst': { const inf = Math.min(1, k / 0.85); if (k < 0.87) draw(c.face, c.frame, { sx: 1 + inf * 0.7 + Math.sin(now * 40) * 0.05 * inf, sy: 1 + inf * 0.6, over: ['#ff7ac8', inf * 0.35] }); break; }
      case 'char': { if (k < 0.55) draw(c.face, c.frame, { over: ['#2a1a12', Math.min(1, k * 4)] }); else { const a = (k - 0.55) / 0.45; g.fillStyle = `rgba(60,50,45,${1 - a})`; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(x + (i - 4) * s * 0.07, y - s * 0.1 + a * s * 0.08 - ((i * 37) % 7) * s * 0.03 * (1 - a), s * 0.06, 0, TAU); g.fill(); } }
        if (k < 0.6) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x - s * 0.06, y - s * 0.62, s * 0.035, 0, TAU); g.arc(x + s * 0.08, y - s * 0.62, s * 0.035, 0, TAU); g.fill(); }
        if (Math.random() < 0.3) this.fx.push({ kind: 'smoke', x: c.x + rand(-0.2, 0.2), y: c.y - 0.6, t: 0, life: 0.6 }); break; }
      case 'electro': {
        const on = Math.floor(now * 18) % 2 === 0, jit = rand(-2, 2);
        g.save(); g.translate(jit, 0);
        if (on && k < 0.75) { draw(c.face, c.frame, { tint: '#2b1d6b' }); this.skeleton(g, x, y, s); } else if (k < 0.75) draw(c.face, c.frame, { over: ['#b9a7ff', 0.5] });
        else { g.globalAlpha = fade; draw(3, 3, { over: ['#2a1a12', 0.8] }); g.globalAlpha = 1; }
        g.restore(); break; }
      case 'puff': { g.globalAlpha = 1 - k; draw(c.face, c.frame, { sx: 1 - k * 0.5, sy: 1 - k * 0.5 }); g.globalAlpha = 1; break; }
    }
  }
  stars(g, x, y, s, now) { g.fillStyle = '#ffdd33'; g.strokeStyle = '#14193a'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { const a = now * 7 + i * 2.1, sx = x + Math.cos(a) * s * 0.3, sy = y + Math.sin(a) * s * 0.08, r = s * 0.06; g.beginPath(); for (let k = 0; k < 10; k++) { const rr2 = k % 2 ? r * 0.45 : r, an = k * Math.PI / 5 - Math.PI / 2; g.lineTo(sx + Math.cos(an) * rr2, sy + Math.sin(an) * rr2); } g.closePath(); g.fill(); g.stroke(); } }
  skeleton(g, x, y, s) {
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = Math.max(2, s * 0.04); g.lineCap = 'round';
    g.beginPath(); g.arc(x, y - s * 0.68, s * 0.13, 0, TAU); g.fill();
    g.fillStyle = '#2b1d6b'; g.beginPath(); g.arc(x - s * 0.05, y - s * 0.69, s * 0.035, 0, TAU); g.arc(x + s * 0.05, y - s * 0.69, s * 0.035, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x, y - s * 0.55); g.lineTo(x, y - s * 0.2); for (let i = 0; i < 3; i++) { const yy = y - s * (0.5 - i * 0.09); g.moveTo(x - s * 0.14, yy); g.lineTo(x + s * 0.14, yy); }
    g.moveTo(x, y - s * 0.2); g.lineTo(x - s * 0.1, y - s * 0.02); g.moveTo(x, y - s * 0.2); g.lineTo(x + s * 0.1, y - s * 0.02);
    g.moveTo(x - s * 0.14, y - s * 0.5); g.lineTo(x - s * 0.24, y - s * 0.3); g.moveTo(x + s * 0.14, y - s * 0.5); g.lineTo(x + s * 0.24, y - s * 0.3); g.stroke();
  }
  drawDragon(g, t, C, now) {
    const [dx, dy] = t.drag, x = dx * C, y = (dy - 1.0) * C, s = C * 0.9, flap = Math.sin(now * 14);
    const dir = Math.cos(t.orb + Math.PI / 2) < 0 ? -1 : 1;
    // спрайт: 4 кадра взмаха (~2.5 взмаха/с), лёгкое покачивание по высоте в такт; при огне — наклон носом вниз
    if (fxDraw(g, 'dragon', Math.floor(now * 10 + t.x), x, y - flap * C * 0.04, C * 1.25, dir < 0, t.flameOn ? dir * 0.18 : 0)) return;
    g.save(); g.translate(x, y); g.scale(dir, 1); g.strokeStyle = '#14193a'; g.lineWidth = s * 0.05;
    g.fillStyle = '#ff7043'; for (const sy of [-1, 1]) { g.beginPath(); g.moveTo(-s * 0.05, -s * 0.05); g.quadraticCurveTo(-s * 0.2, sy * s * (0.4 + flap * 0.2) - s * 0.1, s * 0.25, -s * 0.1 + sy * s * 0.05); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = '#e53935'; g.beginPath(); g.ellipse(0, 0, s * 0.3, s * 0.18, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(s * 0.3, -s * 0.08, s * 0.14, s * 0.11, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(s * 0.34, -s * 0.12, s * 0.04, 0, TAU); g.fill(); g.fillStyle = '#14193a'; g.beginPath(); g.arc(s * 0.35, -s * 0.12, s * 0.02, 0, TAU); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(s * 0.26, -s * 0.18); g.lineTo(s * 0.22, -s * 0.3); g.lineTo(s * 0.3, -s * 0.2); g.fill();
    g.restore();
  }
  drawUnit(g, u, C, now) {
    const x = u.x * C, y = u.y * C + C * FOOT;
    if (u.kind === 'tornado') {
      g.save(); g.globalAlpha = Math.min(1, u.life * 2);
      if (fxDraw(g, 'tornado', Math.floor(now * 12), x, y - C * 0.7, C * 1.5)) { g.restore(); return; }
      for (let i = 0; i < 6; i++) { const k = i / 6, w = C * (0.15 + k * 0.45), yy = y - k * C * 1.3; g.strokeStyle = `rgba(200,235,255,${0.9 - k * 0.4})`; g.lineWidth = C * 0.08; g.beginPath(); g.ellipse(x + Math.sin(now * 8 + i) * C * 0.08, yy, w, w * 0.3, 0, now * 10 + i, now * 10 + i + 4.5); g.stroke(); }
      g.restore(); return;
    }
    // курица
    const hop = Math.abs(Math.sin(u.t * 18)) * C * 0.08, s = C * 0.36, dir = u.face > 0 ? -1 : 1;
    if (fxDraw(g, 'hen', Math.floor(u.t * 12), x, y - hop - C * 0.26, C * 0.6, dir > 0, u.peck > 0 ? dir * -0.45 : 0)) return;
    g.save(); g.translate(x, y - hop); g.scale(dir, 1); if (u.peck > 0) g.rotate(0.5);
    g.strokeStyle = '#14193a'; g.lineWidth = 2;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, -s * 0.5, s * 0.45, s * 0.38, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.arc(-s * 0.3, -s * 0.9, s * 0.24, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#e53935'; g.beginPath(); g.arc(-s * 0.3, -s * 1.16, s * 0.1, 0, TAU); g.fill();
    g.fillStyle = '#ffb300'; g.beginPath(); g.moveTo(-s * 0.52, -s * 0.92); g.lineTo(-s * 0.72, -s * 0.86); g.lineTo(-s * 0.52, -s * 0.8); g.fill(); g.stroke();
    g.fillStyle = '#14193a'; g.beginPath(); g.arc(-s * 0.36, -s * 0.94, s * 0.04, 0, TAU); g.fill();
    g.strokeStyle = '#14193a'; g.beginPath(); g.moveTo(-s * 0.45, -s * 1.02); g.lineTo(-s * 0.25, -s * 0.98); g.stroke();
    g.fillStyle = '#90a4ae'; g.beginPath(); g.arc(-s * 0.3, -s * 1.02, s * 0.2, Math.PI, TAU); g.fill(); g.stroke();
    g.restore();
  }
  drawTrap(g, tr, C) {
    const k = tr.k, x = (tr.sx + (tr.x - tr.sx) * k) * C, y = (tr.sy + (tr.y - tr.sy) * k - Math.sin(k * Math.PI) * 0.9) * C, s = C * 0.3;
    if (fxDraw(g, 'trap', tr.open ? 0 : 1, x, y - s * 0.2, s * 2.6)) return;   // кадр 0 — раскрыт, 1 — захлопнут
    g.save(); g.translate(x, y); g.strokeStyle = '#14193a'; g.lineWidth = 2; g.fillStyle = '#90a4ae';
    g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#cfd8dc';
    const open = tr.open ? 1 : 0;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * s * 0.25, -s * 0.05 * open); g.lineTo(i * s * 0.25 + s * 0.08, -s * (0.25 + 0.15 * open)); g.lineTo(i * s * 0.25 + s * 0.16, -s * 0.05 * open); g.fill(); }
    g.restore();
  }
  drawCandy(g, c, C, now) {
    const k = c.k, x = (c.sx + (c.x - c.sx) * k) * C, y = (c.sy + (c.y - c.sy) * k - Math.sin(k * Math.PI) * 1.2) * C, s = C * 0.32;
    g.save(); g.translate(x, y); g.rotate(k < 1 ? k * 12 : Math.sin(now * 3) * 0.1);
    if (fxDraw(g, 'candy', c.kind, 0, 0, s * 1.5)) { g.restore(); return; }
    g.strokeStyle = '#14193a'; g.lineWidth = 2;
    const col = ['#ff5d8f', '#7df9ff', '#ffd23f', '#8dff5a'][c.kind];
    if (c.kind % 2) { g.fillStyle = '#fff'; g.fillRect(-s * 0.06, 0, s * 0.12, s * 0.6); g.strokeRect(-s * 0.06, 0, s * 0.12, s * 0.6); g.fillStyle = col; g.beginPath(); g.arc(0, 0, s * 0.4, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, s * 0.22, 0, Math.PI * 1.5); g.stroke(); }
    else { g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.28, 0, 0, TAU); g.fill(); g.stroke(); for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * s * 0.4, 0); g.lineTo(sx * s * 0.7, -s * 0.22); g.lineTo(sx * s * 0.7, s * 0.22); g.closePath(); g.fill(); g.stroke(); } }
    g.restore();
    if (k >= 1 && Math.sin(now * 6 + c.x) > 0.9) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + s * 0.5, y - s * 0.5, C * 0.04, 0, TAU); g.fill(); }
  }
  drawVines(g, v, C) {
    const e = v.e.hp > 0 ? v.e : v, x = e.x * C, y = e.y * C + C * FOOT, k = Math.min(1, v.t * 5), fade = v.t > v.life - 0.3 ? (v.life - v.t) / 0.3 : 1;
    g.globalAlpha = fade;
    // спрайт: кадры 0 ростки, 1 наполовину, 2/3 выросли (покачиваются); центр кадра чуть выше ног врага
    if (fxDraw(g, 'roots', k < 1 ? (k < 0.5 ? 0 : 1) : 2 + (Math.floor(v.t * 3) & 1), x, y - C * 0.3, C * 0.95)) { g.globalAlpha = 1; return; }
    g.strokeStyle = '#5d4037'; g.lineWidth = C * 0.08; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.3; g.beginPath(); g.moveTo(x + Math.cos(a) * C * 0.35, y + C * 0.05); g.quadraticCurveTo(x + Math.cos(a + 1) * C * 0.4, y - C * 0.3 * k, x + Math.cos(a + 2) * C * 0.15, y - C * 0.5 * k); g.stroke(); }
    g.strokeStyle = '#66bb6a'; g.lineWidth = C * 0.04; for (let i = 0; i < 4; i++) { const a = i * 1.6; g.beginPath(); g.arc(x + Math.cos(a) * C * 0.2, y - C * 0.25 * k, C * 0.06, 0, TAU); g.stroke(); }
    g.globalAlpha = 1;
  }
  drawShot(g, s, C, now) {
    const x = s.x * C, y = s.y * C;
    g.save(); g.translate(x, y); g.strokeStyle = '#14193a'; g.lineWidth = 2;
    if (s.k !== undefined) {
      const h = Math.sin(s.k * Math.PI) * ({ bomb: 2.4, sheep: 1.8 }[s.kind] || 1.1) * C;
      if (s.kind === 'barrel') {   // жир: короткий хвост капель по дуге полёта
        for (let i = 4; i >= 1; i--) {
          const kk = s.k - i * 0.045; if (kk <= 0) continue;
          const px = (s.sx + (s.ex - s.sx) * kk - s.x) * C, py = (s.sy + (s.ey - s.sy) * kk - s.y) * C - Math.sin(kk * Math.PI) * 1.1 * C, r = C * (0.1 - i * 0.017);
          g.globalAlpha = 0.9 - i * 0.18; g.fillStyle = '#96500a'; g.beginPath(); g.arc(px, py, r + 1.5, 0, TAU); g.fill();
          g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
      }
      g.translate(0, -h); g.rotate(s.rot);
      if (fxDraw(g, s.kind, 0, 0, 0, C * FX_S[s.kind])) { g.restore(); return; }
      if (s.kind === 'rock') { g.fillStyle = '#8d8d8d'; g.beginPath(); g.moveTo(C * 0.16, 0); for (let i = 1; i < 7; i++) { const a = i / 7 * TAU, r = C * (0.13 + (i % 2) * 0.04); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); }
      else if (s.kind === 'bomb') { g.fillStyle = '#263238'; g.beginPath(); g.arc(0, 0, C * 0.18, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(C * 0.12, -C * 0.14, C * 0.05 + Math.random() * 2, 0, TAU); g.fill(); }
      else if (s.kind === 'barrel') { g.fillStyle = '#a1662f'; rr(g, -C * 0.13, -C * 0.16, C * 0.26, C * 0.32, C * 0.08); g.fill(); g.stroke(); g.fillStyle = '#ffd54f'; g.fillRect(-C * 0.13, -C * 0.03, C * 0.26, C * 0.06); }
      else if (s.kind === 'acid') { g.fillStyle = '#9cff57'; g.beginPath(); g.arc(0, 0, C * 0.13, 0, TAU); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(-C * 0.04, -C * 0.04, C * 0.04, 0, TAU); g.fill(); }
      else if (s.kind === 'sheep') { g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.beginPath(); g.arc(Math.cos(a) * C * 0.12, Math.sin(a) * C * 0.1, C * 0.1, 0, TAU); g.fill(); g.stroke(); } g.beginPath(); g.arc(0, 0, C * 0.14, 0, TAU); g.fill(); g.fillStyle = '#37474f'; g.beginPath(); g.ellipse(C * 0.16, 0, C * 0.08, C * 0.07, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(C * 0.18, -C * 0.02, C * 0.02, 0, TAU); g.fill(); }
    } else if (s.kind === 'bubble') {
      const gr = g.createRadialGradient(-C * 0.06, -C * 0.06, 1, 0, 0, C * 0.2); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(206,147,216,.5)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, C * 0.2, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.stroke();
    } else if (s.kind === 'bee') {
      if (fxDraw(g, 'bee', Math.floor(now * 24 + s.wob), 0, 0, C * 0.42, s.vx < 0, Math.max(-0.5, Math.min(0.5, s.vy / (Math.abs(s.vx) + 1) * 0.4)) * (s.vx < 0 ? -1 : 1))) { g.restore(); return; }
      g.rotate(Math.atan2(s.vy, s.vx)); g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(0, 0, C * 0.09, C * 0.06, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#14193a'; g.fillRect(-C * 0.02, -C * 0.06, C * 0.03, C * 0.12);
      g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(-C * 0.01, -C * 0.07, C * 0.05, C * 0.03 * Math.abs(Math.sin(now * 60)), 0, 0, TAU); g.fill();
    } else if (s.kind === 'arrow' || s.kind === 'bolt' || s.kind === 'spear') {
      g.rotate(s.line ? Math.atan2(s.vy, s.vx) : s.ang || 0);
      if (fxDraw(g, s.kind, 0, 0, 0, C * FX_S[s.kind])) { g.restore(); return; }
      const L = { arrow: 0.32, bolt: 0.4, spear: 0.7 }[s.kind] * C, W = { arrow: 2.5, bolt: 4, spear: 6 }[s.kind];
      g.strokeStyle = '#6d4c41'; g.lineWidth = W; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
      g.fillStyle = '#cfd8dc'; g.beginPath(); g.moveTo(L / 2 + W * 2, 0); g.lineTo(L / 2 - W, -W * 1.3); g.lineTo(L / 2 - W, W * 1.3); g.closePath(); g.fill();
      g.fillStyle = '#e53935'; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(-L / 2 - W * 1.5, -W * 1.2); g.lineTo(-L / 2 + W, 0); g.lineTo(-L / 2 - W * 1.5, W * 1.2); g.fill();
    } else {
      const col = { ice: '#bdf3ff' }[s.kind] || '#fff';
      g.fillStyle = col; g.shadowColor = col; g.shadowBlur = C * 0.35; g.beginPath(); g.arc(0, 0, C * 0.12, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, C * 0.05, 0, TAU); g.fill();
    }
    g.restore();
  }
  drawZone(g, z, C, now) {
    const k = z.t / z.life, x = z.x * C, y = z.y * C, f = k > 0.8 ? (1 - k) / 0.2 : 1;
    if (z.kind === 'splat') { g.fillStyle = z.c; g.globalAlpha = 0.45 * f; g.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + z.x; g.moveTo(x + Math.cos(a) * z.r * C * 0.9 + z.r * C * 0.3, y + Math.sin(a) * z.r * C * 0.9); g.arc(x + Math.cos(a) * z.r * C * 0.9, y + Math.sin(a) * z.r * C * 0.9, z.r * C * 0.3, 0, TAU); } g.arc(x, y, z.r * C * 0.75, 0, TAU); g.fill(); g.globalAlpha = 1; return; }
    if (z.kind === 'trail') { g.fillStyle = `rgba(255,183,77,${0.35 * f})`; g.beginPath(); g.ellipse(x, y, z.r * C, z.r * C * 0.5, 0, 0, TAU); g.fill(); return; }
    if (z.kind === 'grease') { g.fillStyle = `rgba(255,213,79,${0.55 * f})`; g.beginPath(); g.ellipse(x, y, z.r * C, z.r * C * 0.6, 0, 0, TAU); g.fill(); g.fillStyle = `rgba(255,255,255,${0.4 * f})`; g.beginPath(); g.ellipse(x - z.r * C * 0.3, y - z.r * C * 0.15, z.r * C * 0.2, z.r * C * 0.08, 0, 0, TAU); g.fill(); }
    else if (z.kind === 'acid') { g.fillStyle = `rgba(120,230,60,${0.5 * f})`; g.beginPath(); g.ellipse(x, y, z.r * C, z.r * C * 0.6, 0, 0, TAU); g.fill(); for (let i = 0; i < 3; i++) { const b = (now * 2 + i * 0.37) % 1; g.strokeStyle = `rgba(200,255,150,${(1 - b) * f})`; g.lineWidth = 2; g.beginPath(); g.arc(x + (i - 1) * z.r * C * 0.4, y - b * C * 0.2, C * 0.05 * (1 + b), 0, TAU); g.stroke(); } }
    else if (z.kind === 'wool') { g.fillStyle = `rgba(255,255,255,${0.5 * f})`; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + Math.cos(i * 1.3) * z.r * C * 0.6, y + Math.sin(i * 1.3) * z.r * C * 0.35, C * 0.14, 0, TAU); g.fill(); } }
    else if (z.kind === 'time') { g.strokeStyle = `rgba(125,249,255,${1 - k})`; g.lineWidth = C * 0.12 * (1 - k); g.beginPath(); g.arc(x, y, z.r * C * (0.3 + k * 0.7), 0, TAU); g.stroke(); }
    else if (z.kind === 'ult') {
      const r = z.r * C;
      if (z.t < 0.55) { const a = z.t / 0.55; g.strokeStyle = '#ffe066'; g.lineWidth = 3; g.setLineDash([8, 8]); g.beginPath(); g.arc(x, y, r * (1.3 - a * 0.3), 0, TAU); g.stroke(); g.setLineDash([]); g.fillStyle = `rgba(255,224,102,${a * 0.3})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x - C * 0.12 * a, 0, C * 0.24 * a, y); }
      else { const b = (z.t - 0.55) / 0.55; g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,224,102,${0.9 * (1 - b)})`; g.fillRect(x - r * 0.4 * (1 - b), 0, r * 0.8 * (1 - b), y); g.restore(); }
    }
  }
  drawFx(g, f, C) {
    const k = f.t / f.life;
    switch (f.kind) {
      case 'dot': g.globalAlpha = 1 - k; g.fillStyle = f.c; g.beginPath(); g.arc(f.x * C, f.y * C, f.r * C * (1 - k * 0.5), 0, TAU); g.fill(); break;
      case 'ring': g.globalAlpha = 1 - k; g.strokeStyle = f.c; g.lineWidth = C * 0.12 * (1 - k); g.beginPath(); g.arc(f.x * C, f.y * C, f.r * C * (0.3 + k * 0.9), 0, TAU); g.stroke(); break;
      case 'flame': g.globalAlpha = 1 - k; g.fillStyle = k < 0.35 ? '#fff3b0' : k < 0.7 ? '#ff9f1c' : '#e63946'; g.beginPath(); g.arc(f.x * C, f.y * C, C * (0.08 + k * 0.2), 0, TAU); g.fill(); break;
      case 'smoke': g.globalAlpha = (1 - k) * 0.55; g.fillStyle = '#e0e0e0'; g.beginPath(); g.arc(f.x * C, (f.y - k * 0.4) * C, C * (f.big ? 0.18 + k * 0.35 : 0.06 + k * 0.12), 0, TAU); g.fill(); break;
      case 'heal': g.globalAlpha = 1 - k; g.fillStyle = '#5fd35a'; g.font = `900 ${C * 0.32}px Rubik`; g.textAlign = 'center'; g.fillText('+', f.x * C, (f.y - 0.7 - k * 0.5) * C); break;
      case 'tap': g.globalAlpha = 1 - k; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(f.x * C, f.y * C, C * (0.15 + k * 0.45), 0, TAU); g.stroke(); break;
      case 'gsplash': { const sz = C * (0.75 + k * 0.45); g.globalAlpha = 1 - k * k; if (!fxDraw(g, 'barrel', 1, f.x * C, f.y * C - sz * 0.32, sz)) { g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(f.x * C, f.y * C, sz * 0.4, 0, TAU); g.fill(); } break; }
      case 'flash': g.globalAlpha = 1 - k; g.fillStyle = f.c; g.beginPath(); g.arc(f.x * C, f.y * C, C * (0.12 + k * 0.18), 0, TAU); g.fill(); break;
      case 'boom': {
        const r = f.r * C;
        g.globalAlpha = 1 - k; g.fillStyle = k < 0.3 ? '#fff6c2' : '#ffb347'; g.beginPath(); g.arc(f.x * C, f.y * C, r * (0.4 + k * 0.7), 0, TAU); g.fill();
        g.fillStyle = '#ff6b2c'; g.globalAlpha = (1 - k) * 0.8; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr2 = r * (i % 2 ? 0.55 : 0.95) * (0.5 + k * 0.6); g.lineTo(f.x * C + Math.cos(a) * rr2, f.y * C + Math.sin(a) * rr2 * 0.75); } g.closePath(); g.fill(); break;
      }
      case 'shard': g.globalAlpha = 1 - k; g.save(); g.translate(f.x * C, f.y * C); g.rotate(f.rot); g.fillStyle = '#d6f6ff'; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(0, -f.r * C); g.lineTo(f.r * C * 0.6, f.r * C * 0.6); g.lineTo(-f.r * C * 0.6, f.r * C * 0.4); g.closePath(); g.fill(); g.stroke(); g.restore(); break;
      case 'conf': g.globalAlpha = 1 - k; g.save(); g.translate(f.x * C, f.y * C); g.rotate(f.rot); g.fillStyle = f.c; g.fillRect(-C * 0.05, -C * 0.025, C * 0.1, C * 0.05); g.restore(); break;
      case 'wool': g.globalAlpha = 1 - k; g.fillStyle = '#fff'; g.strokeStyle = '#cfd8dc'; g.beginPath(); g.arc(f.x * C, f.y * C, f.r * C, 0, TAU); g.fill(); g.stroke(); break;
      case 'feather': g.globalAlpha = 1 - k; g.save(); g.translate(f.x * C, f.y * C); g.rotate(f.rot); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, C * 0.08, C * 0.03, 0, 0, TAU); g.fill(); g.restore(); break;
      case 'slash': {
        g.save(); g.translate(f.x * C, f.y * C); g.rotate(f.a); g.globalAlpha = 1 - k;
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, C * (0.4 + k * 1.3), C * 0.08 * (1 - k), 0, 0, TAU); g.fill();
        g.rotate(Math.PI / 2); g.fillStyle = '#ff2d7a'; g.beginPath(); g.ellipse(0, 0, C * (0.3 + k), C * 0.06 * (1 - k), 0, 0, TAU); g.fill();
        g.restore(); break;
      }
    }
    g.globalAlpha = 1;
  }
}

// иконка интерфейса на холсте (или запасная фигура, пока картинки нет)
function icon(g, id, x, y, s, fallback) { const im = img(uiImg(id)); if (ok(im)) g.drawImage(im, x - s / 2, y - s / 2, s, s); else fallback?.(); }
// кадр fi ленты img/fx/<id>.webp (квадратные кадры, смотрят вправо) с опорой-центром в (x, y); false — картинки нет, рисуй заглушку
function fxDraw(g, id, fi, x, y, s, flip, rot = 0) {
  const im = fxImg(id); if (!ok(im)) return false;
  const fw = im.naturalHeight, n = Math.max(1, Math.round(im.naturalWidth / fw));
  g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flip) g.scale(-1, 1); g.drawImage(im, (fi % n) * fw, 0, fw, fw, -s / 2, -s / 2, s, s); g.restore();
  return true;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function drawBolt(g, x1, y1, x2, y2, c, w) {
  g.strokeStyle = c; g.lineWidth = w * 2; g.shadowColor = c; g.shadowBlur = 12; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x1, y1);
  const n = 7; for (let i = 1; i < n; i++) { const k = i / n; g.lineTo(x1 + (x2 - x1) * k + rand(-8, 8), y1 + (y2 - y1) * k + rand(-8, 8)); }
  g.lineTo(x2, y2); g.stroke(); g.lineWidth = w * 0.7; g.strokeStyle = '#fff'; g.stroke(); g.shadowBlur = 0;
}
