// Загрузка картинок. Если файла нет (ассет ещё не сгенерирован) — рисуем процедурную заглушку.
const cache = new Map();
// поднимай при замене спрайтов боя, чтобы игроки не видели старые картинки из кэша
const ASSET_V = 9;

export function img(src) {
  let im = cache.get(src);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = src + (src.includes('?') ? '&' : '?') + 'v=' + ASSET_V;
    im.onerror = () => { im.failed = true; };
    cache.set(src, im);
  }
  return im;
}
export const ok = im => im && im.complete && im.naturalWidth > 0 && !im.failed;

export const towerImg = id => img(`img/towers/${id}.webp`);
export const cardImg = id => `img/cards/${id}.webp`;
export const enemyImg = id => img(`img/enemies/${id}.webp`);
export const decorImg = w => img(`img/decor/${w}.webp`);
// версия для ассетов, перерисованных поверх старого имени (кэш браузера/Telegram)
const UI_VER = { logo: 3 };
export const uiImg = id => `img/ui/${id}.webp${UI_VER[id] ? '?v=' + UI_VER[id] : ''}`;
// Спрайты существ и снарядов башен (img/fx/<id>.webp — лента квадратных кадров). Грузим только то, что уже нарисовано:
// остальные id рисуются процедурной заглушкой в battle.js. Новый ассет → добавить id в FX_HAVE.
export const FX_HAVE = new Set(['dragon', 'bee', 'hen', 'rock', 'bomb', 'barrel', 'acid', 'sheep', 'bolt', 'arrow', 'spear', 'candy', 'trap', 'frog', 'tornado', 'roots']);
export const TOWER_FX = { dragon: ['dragon'], beehive: ['bee'], coop: ['hen'], catapult: ['rock'], bombard: ['bomb'], grease: ['barrel'], acid: ['acid'], sheep: ['sheep'], crossbow: ['bolt'], archer: ['arrow'], ballista: ['spear'], candy: ['candy'], trapper: ['trap'], fairy: ['frog'], tornado: ['tornado'], treant: ['roots'] };
export const fxImg = id => FX_HAVE.has(id) ? img(`img/fx/${id}.webp`) : null;
export const fxSrcs = towers => towers.flatMap(t => TOWER_FX[t] || []).filter(id => FX_HAVE.has(id)).map(id => `img/fx/${id}.webp`);

export function preload(srcs) {
  return Promise.all(srcs.map(s => new Promise(res => { const im = img(s); if (im.complete) res(); else { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); } })));
}

// Метаданные листов (вид, направления, точки ствола) — img/meta.json собирает tools/build_meta.py
export const META = {};
export async function loadMeta() {
  try { Object.assign(META, await (await fetch('img/meta.json', { cache: 'no-cache' })).json()); } catch { /* ассетов ещё нет — заглушки */ }
}
