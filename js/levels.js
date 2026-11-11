// Уровни кампании. Поле 9×14 клеток; дорога — ломаная по центрам клеток [x, y].
// Точка за краем поля (-1 / 9 / y=-1) — портал врагов; все дороги кончаются у базы (4, 14) внизу.
// Сложность растёт за счёт дорог: развилки → несколько порталов → боковые входы → пересечения → 4 дороги сразу.
import { ENEMY_DEFS } from './data.js?v=20261111145957';

export const COLS = 9, ROWS = 14;

export const WORLDS = [
  { id: 'meadow',  name: 'Солнечная долина', grass: ['#7fbf55', '#76b44d'], path: ['#e6cc9a', '#ceb07c'], edge: '#a6834f', sky: '#a6d9f2', accent: '#4f9a37' },
  { id: 'canyon',  name: 'Песчаный каньон',  grass: ['#e2b06a', '#d9a560'], path: ['#bf8a58', '#ab7746'], edge: '#80532d', sky: '#f2cf9f', accent: '#c87530' },
  { id: 'glacier', name: 'Ледяной пик',      grass: ['#dde9f2', '#d1e1ec'], path: ['#9fbfd9', '#8aadcc'], edge: '#5d81a6', sky: '#c3dff0', accent: '#4a7fc9' },
];

// Каждый уровень: paths — массив дорог. Дороги с общим началом — развилка (враг выбирает случайно).
const L = (name, paths, extra = {}) => ({ name, paths, ...extra });
export const LEVELS = [
  // ── Солнечная долина: одна дорога → развилка → два портала
  L('Первая тропа',     [[[4,-1],[4,3],[1,3],[1,7],[7,7],[7,11],[4,11],[4,14]]]),
  L('Зигзаг',           [[[1,-1],[1,2],[7,2],[7,5],[1,5],[1,8],[7,8],[7,11],[3,11],[3,13],[4,13],[4,14]]]),
  L('Петля ручья',      [[[7,-1],[7,2],[1,2],[1,6],[5,6],[5,9],[1,9],[1,12],[4,12],[4,14]]]),
  L('Развилка',         [[[4,-1],[4,3],[1,3],[1,10],[4,10],[4,14]], [[4,-1],[4,3],[7,3],[7,10],[4,10],[4,14]]]),
  L('Два ручья',        [[[1,-1],[1,5],[4,5],[4,14]], [[7,-1],[7,8],[4,8],[4,14]]]),
  L('Встреча',          [[[0,-1],[0,3],[3,3],[3,7],[4,7],[4,14]], [[8,-1],[8,5],[5,5],[5,7],[4,7],[4,14]]]),
  L('Длинная змея',     [[[0,-1],[0,1],[8,1],[8,4],[0,4],[0,7],[8,7],[8,10],[0,10],[0,12],[4,12],[4,14]]]),
  L('Близнецы',         [[[1,-1],[1,6],[3,6],[3,12],[4,12],[4,14]], [[7,-1],[7,4],[5,4],[5,9],[6,9],[6,12],[4,12],[4,14]]], { boss: true }),
  // ── Песчаный каньон: боковые входы, тройные развилки, пересечения
  L('Боковой удар',     [[[-1,2],[3,2],[3,6],[6,6],[6,10],[4,10],[4,14]], [[9,8],[7,8],[7,12],[4,12],[4,14]]]),
  L('Трезубец',         [[[4,-1],[4,2],[1,2],[1,11],[4,11],[4,14]], [[4,-1],[4,6],[6,6],[6,9],[4,9],[4,14]], [[4,-1],[4,2],[7,2],[7,11],[4,11],[4,14]]]),
  L('Перекрёсток',      [[[1,-1],[1,4],[7,4],[7,9],[2,9],[2,12],[4,12],[4,14]], [[7,-1],[7,2],[4,2],[4,7],[0,7],[0,11],[2,11],[2,12],[4,12],[4,14]]]),
  L('Ворота каньона',   [[[-1,1],[3,1],[3,5],[1,5],[1,9],[4,9],[4,14]], [[9,1],[5,1],[5,5],[7,5],[7,9],[4,9],[4,14]]]),
  L('Засада',           [[[0,-1],[0,2],[8,2],[8,5],[0,5],[0,8],[8,8],[8,11],[4,11],[4,14]], [[9,10],[8,10],[8,11],[4,11],[4,14]]]),
  L('Параллели',        [[[1,-1],[1,3],[3,3],[3,6],[1,6],[1,10],[3,10],[3,12],[4,12],[4,14]], [[7,-1],[7,3],[5,3],[5,6],[7,6],[7,10],[5,10],[5,12],[4,12],[4,14]]]),
  L('Три портала',      [[[1,-1],[1,7],[4,7],[4,14]], [[4,-1],[4,2],[6,2],[6,5],[4,5],[4,14]], [[7,-1],[7,10],[4,10],[4,14]]]),
  L('Пылевая буря',     [[[4,-1],[4,1],[0,1],[0,6],[6,6],[6,10],[2,10],[2,12],[4,12],[4,14]], [[4,-1],[4,1],[8,1],[8,8],[2,8],[2,10],[2,12],[4,12],[4,14]]], { boss: true }),
  // ── Ледяной пик: 3–4 дороги, пересечения, засады с флангов
  L('Ледяные клещи',    [[[-1,3],[2,3],[2,8],[4,8],[4,14]], [[9,3],[6,3],[6,8],[4,8],[4,14]], [[4,-1],[4,8],[4,14]]]),
  L('Четыре ветра',     [[[1,-1],[1,5],[3,5],[3,9],[4,9],[4,14]], [[7,-1],[7,5],[5,5],[5,9],[4,9],[4,14]], [[-1,11],[2,11],[2,12],[4,12],[4,14]], [[9,11],[6,11],[6,12],[4,12],[4,14]]]),
  L('Двойная спираль',  [[[0,-1],[0,4],[2,4],[2,8],[0,8],[0,12],[4,12],[4,14]], [[8,-1],[8,4],[6,4],[6,8],[8,8],[8,12],[4,12],[4,14]], [[4,-1],[4,12],[4,14]]]),
  L('Лабиринт',         [[[4,-1],[4,1],[0,1],[0,5],[2,5],[2,9],[0,9],[0,13],[4,13],[4,14]], [[4,-1],[4,1],[8,1],[8,5],[6,5],[6,9],[8,9],[8,13],[4,13],[4,14]], [[4,-1],[4,7],[3,7],[3,11],[5,11],[5,13],[4,13],[4,14]]]),
  L('Скрещённые клинки',[[[-1,2],[6,2],[6,7],[2,7],[2,11],[4,11],[4,14]], [[9,4],[3,4],[3,9],[7,9],[7,12],[4,12],[4,14]], [[1,-1],[1,13],[4,13],[4,14]]]),
  L('Буран',            [[[1,-1],[1,3],[3,3],[3,6],[4,6],[4,14]], [[7,-1],[7,3],[5,3],[5,6],[4,6],[4,14]], [[-1,9],[2,9],[2,11],[4,11],[4,14]], [[9,8],[6,8],[6,12],[4,12],[4,14]]]),
  L('Великий змей',     [[[0,-1],[0,1],[8,1],[8,3],[0,3],[0,5],[8,5],[8,7],[0,7],[0,9],[8,9],[8,11],[4,11],[4,14]], [[9,6],[8,6],[8,7],[0,7],[0,9],[8,9],[8,11],[4,11],[4,14]], [[-1,10],[2,10],[2,12],[4,12],[4,14]]]),
  L('Пик Бастиона',     [[[4,-1],[4,2],[1,2],[1,6],[3,6],[3,10],[1,10],[1,12],[4,12],[4,14]], [[4,-1],[4,2],[7,2],[7,6],[5,6],[5,10],[7,10],[7,12],[4,12],[4,14]], [[-1,8],[4,8],[4,12],[4,14]], [[9,8],[4,8],[4,12],[4,14]]], { boss: true }),
];
LEVELS.forEach((l, i) => { l.idx = i + 1; l.id = String(i + 1); l.world = WORLDS[Math.floor(i / 8)]; });

// Еженедельный уровень: раскладка и мир меняются каждую ISO-неделю, враги крепче, в конце — босс.
const WEEKLY_MAPS = [21, 23, 19];
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 864e5 + 1) / 7) };
}
export function weeklyLevel() {
  const { year, week } = isoWeek();
  const base = LEVELS[WEEKLY_MAPS[(year * 53 + week) % WEEKLY_MAPS.length] - 1];
  return { ...base, id: 'weekly', idx: 20, name: 'Испытание недели', weekly: true, boss: true, hpMul: 1.35, world: WORLDS[(week) % 3], base: base.name };
}
// Секунды до понедельника 00:00 UTC
export function weeklyLeft() {
  const n = new Date(); const d = (8 - (n.getUTCDay() || 7)) % 7 || 7;
  const next = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + d);
  return Math.max(0, Math.floor((next - n) / 1000));
}

// ── Волны ──
// Какие враги открыты к уровню и их «стоимость» для бюджета волны. Монстры с world встречаются только в своём мире.
const UNLOCK = { piggy: 1, goblin: 2, bat: 3, goose: 3, slime: 4, troll: 5, boar: 6, mole: 7, snail: 8, witch: 12, bear: 14, scorpion: 9, frogshaman: 10, ghost: 11, armadillo: 12, balloon: 13, walrus: 15, penguin: 17, yeti: 18 };
const COST = { goose: 1.2, boar: 3, snail: 6, witch: 3.2, bear: 7, piggy: 1, goblin: 1.1, bat: 1.3, slime: 1.6, troll: 3.8, mole: 1.8, scorpion: 2.4, frogshaman: 2.6, ghost: 2, armadillo: 3, balloon: 3, walrus: 9, penguin: 1.4, yeti: 7 };
const BOSS = { meadow: 'king', canyon: 'hippo', glacier: 'walrusking' };

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Сложность растёт плавно: t — прогресс по кампании 0…1, рост ускоряется к концу (t²), первые уровни заметно мягче.
// Монстров меньше, но они крепче («элита»): elite ×1.25 в начале → ×1.75 в конце; за элитного дают больше маны (battle.js),
// так что доход маны прежний, а врагов на поле — меньше (легче для процессора и понятнее игроку).
export function genWaves(level) {
  const idx = level.idx, nPaths = level.paths.length;
  const portals = [...new Set(level.paths.map(p => p[0].join(',')))].length;
  const t = Math.min(1, idx / 22), elite = 1.25 + 0.5 * t;
  const count = Math.min(14, 6 + Math.floor(idx / 2.2)) + (level.weekly ? 3 : 0);
  const r = rng(idx * 7919 + (level.weekly ? 31 : 0));
  const kinds = Object.keys(UNLOCK).filter(k => UNLOCK[k] <= idx + 1 && (!ENEMY_DEFS[k].world || ENEMY_DEFS[k].world === level.world.id));
  const waves = [];
  for (let w = 0; w < count; w++) {
    const hpMul = (0.72 + idx * 0.075 + 1.5 * t * t + w * (0.05 + idx * 0.006)) * (level.hpMul || 1) * elite;
    let budget = (4 + w * (1.6 + idx * 0.05) + idx * 0.6) * (1 + (portals - 1) * 0.2) / elite;
    const groups = [];
    const pool = kinds.filter(k => w >= (UNLOCK[k] === idx + 1 ? 2 : 0));         // новый вид появляется с 3-й волны
    while (budget > 0.9) {
      const k = pool[Math.floor(r() * pool.length)];
      const n = Math.max(1, Math.min(Math.floor(budget / COST[k]), k === 'walrus' || k === 'yeti' ? 2 : k === 'troll' ? 3 : 6, 2 + Math.floor(r() * 4)));
      groups.push({ kind: k, n, path: Math.floor(r() * nPaths), gap: k === 'goblin' ? 0.55 : k === 'walrus' || k === 'yeti' ? 1.7 : 0.85 });
      budget -= n * COST[k];
    }
    if ((level.boss || level.weekly) && w === count - 1) groups.push({ kind: BOSS[level.world.id], n: 1, path: Math.floor(r() * nPaths), gap: 1 });
    if (!level.boss && idx >= 5 && w === count - 1) groups.push({ kind: idx >= 15 ? 'walrus' : 'troll', n: 1 + Math.floor(idx / 10), path: 0, gap: 2 });
    waves.push({ groups, hpMul, elite });
  }
  return waves;
}

// Клетки дороги (для запрета строительства) и декор
export function pathCells(level) {
  const s = new Set();
  for (const p of level.paths) for (let i = 0; i < p.length - 1; i++) {
    let [x, y] = p[i]; const [x2, y2] = p[i + 1];
    const dx = Math.sign(x2 - x), dy = Math.sign(y2 - y);
    for (;;) { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) s.add(x + ',' + y); if (x === x2 && y === y2) break; x += dx; y += dy; }
  }
  return s;
}
// Естественные преграды поля (как в Baalgor здания ставятся куда угодно, кроме дороги и преград):
// горы и ущелья (скалы вдоль дороги), пруды — группы клеток, валуны и деревья — одиночные клетки. Детерминированы от номера уровня.
export function obstacleCells(level) {
  const path = pathCells(level), r = rng(level.idx * 131 + 7), used = new Set(path), ponds = [], props = [];
  const free = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS - 1 && !used.has(x + ',' + y);
  // ущелье: скалы по обе стороны прямого участка дороги — монстры идут между ними
  const mountains = [], segs = [];
  for (const p of level.paths) for (let i = 0; i < p.length - 1; i++) { const [x1, y1] = p[i], [x2, y2] = p[i + 1]; if (Math.abs(x2 - x1) + Math.abs(y2 - y1) >= 4) segs.push([x1, y1, x2, y2]); }
  const inF = (x, y) => x >= 0 && x < COLS && y >= 1 && y < ROWS - 2;
  for (let tries = 0; tries < 8 && segs.length && !mountains.length; tries++) {
    const [x1, y1, x2, y2] = segs[Math.floor(r() * segs.length)], vert = x1 === x2;
    const lo = vert ? Math.min(y1, y2) : Math.min(x1, x2), hi = vert ? Math.max(y1, y2) : Math.max(x1, x2);
    const len = 2 + Math.floor(r() * 2), st = lo + 1 + Math.floor(r() * Math.max(1, hi - lo - len - 1));
    for (const side of [-1, 1]) {
      const cells = [];
      for (let k = st; k < st + len; k++) { const x = vert ? x1 + side : k, y = vert ? k : y1 + side; if (inF(x, y) && !used.has(x + ',' + y)) cells.push([x, y]); }
      if (cells.length >= 2) { cells.forEach(([x, y]) => used.add(x + ',' + y)); mountains.push(cells); }
    }
  }
  // отдельная гора 2×2 (или 3×2) на свободном месте
  for (let tries = 0; tries < 60; tries++) {
    const w = 2 + (r() < 0.35 ? 1 : 0), x0 = Math.floor(r() * (COLS - w + 1)), y0 = 1 + Math.floor(r() * (ROWS - 4)), cells = [];
    for (let y = y0; y < y0 + 2; y++) for (let x = x0; x < x0 + w; x++) cells.push([x, y]);
    if (cells.every(([x, y]) => inF(x, y) && !used.has(x + ',' + y))) { cells.forEach(([x, y]) => used.add(x + ',' + y)); mountains.push(cells); break; }
  }
  const np = 1 + Math.floor(r() * 2);
  for (let p = 0, tries = 0; p < np && tries < 60; tries++) {
    const x0 = Math.floor(r() * COLS), y0 = 1 + Math.floor(r() * (ROWS - 3));
    if (!free(x0, y0)) continue;
    const cells = [[x0, y0]], want = 3 + Math.floor(r() * 3);
    for (let i = 0; i < 30 && cells.length < want; i++) {
      const [cx, cy] = cells[Math.floor(r() * cells.length)], d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r() * 4)];
      const nx = cx + d[0], ny = cy + d[1];
      if (free(nx, ny) && !cells.some(([a, b]) => a === nx && b === ny)) cells.push([nx, ny]);
    }
    if (cells.length < 3) continue;
    cells.forEach(([x, y]) => used.add(x + ',' + y));
    ponds.push(cells); p++;
  }
  const n = 9 + Math.floor(r() * 5);
  for (let tries = 0; props.length < n && tries < 200; tries++) {
    const x = Math.floor(r() * COLS), y = Math.floor(r() * ROWS);
    if (!free(x, y)) continue;
    used.add(x + ',' + y);
    props.push({ k: x + ',' + y, x, y, v: Math.floor(r() * 6), s: 0.8 + r() * 0.3 });
  }
  const blocked = new Set([...ponds.flat(), ...mountains.flat()].map(([x, y]) => x + ',' + y).concat(props.map(p => p.k)));
  return { ponds, props, mountains, blocked };
}

export const enemyName = k => ENEMY_DEFS[k]?.name ?? k;
