// Общие элементы интерфейса: карточка башни, окна, всплывашки, иконки.
import { TOWER_DEFS, RARITIES, CARD_LV_MULT, GRADES, combosOf } from './data.js?v=20261111110834';
import { cardImg, uiImg } from './sprites.js?v=20261111110834';
import { Sfx } from './audio.js?v=20261111110834';

export const $ = (sel, root = document) => root.querySelector(sel);
export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = n => Math.round(n).toLocaleString('ru-RU');
// коротко для плашек ресурсов: 12 345 → 12,3K, 999 999 999 → 999M
export const fmtShort = n => { n = Math.round(n); const a = Math.abs(n); if (a < 10000) return fmt(n); const [d, u] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'K']; const v = n / d; return (v >= 100 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')).toString().replace('.', ',') + u; };
// картинка-иконка из Stitch; пока файла нет — цветной кружок с буквой (не системный эмодзи)
export const ic = (id, cls = 'ic') => `<img class="${cls}" src="${uiImg(id)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'icfb',textContent:''}))">`;
// крупный рисованный значок кнопки (img/ui/bic, tools/split_icons.py): выпирает за левый торец плашки, см. .btn .bic в style.css
export const bic = (name, cls = 'bic') => `<img class="${cls}" src="img/ui/bic/${name}.webp?v=1" alt="" draggable="false">`;

// Векторные иконки характеристик (чёткие на любом размере, в стиле игры: заливка + тёмный контур)
const SV = (body, vb = '0 0 24 24') => `<svg class="si" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const O = 'stroke="#14193a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"';
export const STAT_ICONS = {
  dmg: SV(`<path d="M5 19l9.5-9.5 2-5 4-1-1 4-5 2L5 19z" fill="#e9eef5" ${O}/><path d="M4 16l4 4M6.5 17.5L3 21" fill="none" ${O}/><path d="M7 15l2 2" ${O}/>`),
  rate: SV(`<path d="M13 2L5 13h6l-2 9 9-12h-6l1-8z" fill="#ffd23f" ${O}/>`),
  range: SV(`<circle cx="12" cy="12" r="9" fill="#ff6b6b" ${O}/><circle cx="12" cy="12" r="5.5" fill="#fff" ${O}/><circle cx="12" cy="12" r="2.2" fill="#ff6b6b" ${O}/>`),
  splash: SV(`<path d="M12 2l2.2 5.2 5.6-1.8-2.6 5.1 5 3-5.6 1 .6 5.7-5.2-3.2-5.2 3.2.6-5.7-5.6-1 5-3-2.6-5.1 5.6 1.8z" fill="#ff9f1c" ${O}/><circle cx="12" cy="12.5" r="2.6" fill="#fff3b0" ${O}/>`),
  air: SV(`<path d="M3 14c3-7 9-10 18-9-2 3-4 4-7 4.5 2 .5 3 1 4 2-3 2-7 3-11 2.5L3 14z" fill="#9fe3ff" ${O}/><path d="M3 14l4 6" fill="none" ${O}/>`),
  noair: SV(`<path d="M3 14c3-7 9-10 18-9-2 3-4 4-7 4.5 2 .5 3 1 4 2-3 2-7 3-11 2.5L3 14z" fill="#8a93a8" ${O}/><path d="M4 4l16 16" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>`),
  slow: SV(`<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="#14193a" stroke-width="4.2" stroke-linecap="round"/><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="#bdf3ff" stroke-width="2" stroke-linecap="round"/>`),
  pierce: SV(`<path d="M2 12h17" stroke="#14193a" stroke-width="4" stroke-linecap="round"/><path d="M2 12h17" stroke="#c9a06a" stroke-width="2" stroke-linecap="round"/><path d="M15 7l7 5-7 5z" fill="#e9eef5" ${O}/><rect x="8" y="5" width="3" height="14" rx="1" fill="#8a93a8" ${O}/>`),
  burn: SV(`<path d="M12 22c-4.5 0-7-3-7-6.5 0-4 3-6 4-9 1 2 2 3 3 3 0-3 2-5.5 4-7.5 0 4 4 7 4 12 0 4.5-3 8-8 8z" fill="#ff7b2c" ${O}/><path d="M12 20c-2 0-3-1.3-3-3 0-2 1.5-3 2-4.5.5 1 1.2 1.5 2 1.5.5 1.5 2 2.5 2 3.5 0 1.5-1 2.5-3 2.5z" fill="#ffd23f"/>`),
  poison: SV(`<path d="M12 2c3 5 7 8.5 7 13a7 7 0 01-14 0c0-4.5 4-8 7-13z" fill="#8dff5a" ${O}/><circle cx="9.5" cy="15" r="1.6" fill="#fff"/>`),
  chain: SV(`<path d="M14 2L6 13h5l-3 9 10-13h-5l3-7z" fill="#b9a7ff" ${O}/>`),
  aura: SV(`<circle cx="12" cy="12" r="3" fill="#7df9ff" ${O}/><path d="M6 6a8.5 8.5 0 000 12M18 6a8.5 8.5 0 010 12M3 3.5a12 12 0 000 17M21 3.5a12 12 0 010 17" fill="none" ${O}/>`),
  mana: SV(`<path d="M12 2c3 5 7 8.5 7 13a7 7 0 01-14 0c0-4.5 4-8 7-13z" fill="#3aa8ff" ${O}/><path d="M9 15a3 3 0 003 3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`),
  time: SV(`<circle cx="12" cy="13" r="8.5" fill="#fff3d6" ${O}/><path d="M12 8v5l3.5 2" fill="none" ${O}/><path d="M9 2h6" ${O}/>`),
  stun: SV(`<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="#ffd23f" ${O}/>`),
  roots: SV(`<path d="M12 2v9M12 11c-3 2-5 6-8 8M12 11c3 2 5 6 8 8M12 11v10" fill="none" stroke="#14193a" stroke-width="4" stroke-linecap="round"/><path d="M12 2v9M12 11c-3 2-5 6-8 8M12 11c3 2 5 6 8 8M12 11v10" fill="none" stroke="#8d6e63" stroke-width="2" stroke-linecap="round"/>`),
  crit: SV(`<path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" fill="#ff4d6d" ${O}/>`),
};
// Свойства карты чипами: значок + короткая подпись (что делает башня, кроме урона)
export function cardTraits(d) {
  const t = [];
  if (d.type === 'tower') t.push(d.air ? ['air', 'Бьёт летающих'] : ['noair', 'Только наземных']);
  if (d.splash) t.push(['splash', `Взрыв ${d.splash} кл.`]);
  if (d.slow) t.push(['slow', `Замедляет ${Math.round(d.slow * 100)}%`]);
  if (d.freeze) t.push(['slow', `Заморозка ${Math.round(d.freeze * 100)}%`]);
  if (d.grease) t.push(['slow', 'Жир: −35% скорости']);
  if (d.pierce) t.push(['pierce', d.pierce >= 99 ? 'Пробивает всех' : `Пробивает ${d.pierce}`]);
  if (d.burn) t.push(['burn', `Поджог ${d.burn}/с`]);
  if (d.poison) t.push(['poison', `Яд ${d.poison}/с`]);
  if (d.pool) t.push(['poison', `Лужа кислоты ${d.pool}/с`]);
  if (d.chain) t.push(['chain', `Цепь на ${d.chain}`]);
  if (d.crit) t.push(['crit', `Крит ${Math.round(d.crit * 100)}%`]);
  if (d.execute) t.push(['crit', `Казнь < ${Math.round(d.execute * 100)}%`]);
  if (d.roots) t.push(['roots', `Корни ${d.rootT} с`]);
  if (d.stopT) t.push(['time', `Стоп-время ${d.stopT} с`]);
  if (d.trapT) t.push(['roots', `Капкан ${d.trapT} с`]);
  if (d.swarm) t.push(['poison', `Рой из ${d.swarm}`]);
  if (d.push) t.push(['air', 'Отбрасывает назад']);
  if (d.minRange) t.push(['range', `Мёртвая зона ${d.minRange}`]);
  if (d.aura) t.push(['aura', `Аура ${d.aura} кл.`]);
  if (d.energy) t.push(['mana', `+${d.energy} маны/с`]);
  if (d.haste) t.push(['rate', `+${Math.round(d.haste * 100)}% скорости башен`]);
  if (d.fear) t.push(['stun', `Страх −${Math.round(d.fear * 100)}%`]);
  if (d.echo) t.push(['aura', `Эхо выстрела ${Math.round(d.echo * 100)}%`]);
  return t;
}
export const traitsHTML = d => cardTraits(d).map(([i, s]) => `<span class="trait">${STAT_ICONS[i]}${esc(s)}</span>`).join('');

// Внутренняя рамка арта: веточки лозы с листьями и цветком в каждом углу окна, своя для каждой редкости (как у Magic/Берсерк).
const ORN = { common: ['#4f9a34', '#fff4c8', '#ffd23f'], magic: ['#3f8fd8', '#bfe6ff', '#ffffff'], rare: ['#3f7a2e', '#c27bff', '#ffe27a'], legendary: ['#c8901a', '#ff4d5e', '#ffe27a'], mystic: ['#5a1630', '#ff3d77', '#ffd0dd'] };
function ornSVG([vine, bloom, mid], flip) {
  const ink = '#14193a', leaf = (x, y, a) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="2.2" transform="rotate(${a} ${x} ${y})" fill="${vine}" stroke="${ink}" stroke-width=".9"/>`;
  const petals = [0, 1, 2, 3, 4].map(i => { const a = i * 1.2566 - 1.57; return `<circle cx="${(7 + Math.cos(a) * 3.4).toFixed(1)}" cy="${(7 + Math.sin(a) * 3.4).toFixed(1)}" r="3" fill="${bloom}" stroke="${ink}" stroke-width=".9"/>`; }).join('');
  const body = `<path d="M3 44 C3 22 6 10 9 7 C14 4 26 3 44 3" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/><path d="M3 44 C3 22 6 10 9 7 C14 4 26 3 44 3" fill="none" stroke="${vine}" stroke-width="1.7" stroke-linecap="round"/>`
    + leaf(20, 6.5, 15) + leaf(33, 2, -15) + leaf(6.5, 20, 75) + leaf(2, 33, 105) + petals + `<circle cx="7" cy="7" r="2.1" fill="${mid}" stroke="${ink}" stroke-width=".8"/>`;
  const t = { tl: '', tr: 'translate(46 0) scale(-1 1)', bl: 'translate(0 46) scale(1 -1)', br: 'translate(46 46) scale(-1 -1)' }[flip];
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 46"><g transform="${t}">${body}</g></svg>`)}")`;
}
for (const [r, c] of Object.entries(ORN)) document.documentElement.style.setProperty('--orn-' + r, ['tl', 'tr', 'bl', 'br'].map(f => ornSVG(c, f)).join(', '));
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.2l3 6.9 7.5.7-5.7 5 1.8 7.4L12 18.4 5.4 22.2l1.8-7.4-5.7-5 7.5-.7z"/></svg>';
// Иконка параметра: векторная; когда появятся нарисованные img/ui/st_<id>.webp — подменяются через CSS (класс stimg), без лишних 404
const statIcon = i => STAT_ICONS[i];
{ const p = new Image(); p.onload = () => document.documentElement.classList.add('stimg'); p.src = 'img/ui/st_dmg.webp'; }
// градиент «полуголубой-полусиний» для двух звёзд качества (fill: url(#gst-s1) в CSS)
if (typeof document !== 'undefined' && !document.getElementById('gst-defs')) document.body.insertAdjacentHTML('beforeend', '<svg id="gst-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="gst-s1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c8f4ff"/><stop offset=".5" stop-color="#6fd2ff"/><stop offset=".5" stop-color="#2f74ff"/><stop offset="1" stop-color="#1c48c8"/></linearGradient></defs></svg>');
export const gradeStars = g => `<span class="gst s${g}" title="${(GRADES[g] || GRADES[0]).name}">${STAR.repeat(g + 1)}</span>`;

// Карточка в стиле коллекционных карт: нарисованная рамка своей редкости (img/ui/cardframe_*, tools/card_frames.py), арт, имя на ленте, капля маны (стоимость постройки), звёзды качества (1 серая — простая, 2 — улучшенная, 3 золотые — уникальная), параметры, описание, комбинации.
export function cardHTML(cardId, { lvl = 1, grade = 0, count = 0, mini = false, big = false, listed = false, indeck = false, cost = null } = {}) {
  const d = TOWER_DEFS[cardId], R = RARITIES[d.rarity], G = GRADES[grade] || GRADES[0], m = CARD_LV_MULT[lvl] * G.mult;
  const stats = d.type === 'tower'
    ? [['dmg', 'Урон', d.dmg ? Math.round(d.dmg * m) : '—'], ['rate', 'Выстр/с', d.rate >= 1 ? d.rate.toFixed(1) : d.rate.toFixed(2)], ['range', 'Дальн.', d.range]]
    : [['aura', 'Аура', d.aura ?? '—'], [d.energy ? 'mana' : d.haste ? 'rate' : d.fear ? 'stun' : 'aura', 'Сила', d.energy ? `+${(d.energy * m).toFixed(2)}` : d.haste ? `+${Math.round(d.haste * 100)}%` : d.fear ? `−${Math.round(d.fear * 100)}%` : '—']];
  const combos = combosOf(cardId);
  const holo = d.rarity === 'legendary' || d.rarity === 'mystic' ? ' holo' : '';
  // свойства — только значками в колонке справа на арте (как в Гвинте), подсказка по наведению; обучение — отдельно
  const tics = cardTraits(d).slice(0, mini ? 3 : 5).map(([i, s]) => `<i class="tic st-${i}" title="${esc(s)}">${STAT_ICONS[i]}</i>`).join('');
  const cb = big
    ? combos.map(c => `<div><b>${esc(c.name)}</b> — с «${esc(TOWER_DEFS[c.with].name)}»${c.desc ? `: ${esc(c.desc)}` : ''}</div>`).join('')
    : combos.slice(0, 2).map(c => `<div><b>${esc(c.name)}</b> + ${esc(TOWER_DEFS[c.with].name)}</div>`).join('');
  return `<div class="card r-${d.rarity} g-${grade}${mini ? ' mini' : ''}${big ? ' big' : ''}${listed ? ' listed' : ''}${indeck ? ' indeck' : ''}${holo}" data-card="${cardId}">
    <div class="cost num" title="Стоимость постройки в мане">${cost ?? R.cost}</div>
    ${count > 1 ? `<div class="stack num">×${count}</div>` : ''}
    <div class="inner"><div class="art"><img src="${cardImg(cardId)}" alt="" loading="lazy" onerror="this.style.opacity=0"></div></div>
    <i class="frame"></i><i class="orn"></i>${gradeStars(grade)}${tics ? `<div class="tics">${tics}</div>` : ''}
    <div class="badges">${stats.map(([i, k, v]) => `<span class="bd" title="${k}"><b style="--vl:${String(v).length}">${v}</b><i class="st-${i}">${statIcon(i)}</i></span>`).join('')}</div>
    <div class="body"><div class="bw">
      <div class="rar">${R.name}${d.type === 'building' ? ' · здание' : ''}</div>
      <div class="desc">${esc(d.desc)}</div>
      ${combos.length ? `<div class="sep"></div><div class="combo">${cb}</div>` : ''}
    </div></div>
    <div class="name" style="--nl:${d.name.length}"><span>${esc(d.name)}</span></div>
  </div>`;
}

// Если текст крупной карточки не влезает в пергамент — плавно уменьшаем его (zoom), а не обрезаем
export function fitCards(root) {
  requestAnimationFrame(() => root.querySelectorAll('.card.big .body').forEach(b => {
    const w = b.firstElementChild; let z = 1; w.style.zoom = '';
    const room = () => b.getBoundingClientRect().bottom - parseFloat(getComputedStyle(b).paddingBottom) - w.getBoundingClientRect().bottom;
    while (room() < 0 && z > 0.6) { z -= 0.04; w.style.zoom = z; }
  }));
}

// 3D-наклон карточки за пальцем
export function tilt(el) {
  const card = el.matches('.card') ? el : el.querySelector('.card');
  if (!card) return;
  const move = e => { const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; card.style.transform = `perspective(700px) rotateY(${x * 22}deg) rotateX(${-y * 22}deg) scale(1.02)`; };
  const out = () => { card.style.transform = ''; };
  card.addEventListener('pointermove', move); card.addEventListener('pointerleave', out); card.addEventListener('pointerup', out);
}

// Окно поверх экрана. Возвращает { el, close }. onClose — при закрытии.
export function modal(inner, { onClose, cls = '', closable = true } = {}) {
  const el = h(`<div class="modal"><div class="box ${cls}">${closable ? `<button class="close">${ic('ic_close', '')}</button>` : ''}${inner}</div></div>`);
  document.body.appendChild(el); fitCards(el);
  const close = () => { el.remove(); onClose?.(); };
  if (closable) {
    el.querySelector('.close').addEventListener('click', () => { Sfx.play('click'); close(); });
    el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
  }
  return { el, close };
}

export function toast(text, color = '#fff') {
  const t = h(`<div class="toast tx" style="color:${color}">${esc(text)}</div>`);
  document.body.appendChild(t); setTimeout(() => t.remove(), 1400);
}
let noteT = 0;
export function note(text) {
  document.querySelectorAll('.note').forEach(n => n.remove());
  const n = h(`<div class="note">${esc(text)}</div>`); document.body.appendChild(n);
  clearTimeout(noteT); noteT = setTimeout(() => n.remove(), 2200);
}
export function confirmBox(title, text, okLabel = 'Да', okCls = 'green') {
  return new Promise(res => {
    const m = modal(`<div class="panel col center"><h2>${esc(title)}</h2><div class="parch">${text}</div><div class="row center"><button class="btn gray" data-a="no">Отмена</button><button class="btn ${okCls}" data-a="ok">${esc(okLabel)}</button></div></div>`, { onClose: () => res(false) });
    m.el.querySelector('[data-a=ok]').onclick = () => { Sfx.play('click'); m.el.remove(); res(true); };
    m.el.querySelector('[data-a=no]').onclick = () => { Sfx.play('click'); m.close(); };
  });
}
// Нажатия: звук + «вдавливание»
export function press(root) {
  root.addEventListener('pointerdown', e => { const b = e.target.closest('.btn,.iconbtn,.tab,.chip,.node,.offer,.hc'); if (b) { Sfx.unlock(); Sfx.play('click'); } }, { capture: true });
}

// «Щелчок Таноса»: элементы рассыпаются в пыль слева направо (как удаление чата в Telegram).
// Рисуем картинки элемента (арт, рамку) на холст, режем на частицы и сдуваем их вправо-вверх.
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
export async function snap(els) {
  const cv = document.createElement('canvas'), dpr = Math.min(1.5, devicePixelRatio || 1);
  cv.className = 'snapfx'; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.appendChild(cv);
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const P = [];
  for (const el of els) {
    const R = el.getBoundingClientRect(); if (!R.width) continue;
    const off = document.createElement('canvas'); off.width = Math.ceil(R.width); off.height = Math.ceil(R.height); const o = off.getContext('2d');
    const parts = [...el.querySelectorAll('img, .frame')];
    for (const p of parts) {
      const r = p.getBoundingClientRect(), src = p.tagName === 'IMG' ? p.currentSrc || p.src : (getComputedStyle(p).backgroundImage.match(/url\("?(.+?)"?\)/) || [])[1];
      const im = src && await loadImg(src); if (im) o.drawImage(im, r.left - R.left, r.top - R.top, r.width, r.height);
    }
    const data = o.getImageData(0, 0, off.width, off.height).data, step = 3;
    for (let y = 0; y < off.height; y += step) for (let x = 0; x < off.width; x += step) {
      const i = (y * off.width + x) * 4; if (data[i + 3] < 60) continue;
      P.push({ x: R.left + x, y: R.top + y, c: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`, d: (x / off.width) * 0.55 + Math.random() * 0.25, vx: 40 + Math.random() * 90, vy: -30 - Math.random() * 70, a: 1 });
    }
    el.style.visibility = 'hidden';
  }
  Sfx.play('chestTap', 0);
  await new Promise(done => {
    const t0 = performance.now();
    const tick = now => {
      const t = (now - t0) / 1000; g.clearRect(0, 0, innerWidth, innerHeight); let alive = 0;
      for (const p of P) {
        const k = t - p.d;
        if (k < 0) { g.fillStyle = p.c; g.fillRect(p.x, p.y, 3, 3); alive++; continue; }
        const a = 1 - k / 0.9; if (a <= 0) continue; alive++;
        g.globalAlpha = a; g.fillStyle = p.c; g.fillRect(p.x + p.vx * k + Math.sin(k * 9 + p.y) * 4, p.y + p.vy * k, 2.4, 2.4); g.globalAlpha = 1;
      }
      if (alive && t < 2.2) requestAnimationFrame(tick); else { cv.remove(); done(); }
    };
    requestAnimationFrame(tick);
  });
}
