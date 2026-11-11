// Приложение: загрузка, экраны меню, бой. Все данные игрока — на сервере (js/api.js), здесь только показ и вызовы.
import { TOWER_DEFS, RARITIES, RARITY_ORDER, SKILLS, BRANCHES, CHESTS, BOOSTERS, PACKS, PACK_USD, STARTER, CARD_UP_COST, CARD_MAX_LV, MARKET_FEE, BATTLE, ENEMY_DEFS, GRADES, dustValue, dustOdds, combosOf } from './data.js?v=20261111200246';
import { LEVELS, WORLDS, weeklyLevel, weeklyLeft, genWaves } from './levels.js?v=20261111200246';
import { Api, errText, inTelegram } from './api.js?v=20261111200246';
import { Battle, VIEW } from './battle.js?v=20261111200246';
import { PAYIC } from './payic.js?v=20261111200246';
import { openChest } from './chest3d.js?v=20261111200246';
import { loadMeta, preload, uiImg, cardImg, META, fxSrcs } from './sprites.js?v=20261111200246';
import { Sfx } from './audio.js?v=20261111200246';
import { Ads } from './ads.js?v=20261111200246';
import { step } from './track.js?v=20261111200246';                                             // воронка новичка: supabase/blitz_funnel.sql
import { PAY, SUPABASE_URL } from './config.js?v=20261111200246';
import { placeText, pyramidSvg } from './place.js?v=20261111200246';
import { initLang, pickLang, setLang, LANGS, lang as curLang, tr } from './i18n.js?v=20261111200246';   // язык — по Telegram/браузеру, сменить — в настройках
import { $, h, esc, fmt, fmtShort, ic, bic, cardHTML, gradeStars, traitsHTML, STAT_ICONS, snap, tilt, modal, toast, note, confirmBox, press } from './ui.js?v=20261111200246';

const TG = window.Telegram?.WebApp;
const app = $('#app');
const S = { me: null, tab: 'battle', battle: null, settings: loadSettings() };
const TABS = [['shop', 'Магазин', 'ic_shop'], ['bag', 'Рюкзак', 'ic_backpack'], ['battle', 'Бой', 'ic_sword'], ['market', 'Рынок', 'ic_market'], ['rank', 'Рейтинг', 'ic_crown']];

function loadSettings() { try { return { sound: true, ...JSON.parse(localStorage.getItem('bb_settings') || '{}') }; } catch { return { sound: true }; } }
function saveSettings() { try { localStorage.setItem('bb_settings', JSON.stringify(S.settings)); } catch {} Sfx.on = S.settings.sound; for (const k of ['dmg', 'bounty', 'hp', 'words']) VIEW[k] = S.settings[k] !== false; }

// Полный экран в Telegram (как в Baalgor, blood-keep/js/tg.js): сразу на весь экран и отступы под кнопки Telegram сверху
// (safeAreaInset + contentSafeAreaInset → --safe-top/--safe-bot; вне Telegram остаются env() из style.css).
function tgFullscreen() {
  const v = x => { try { return TG.isVersionAtLeast?.(x); } catch { return false; } };
  try { if (v('8.0') && TG.requestFullscreen && !TG.isFullscreen) TG.requestFullscreen(); } catch {}
  try { if (v('8.0')) TG.lockOrientation?.(); } catch {}
  try { TG.setBottomBarColor?.('#2f6db8'); } catch {}
  const apply = () => {
    const s = TG.safeAreaInset || {}, c = TG.contentSafeAreaInset || {}, st = document.documentElement.style;
    const top = (s.top || 0) + (c.top || 0), bot = (s.bottom || 0) + (c.bottom || 0);
    if (top || TG.isFullscreen) st.setProperty('--safe-top', top + 'px');
    if (bot) st.setProperty('--safe-bot', bot + 'px');
  };
  apply();
  for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) { try { TG.onEvent(ev, apply); } catch {} }
}
// ───────── загрузка ─────────
async function boot() {
  await initLang(pickLang());                                                   // язык интерфейса: до построения экранов
  if (TG) { TG.ready(); TG.expand(); TG.disableVerticalSwipes?.(); TG.setHeaderColor?.('#2f6db8'); TG.setBackgroundColor?.('#2f6db8'); tgFullscreen(); }
  Sfx.on = S.settings.sound; for (const k of ['dmg', 'bounty', 'hp', 'words']) VIEW[k] = S.settings[k] !== false;
  press(document.body);
  // картинка ещё не сгенерирована — прячем, а не показываем системный «битый» значок
  // картинки нет: если указан запасной вариант (data-fb) — подставляем его, иначе прячем
  document.addEventListener('error', e => { const im = e.target; if (im.tagName !== 'IMG') return; if (im.dataset.fb) { const fb = im.dataset.fb; delete im.dataset.fb; im.src = fb; } else im.classList.add('broken'); }, true);
  const loadArt = `img/ui/loading/load_${String(1 + Math.floor(Math.random() * 10)).padStart(2, '0')}.webp?v=2`;
  app.innerHTML = `<div class="screen loading"><div class="bg"></div><div class="loadblur" style="background-image:url(${loadArt})"></div><img class="loadart" src="${loadArt}" alt="" onload="this.classList.add('on')"><img class="logo" src="${uiImg('logo')}" alt="" onerror="this.outerHTML='<div class=&quot;tx logo-text&quot;>BLITZ<br>BASTION</div>'"><div class="loadbar"><i></i></div><div class="tx small dim">Готовим башни…</div></div>`;
  const bar = $('.loadbar i');
  bar.style.width = '20%';
  await Promise.all([loadMeta(), document.fonts?.ready]);
  bar.style.width = '45%';
  await preload(['logo', 'bg_menu', 'ic_prism', 'ic_mana', 'ic_heart', 'ic_skull', 'ic_shop', 'ic_cards', 'ic_sword', 'ic_market', 'ic_crown'].map(uiImg));
  bar.style.width = '65%';
  const me = await Api.profile();
  bar.style.width = '100%';
  step(me.error ? 'err_' + String(me.error).replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 18) : 'loaded');
  if (me.error) { app.innerHTML = `<div class="screen loading"><div class="bg"></div><h2 class="tx center">Нет связи</h2><div class="parch">${esc(errText(me.error))}</div><button class="btn" onclick="location.reload()">${bic('retry')}Повторить</button></div>`; return; }
  S.me = me;
  render();
  // заход + метка источника (t.me/<бот>?startapp=<метка>); со 2-го захода — предложение стартового набора
  Api.visit(TG?.initDataUnsafe?.start_param).then(v => { if (v?.ok) { S.visits = v.visits; S.starter = v.starter; setTimeout(maybeOffer, 900); } });
  // призы турнира прошлой недели — окно при входе (как в Baalgor)
  setTimeout(() => Api.week(1).then(w => { if (w?.prizes?.length && !document.querySelector('.modal')) weekPrizes(w.prizes); }), 2500);
}
function setMe(r) { if (r && !r.error && r.ok) S.me = r; return r; }
async function act(promise, okText) {
  const r = await promise;
  if (r.error) { note(errText(r.error)); return null; }
  setMe(r); if (okText) note(okText); render(); return r;
}

// ───────── каркас экрана ─────────
function avaHTML(m) { return m.avatar ? `<img src="${esc(m.avatar)}" alt="">` : esc((tr(m.name) || '?')[0]); }
function topbar() {
  const m = S.me;
  return `<div class="topbar">
    <button class="player" data-go="profile"><div class="ava">${avaHTML(m)}${m.sp ? '<span class="badge">+</span>' : ''}</div><span class="lvtag tx">ур. ${m.lvl}</span></button>
    <div class="pill" data-go="shop"><img src="${uiImg('ic_prism')}" alt=""><b>${fmtShort(m.prisms)}</b></div>
    <button class="gear" data-go="settings"><img src="${uiImg('ic_settings')}" alt=""></button>
  </div>`;
}
function tabbar() { return `<div class="tabbar">${TABS.map(([id, name, icn]) => `<button class="tab ${S.tab === id ? 'on' : ''}" data-tab="${id}"><img src="${uiImg(icn)}" alt=""><b>${name}</b></button>`).join('')}</div>`; }
function frame(content, { bg = true } = {}) {
  // вне главного экрана фон приглушён — ячейки и карточки не сливаются с картинкой
  return `<div class="screen"><div class="bg img${S.tab !== 'battle' ? ' dim' : ''}" style="background-image:url(${uiImg('bg_menu')}),radial-gradient(120% 70% at 50% 0%, #a6d9f2 0%, #6cb9e6 35%, #2f6db8 100%)"></div>${topbar()}${content}${tabbar()}</div>`;
}
function bindCommon(root) {
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.afterSkills = null; render(); });
  root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}
function go(where) {
  step(where);
  if (where === 'profile') { S.tab = 'profile'; return render(); }
  if (where === 'shop') { S.tab = 'shop'; return render(); }
  if (where === 'skills') { S.tab = 'skills'; return render(); }
  if (where === 'chests') return chestsModal();
  if (where === 'map') { S.tab = 'map'; return render(); }
  if (where === 'bag') { S.tab = 'bag'; return render(); }
  if (where === 'settings') return settingsModal();
}

function render() {
  const fn = { battle: homeScreen, map: mapScreen, bag: bagScreen, market: marketScreen, shop: shopScreen, rank: rankScreen, profile: profileScreen, skills: skillsScreen }[S.tab] || homeScreen;
  fn();
}

// ───────── главный ─────────
function homeScreen() {
  const m = S.me, next = Math.min(LEVELS.length, m.progress + 1), L = LEVELS[next - 1];
  const wl = weeklyLeft(), wd = Math.floor(wl / 86400), wh = Math.floor(wl % 86400 / 3600);
  // лаконично: логотип, недельное испытание фишкой в углу, внизу — уровень и кнопка боя (сундуки — в рюкзаке)
  app.innerHTML = frame(`<div class="content home">
    <button class="weekchip" id="weekly"><img src="${uiImg('chest_weekly')}" alt=""><span class="tx small">${m.weeklyDone ? 'Готово' : `${wd}д ${wh}ч`}</span></button>
    <button class="skchip${m.sp ? ' has' : ''}" data-go="skills"><span class="ski">${ic('ic_skill')}</span><span class="tx small">Навыки</span>${m.sp ? `<span class="badge static num">${m.sp}</span>` : ''}</button>
    <img class="logo" src="${uiImg('logo')}" alt="" onerror="this.outerHTML='<div class=&quot;tx logo-text&quot;>BLITZ<br>BASTION</div>'">
    ${buffsHTML() ? `<div class="buffs">${buffsHTML()}</div>` : ''}
    <div class="homebot">
      <button class="lvltile" data-go="map"><div class="lt-txt"><span class="tx small dim">${esc(L.world.name)}</span><span class="tx">${next}. ${esc(L.name)}</span></div><span class="lt-map tx small">Карта</span></button>
      <button class="btn green big play" id="play">${bic('play')}В БОЙ</button>
    </div>
  </div>`);
  bindCommon(app);
  $('#play').onclick = () => levelSheet(L);
  $('#weekly').onclick = () => levelSheet(weeklyLevel());
}

// ───────── карта кампании: три нарисованных региона, уровни на полянах вдоль дороги ─────────
function mapScreen() {
  const m = S.me;
  const worlds = WORLDS.map((w, wi) => {
    const lv = LEVELS.slice(wi * 8, wi * 8 + 8), nodes = META[`worldmap_${w.id}`]?.nodes;
    const btn = (l, i) => {
      const st = l.idx <= m.progress ? 'done' : l.idx === m.progress + 1 ? 'cur' : 'lock';
      const pos = nodes?.[i] ? `style="left:${nodes[i][0] * 100}%;top:${nodes[i][1] * 100}%"` : '';
      return `<button class="node ${st}${l.boss ? ' boss' : ''}${nodes ? ' abs' : ''}" data-lv="${l.idx}" ${pos}>${st === 'lock' ? '' : `<span class="nn">${l.idx}</span>`}${st === 'cur' ? '<span class="st tx">ТЫ ЗДЕСЬ</span>' : ''}</button>`;
    };
    const locked = wi * 8 > m.progress;
    return `<div class="world"><div class="wtitle"><div class="ribbon tx">${esc(w.name)}</div></div>
      ${nodes ? `<div class="mapart${locked ? ' locked' : ''}" style="background-image:url(img/map/${w.id}.webp)">${lv.map(btn).join('')}</div>`
              : `<div class="nodes" style="background:linear-gradient(${w.grass[0]},${w.accent})">${lv.map(btn).join('')}</div>`}</div>`;
  }).reverse().join('');      // сверху — дальние регионы, снизу — начало пути
  app.innerHTML = frame(`<div class="content mapc">
    <button class="weeklynode" data-lv="weekly"><img src="${uiImg('chest_weekly')}" alt=""><div><div class="tx">Испытание недели</div><div class="tx small dim">Враги крепче, в конце — босс. Еженедельный сундук за победу.</div></div></button>
    ${worlds}</div>`);
  bindCommon(app);
  const cur = app.querySelector('.node.cur'); if (cur) cur.scrollIntoView({ block: 'center' }); else app.querySelector('.content').scrollTop = 1e6;
  app.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
    const id = b.dataset.lv;
    if (id === 'weekly') return levelSheet(weeklyLevel());
    const L = LEVELS[+id - 1]; if (L.idx > m.progress + 1) return note('Сначала пройди предыдущий уровень');
    levelSheet(L);
  });
}

// перед боем: есть неизученные очки навыков — «Изучить» (древо, затем «К бою» вернёт к колоде) или «Позже»
function skillAsk(L) {
  const md = modal(`<div class="panel col center"><div class="ribbon tx">Новые навыки</div><img src="${uiImg('ic_skill')}" alt="" style="width:84px;margin:0 auto">
    <div class="parch center">У тебя <b class="num">${S.me.sp}</b> ${S.me.sp === 1 ? 'очко' : S.me.sp < 5 ? 'очка' : 'очков'} навыков. Изучи пассивные навыки перед боем — они усилят башни, ману и защиту.</div>
    <div class="row center"><button class="btn gray" id="sklater">Позже</button><button class="btn green" id="skgo">${bic('continue')}Изучить</button></div></div>`);
  md.el.querySelector('#sklater').onclick = () => { md.close(); deckModal(L); };
  md.el.querySelector('#skgo').onclick = () => { md.close(); S.afterSkills = L; S.tab = 'skills'; render(); };
}
// Плашка уровня: дороги, враги, топ-3, рекорд, колода, кнопка «Играть»
async function levelSheet(L) {
  const waves = genWaves(L), kinds = [...new Set(waves.flatMap(w => w.groups.map(g => g.kind)))];
  const md = modal(`<div class="panel col"><div class="center"><div class="ribbon tx">${esc(L.name)}</div></div>
    <div class="row center tx small dim">${esc(L.world.name)} · ${L.paths.length} ${L.paths.length > 1 ? 'дороги' : 'дорога'} · ${waves.length} волн</div>
    <div class="parch small">Враги: ${kinds.map(k => esc(ENEMY_DEFS[k].name)).join(', ')}${L.weekly ? '<br><b>Еженедельный сундук</b> за победу (раз в неделю). Бустер «Удача недели» действует только тут.' : ''}</div>
    <div class="tx lbh">Лучшие игроки уровня</div><div class="list rlist" id="top"><div class="tx small dim center">Загрузка…</div></div>
    <button class="btn green big" id="go">${bic('play')}Играть</button></div>`);
  $('#go', md.el).onclick = () => { md.close(); if (S.me.sp > 0) skillAsk(L); else deckModal(L); };
  const t = await Api.top(L.id, 3);
  const box = $('#top', md.el); if (!box) return;
  box.innerHTML = (t.top || []).length ? t.top.map(r => rankRow(r)).join('') + (t.me && t.me.rank > 3 ? rankRow({ ...t.me, name: S.me.name, username: S.me.username, avatar: S.me.avatar, lvl: S.me.lvl, me: true }) : '') : '<div class="tx small dim center">Пока никого — стань первым!</div>';
  bindRanks(box);
}
// строка рейтинга как в Baalgor: место, аватар, имя и @ник, очки, стрелка; касание раскрывает колоду рекорда, уровень игрока и время
const clock = t => t > 0 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : '—';
function rankRow(r) {
  const deck = Array.isArray(r.deck) ? r.deck.filter(c => TOWER_DEFS[c.card]) : [];
  const slots = deck.length ? deck.map(c => { const d = TOWER_DEFS[c.card];
    return `<div class="rslot r-${d.rarity}" title="${esc(d.name)}"><img src="${cardImg(c.card)}" alt="" loading="lazy">${gradeStars(c.grade || 0)}<b class="num">${c.lvl || 1}</b></div>`; }).join('')
    : '<span class="rnone">колода неизвестна — рекорд поставлен до обновления</span>';
  return `<div class="rwrap${r.me ? ' me' : ''}${r.rank <= 3 ? ' top' + r.rank : ''}">
    <button class="rrow" type="button"><span class="rk num">${r.rank}</span><span class="ava">${avaImg(r.avatar, r.name)}</span>
      <span class="nm"><b>${esc(r.name)}</b>${r.username ? `<small>@${esc(r.username)}</small>` : r.lvl ? `<small>ур. ${r.lvl}</small>` : ''}</span>
      <span class="sc num">${fmt(r.score)}</span><i class="rarr"></i></button>
    <div class="rmore"><div class="rin"><div class="rslots">${slots}</div>
      <div class="rinfo">${r.lvl ? `<span>${ic('ic_crown')}Уровень <b class="num">${r.lvl}</b></span>` : ''}${r.secs ? `<span>⏱ Время <b class="num">${clock(r.secs)}</b></span>` : ''}${r.levels ? `<span>${ic('ic_sword')}Уровней <b class="num">${r.levels}</b></span>` : ''}</div></div></div></div>`;
}
function bindRanks(box) { box.onclick = e => { const row = e.target.closest('.rrow'); if (row) { Sfx.play('click'); row.parentElement.classList.toggle('open'); } }; }

// ───────── колода и коллекция ─────────
function deckCards() { const byId = Object.fromEntries(S.me.cards.map(c => [c.id, c])); return (S.me.deck || []).map(id => byId[id]).filter(Boolean).slice(0, BATTLE.deckSize); }
// превью карты: арт, имя, мана и параметры значками — без текста (колода, рука в бою)
function previewHTML(c) {
  const d = TOWER_DEFS[c.card];
  return `<div class="pv r-${d.rarity}"><img src="${cardImg(c.card)}" alt="" loading="lazy"><span class="pvc num">${RARITIES[d.rarity].cost}</span>${gradeStars(c.grade || 0)}<b class="pvn" style="--nl:${tr(d.name).length}">${esc(d.name)}</b></div>`;
}
// Колода перед боем: слоты сверху (касание — убрать), коллекция снизу (касание — добавить), «Отмена» ничего не меняет
function deckModal(L) {
  const m = S.me, start = deckCards().map(c => c.id); let deck = [...start];
  const md = modal(`<div class="panel col deckmd"><div class="center"><div class="ribbon tx">Колода</div></div>
    <div class="dslots" id="ds"></div><div class="dcoll" id="dc"></div>
    <div class="row dbtns"><button class="btn gray" id="dcancel">${bic('cancel')}Отмена</button><button class="btn green" id="dgo">${bic('play')}В бой</button></div></div>`, { cls: 'deckbox' });
  const ds = md.el.querySelector('#ds'), dc = md.el.querySelector('#dc'), byId = Object.fromEntries(m.cards.map(c => [c.id, c]));
  const draw = () => {
    ds.innerHTML = Array.from({ length: BATTLE.deckSize }, (_, i) => deck[i] ? `<button class="dslot full" data-rm="${deck[i]}">${previewHTML(byId[deck[i]])}</button>` : '<div class="dslot empty"></div>').join('');
    const rest = m.cards.filter(c => !deck.includes(c.id) && !c.listed).sort((a, b) => RARITIES[TOWER_DEFS[b.card].rarity].order - RARITIES[TOWER_DEFS[a.card].rarity].order || (b.grade || 0) - (a.grade || 0));
    dc.innerHTML = rest.map(c => `<button class="dpick" data-add="${c.id}">${previewHTML(c)}</button>`).join('') || '<div class="tx small dim">Все карты уже в колоде</div>';
    ds.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { deck = deck.filter(x => x !== b.dataset.rm); Sfx.play('click'); draw(); });
    dc.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const c = byId[b.dataset.add];
      const pk = modal(`<div class="col" style="align-items:center;gap:12px">${cardHTML(c.card, { big: true, lvl: c.lvl, grade: c.grade || 0 })}<button class="btn green" id="padd">${bic('todeck')}В колоду</button></div>`, { cls: 'peek' });
      pk.el.querySelector('#padd').onclick = () => { if (deck.length >= BATTLE.deckSize) return note('Колода полна — убери карту из слота'); deck.push(c.id); Sfx.play('click'); pk.close(); draw(); };
    });
  };
  draw();
  md.el.querySelector('#dcancel').onclick = () => { Sfx.play('click'); md.close(); };
  md.el.querySelector('#dgo').onclick = async () => {
    if (!deck.length) return note('Добавь хотя бы одну карту');
    if (deck.join() !== start.join()) { const r = await act(Api.setDeck(deck)); if (!r) return; }
    md.close(); startBattle(L);
  };
}
function cardModal(c) {
  const m = S.me, d = TOWER_DEFS[c.card], inDeck = m.deck.includes(c.id);
  const same = m.cards.filter(x => x.card === c.card && (x.grade || 0) === (c.grade || 0) && x.lvl === c.lvl).length, dv = dustValue(d.rarity, c.grade || 0, c.lvl);
  const combos = combosOf(c.card);
  const md = modal(`<div class="col" style="align-items:center">${cardHTML(c.card, { big: true, lvl: c.lvl, grade: c.grade, listed: c.listed, count: same })}
    <div class="acts">
      ${c.listed ? `<button class="act" id="unlist">${bic('cancel', '')}<span>Снять с рынка · ${fmt(c.price)}</span></button>` : `
      <button class="btn blue sm actb" id="deckbtn">${bic(inDeck ? 'fromdeck' : 'todeck')}${inDeck ? 'Убрать' : 'В колоду'}</button>
      <button class="btn green sm actb" id="sell">${bic('sell')}Продать</button>
      <button class="btn purple sm actb" id="dust">${bic('dust')}${same > 1 ? 'Распылить…' : 'Распылить'}</button>`}
    </div></div>`);
  tilt(md.el.querySelector('.card'));
  const q = s => md.el.querySelector(s);
  q('#unlist') && (q('#unlist').onclick = async () => { md.close(); await act(Api.cancel(c.listing), 'Карта снята с рынка'); });
  q('#deckbtn') && (q('#deckbtn').onclick = async () => {
    let deck = [...m.deck];
    if (inDeck) deck = deck.filter(x => x !== c.id); else { if (deck.length >= BATTLE.deckSize) return note('Колода полна (6 карт). Убери одну.'); deck.push(c.id); }
    md.close(); await act(Api.setDeck(deck));
  });
  q('#sell') && (q('#sell').onclick = () => { md.close(); sellModal(c); });
  q('#dust') && (q('#dust').onclick = () => {
    if (inDeck) return note('Сначала убери карту из колоды');
    const stack = m.cards.filter(x => x.card === c.card && (x.grade || 0) === (c.grade || 0) && x.lvl === c.lvl && !x.listed && !m.deck.includes(x.id));
    md.close(); dustFlow(stack.length > 1 ? stack : [c], stack.length > 1 ? [c] : null);
  });
;
}

// ───────── рюкзак: все предметы сеткой по 3 — стопки одинаковых карт, бустеры, сундуки ─────────
function bagScreen() {
  const m = S.me, f = S.bagFilter || 'all', inDeck = new Set(m.deck);
  const groups = new Map();
  for (const c of m.cards) {
    const k = `${c.card}|${c.grade || 0}|${c.lvl}|${c.listed ? 1 : 0}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const stacks = [...groups.values()].sort((a, b) => RARITIES[TOWER_DEFS[b[0].card].rarity].order - RARITIES[TOWER_DEFS[a[0].card].rarity].order || (b[0].grade || 0) - (a[0].grade || 0) || b[0].lvl - a[0].lvl);
  const boosters = Object.entries(m.boosters || {}).filter(([k, n]) => n > 0 && BOOSTERS[k]);
  const chests = Object.entries(m.chests || {}).filter(([, n]) => n > 0);
  const cells = [];
  if (f === 'all' || f === 'cards') stacks.forEach(g => { const c = g.find(x => !inDeck.has(x.id) && !x.listed) || g[0]; cells.push(`<div class="bagcell" data-uid="${c.id}">${cardHTML(c.card, { mini: true, lvl: c.lvl, grade: c.grade, listed: c.listed, indeck: g.every(x => inDeck.has(x.id)), count: g.length })}</div>`); });
  if (f === 'all' || f === 'boost') boosters.forEach(([k, n]) => cells.push(`<button class="bagcell item" data-boost="${k}"><img src="${uiImg(BOOSTERS[k].icon)}" alt=""><span class="nm tx small">${esc(BOOSTERS[k].name)}</span><span class="stack num">×${n}</span></button>`));
  if (f === 'all' || f === 'chests') chests.forEach(([k, n]) => cells.push(`<button class="bagcell item" data-chest="${k}"><img src="${uiImg('chest_' + k)}" alt=""><span class="nm tx small">${esc(CHESTS[k]?.name || k)}</span><span class="stack num">×${n}</span></button>`));
  const tabs = [['all', 'Всё'], ['cards', 'Карты'], ['boost', 'Бустеры'], ['chests', 'Сундуки']];
  const selM = !!S.bagSel;
  app.innerHTML = frame(`<div class="content${selM ? ' selmode' : ''}"><div class="title row"><h1 class="tx grow">Рюкзак</h1><button class="btn ${selM ? 'gray' : 'purple'} sm" id="selm">${selM ? bic('cancel') + 'Отмена' : bic('dust') + 'Распылить'}</button></div>
    <div class="chips">${tabs.map(([id, n]) => `<button class="chip ${f === id ? 'on' : ''}" data-f="${id}">${n}</button>`).join('')}</div>
    <div class="baggrid">${cells.join('') || '<div class="tx small dim">Пусто</div>'}</div>
    <div class="parch small" style="margin-top:14px">Одинаковые карты складываются в стопку. Лишние можно продать на рынке или <b>распылить</b> за самоцветы. Качество карты: простая, <b>улучшенная</b> (+15% к силе) и <b>уникальная</b> (+30%).</div>
  </div>`);
  bindCommon(app);
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.bagFilter = b.dataset.f; render(); });
  // режим распыления: касание стопки — выбрать/снять все её свободные карты, внизу — кнопка
  const freeOf = uid => { const c0 = m.cards.find(c => c.id === uid); return m.cards.filter(x => x.card === c0.card && (x.grade || 0) === (c0.grade || 0) && x.lvl === c0.lvl && !x.listed && !inDeck.has(x.id)); };
  $('#selm').onclick = () => { S.bagSel = selM ? null : new Set(); render(); };
  if (selM) {
    const upd = () => { const n = S.bagSel.size; let bar = $('#dustbar'); if (!bar) { bar = h('<div class="dustbar"><button class="btn purple" id="dustgo"></button></div>'); app.querySelector('.content').appendChild(bar); bar.querySelector('#dustgo').onclick = () => { const list = m.cards.filter(c => S.bagSel.has(c.id)); if (!list.length) return note('Выбери карты'); S.bagSel = null; dustFlow(list); }; } bar.querySelector('#dustgo').innerHTML = `${bic('dust')}Распылить ×${n}`; bar.querySelector('#dustgo').disabled = !n; };
    app.querySelectorAll('[data-uid]').forEach(b => { const free = freeOf(b.dataset.uid); if (!free.length) b.classList.add('nosel'); if (free.some(c => S.bagSel.has(c.id))) b.classList.add('picked');
      b.onclick = () => { if (!free.length) return note('Карта в колоде или на рынке'); const on = free.some(c => S.bagSel.has(c.id)); free.forEach(c => on ? S.bagSel.delete(c.id) : S.bagSel.add(c.id)); b.classList.toggle('picked', !on); upd(); }; });
    upd();
  } else app.querySelectorAll('[data-uid]').forEach(b => b.onclick = () => cardModal(m.cards.find(c => c.id === b.dataset.uid)));
  app.querySelectorAll('[data-boost]').forEach(b => b.onclick = () => boostModal(b.dataset.boost));
  app.querySelectorAll('[data-chest]').forEach(b => b.onclick = () => openChestKind(b.dataset.chest));
}
const DUST_IC = `<svg class="ic dustic" viewBox="0 0 24 24"><path d="M4 18c3-1 5-4 6-8 1 4 3 7 6 8-3 1-5 3-6 5-1-2-3-4-6-5z" fill="#e8c6ff" stroke="#14193a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="17" cy="6" r="1.8" fill="#fff" stroke="#14193a" stroke-width="1.2"/><circle cx="20.5" cy="10.5" r="1.2" fill="#ffd6ff"/><circle cx="13.5" cy="3.5" r="1.1" fill="#ffd6ff"/><circle cx="21" cy="4" r=".9" fill="#fff"/></svg>`;
const pct = p => p >= 0.1 ? Math.round(p * 100) + '%' : (p * 100).toFixed(1).replace('.', ',') + '%';
// Распыление: окно с возможными наградами и шансами → «щелчок» → итог. one — распылить только одну карту из стопки (кнопка в окне).
async function dustFlow(cards, one = null) {
  const list = cards;
  const view = () => {
    const o = dustOdds(list);
    return `<div class="panel col dustbox"><div class="center"><div class="ribbon tx">Распыление</div></div>
      <div class="dprev">${list.slice(0, 12).map(c => previewHTML(c)).join('')}${list.length > 12 ? `<span class="tx">+${list.length - 12}</span>` : ''}</div>
      <div class="tx small center">Можно получить:</div>
      <div class="odds">
        ${o.gems.map(g => `<div class="od">${ic('ic_prism')}<div class="ot"><b>+${g.v}${g.n > 1 ? ` … +${g.v * g.n}` : ''}</b><span>${g.n > 1 ? `${g.n} шт. · ${RARITIES[g.r].name.toLowerCase()}` : `за ${RARITIES[g.r].name.toLowerCase()} карту`}</span></div><i>${pct(1 - Math.pow(1 - g.p, g.n))}</i></div>`).join('')}
        ${o.ups.map(u => `<div class="od">${gradeStars(Math.min(2, u.from + 1))}<div class="ot"><b>${esc(TOWER_DEFS[u.card].name)}</b><span>на звезду лучше</span></div><i>${pct(u.p1)}</i></div>${u.p2 ? `<div class="od">${gradeStars(2)}<div class="ot"><b>${esc(TOWER_DEFS[u.card].name)}</b><span>сразу 3 звезды</span></div><i>${pct(u.p2)}</i></div>` : ''}`).join('')}
        <div class="od"><img class="ic" src="${uiImg('chest_' + o.chest)}" alt=""><div class="ot"><b>${esc(CHESTS[o.chest].name)}</b><span>очень редко</span></div><i>${pct(o.pChest)}</i></div>
      </div>
      <div class="parch small dnote">Чем больше карт распыляешь за раз, тем выше шанс на самоцветы и сундук. 3+ одинаковые карты дают шанс на карту качеством выше.</div>
      <div class="row dbtns"><button class="btn gray" data-a="no">${bic('cancel')}Отмена</button>${one && list.length > 1 ? `<button class="btn blue" data-a="one">${bic('one')}Только 1</button>` : ''}<button class="btn purple" data-a="ok">${bic('dust')}Распылить ${list.length > 1 ? '×' + list.length : ''}</button></div></div>`;
  };
  const md = modal(view(), { cls: 'dustmd' });
  const bind = () => {
    md.el.querySelector('[data-a=no]').onclick = () => md.close();
    md.el.querySelector('[data-a=one]')?.addEventListener('click', () => { md.close(); dustFlow(one); });
    md.el.querySelector('[data-a=ok]').onclick = async () => {
      const els = [...md.el.querySelectorAll('.dprev .pv')];
      md.el.querySelectorAll('button').forEach(b => b.disabled = true);
      const [r] = await Promise.all([Api.dustMany(list.map(c => c.id)), snap(els)]);
      md.close();
      if (r.error) return note(errText(r.error));
      setMe(r); render();
      const w = r.dust || {}, got = [];
      if (w.gems) got.push(`<div class="od">${ic('ic_prism')}<b>+${w.gems}</b></div>`);
      (w.cards || []).forEach(c => got.push(`<div class="dwin">${previewHTML(c)}</div>`));
      if (w.chest) got.push(`<div class="od"><img class="ic" src="${uiImg('chest_' + w.chest)}" alt=""><b>${esc(CHESTS[w.chest].name)}</b></div>`);
      Sfx.play(got.length ? 'reveal' : 'click', got.length ? 2 : 0);
      modal(`<div class="panel col center"><div class="ribbon tx">${got.length ? 'Удача!' : 'Рассыпалось в пыль'}</div>${got.length ? `<div class="odds won">${got.join('')}</div>` : '<div class="tx small dim">В этот раз ничего не выпало</div>'}</div>`);
    };
  };
  bind();
}
async function sellModal(c) {
  const d = TOWER_DEFS[c.card];
  // продажа только за самоцветы: Stars продавцу на счёт не перевести (их получает только бот), а TON за цифровые товары нарушает правила Telegram
  const curr = 'prisms'; let price = { common: 10, magic: 30, rare: 90, legendary: 300, mystic: 900 }[d.rarity] * c.lvl;
  const cic = () => ic(curr === 'stars' ? 'ic_star' : 'ic_prism', 'ic cur');
  const md = modal(`<div class="panel col center sellbox"><div class="ribbon tx">Продать карту</div>
    <div class="sellcard">${cardHTML(c.card, { big: true, lvl: c.lvl, grade: c.grade || 0 })}</div>
    <label class="priceinp"><span class="tx small">Цена</span><input id="pr" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="off" enterkeyhint="done"><span id="prc"></span></label>
    <div class="sellsum" id="get"></div>
    <div class="tx small dim" id="hint"></div>
    <button class="btn green" id="ok">${bic('list')}Выставить</button></div>`, { cls: 'sellmd' });
  const q = s => md.el.querySelector(s);
  let st = null;
  const upd = () => {
    const fee = MARKET_FEE[curr], get = price - Math.floor(price * fee);
    q('#prc').innerHTML = cic();
    if (document.activeElement !== q('#pr')) q('#pr').value = price;
    q('#ok').disabled = price < 1;
    q('#get').innerHTML = `Ты получишь: <b class="num">${fmt(get)}</b>${cic()} <span class="dim">· комиссия ${Math.round(fee * 100)}%</span>`;
    q('#hint').innerHTML = curr === 'prisms' && st && !st.error ? `Средняя цена: ${st.avg ? fmt(st.avg) : '—'} · дешевле всего: ${st.min ? fmt(st.min) : '—'}` : '';
  };
  const inp = q('#pr');
  inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').replace(/^0+/, ''); price = +inp.value || 0; upd(); };
  inp.onblur = () => { price = Math.max(1, price); upd(); };
  inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
  upd();
  q('#ok').onclick = async () => { if (price < 1) return; md.close(); await act(Api.sell(c.id, price, curr), 'Карта выставлена на рынок!'); };
  st = await Api.marketStats(c.card); if (md.el.isConnected) upd();
}

// ───────── рынок ─────────
const tgLink = u => `https://t.me/${u}`;
const cur = (c, n) => `<span class="price">${ic(c === 'stars' ? 'ic_star' : 'ic_prism')}${fmtShort(n)}</span>`;
const sellerAva = l => `<span class="mava">${avaImg(l.avatar, l.seller)}</span>`;
// аватар игрока: фото из Telegram, а если оно не открылось (ссылка устарела, нет доступа) — первая буква имени, а не тёмный квадрат
function avaImg(url, name) { const L = esc((name || '?').trim()[0] || '?').toUpperCase(); return url ? `<img src="${esc(url)}" alt="" onerror="this.replaceWith(document.createTextNode('${L}'))">` : L; }
function sellerBox(l) {
  return `<div class="seller">${sellerAva(l)}<div><b>${esc(l.seller)}</b>${l.tg ? `<a class="tgn" data-tg="${esc(l.tg)}">@${esc(l.tg)}</a>` : '<span class="tgn dim">без @ника</span>'}</div></div>`;
}
function openTg(u) { try { if (inTelegram && TG?.openTelegramLink) return TG.openTelegramLink(tgLink(u)); } catch {} window.open(tgLink(u), '_blank'); }
async function buyLot(l, md) {
  if (l.sellerId === S.me.id) return note('Это твой лот');
  if (l.cur === 'stars') {
    if (!inTelegram) return note('Покупка за Stars работает в Telegram');
    return note('Оплата Stars откроется в Telegram');
  }
  if (S.me.prisms < l.price) { note('Не хватает самоцветов'); md?.close(); S.tab = 'shop'; return render(); }
  if (!await confirmBox('Купить карту?', `${esc(TOWER_DEFS[l.card].name)} за ${fmt(l.price)} самоцветов`, 'Купить', 'green buy')) return;
  md?.close();
  const r = await act(Api.buyListing(l.id));
  if (r) { Sfx.play('reveal', 3); toast('КАРТА ТВОЯ!', '#7dff6a'); }
}
function lotModal(l, mine) {
  mine = mine || l.sellerId === S.me.id;
  const md = modal(`<div class="col" style="align-items:center;gap:10px">${cardHTML(l.card, { big: true, lvl: l.lvl, grade: l.grade || 0 })}
    ${mine ? `<div class="acts"><button class="btn gray" id="lotbuy">${bic('cancel')}Снять с продажи</button></div>`
      : `<div class="lotbuy">${sellerBox(l)}<button class="btn ${l.sellerId === S.me.id ? 'gray' : 'green buy'}" id="lotbuy">Купить ${cur(l.cur, l.price)}</button></div>`}</div>`);
  tilt(md.el.querySelector('.card'));
  md.el.querySelector('.tgn[data-tg]')?.addEventListener('click', e => openTg(e.currentTarget.dataset.tg));
  md.el.querySelector('#lotbuy').onclick = async () => { if (mine) { md.close(); await act(Api.cancel(l.listing), 'Лот снят'); } else buyLot(l, md); };
}
async function marketScreen() {
  step('market');
  const mode = S.mkMode === 'mine' ? 'mine' : 'buy', fr = S.mkRar || null, fg = S.mkGrade ?? null, q = (S.mkQ || '').trim().toLowerCase();
  const nf = (fr ? 1 : 0) + (fg != null ? 1 : 0);
  app.innerHTML = frame(`<div class="content"><div class="title"><h1 class="tx">Рынок</h1></div>
    <div class="row center" style="margin-bottom:10px"><button class="chip ${mode === 'mine' ? 'on' : ''}" data-m="mine">Мои ордера</button><button class="chip ${mode === 'buy' ? 'on' : ''}" data-m="buy">Купить</button></div>
    <div class="parch small mknote"><b>Продай свою карту за самоцветы.</b> Открой рюкзак, выбери лишнюю карту, нажми «Продать» и назначь цену. Самоцветы придут, как только карту купят. Комиссии нет, снять лот можно в любой момент.</div><div class="mkact"><button class="btn sm green mksell" data-go="bag">${bic('sell')}Выставить карту</button></div>
    ${mode === 'buy' ? `<div class="msearch"><input id="mq" type="search" placeholder="Поиск башни…" value="${esc(S.mkQ || '')}" autocomplete="off" enterkeyhint="search"><button class="filt ${nf ? 'on' : ''}" id="mf" aria-label="Фильтры"><svg viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4 2v-8z" fill="currentColor" stroke="#14193a" stroke-width="1.8" stroke-linejoin="round"/></svg>${nf ? `<i>${nf}</i>` : ''}</button></div>
      <div class="fdrop" id="fd" hidden>
        <div class="fl">Редкость</div><div class="chips wrap">${[null, ...RARITY_ORDER].map(r => `<button class="chip ${fr === r ? 'on' : ''}" data-r="${r ?? ''}">${r ? `<i style="background:${RARITIES[r].color}"></i>${RARITIES[r].name}` : 'Все'}</button>`).join('')}</div>
        <div class="fl">Качество</div><div class="chips wrap">${[null, 0, 1, 2].map(g => `<button class="chip ${fg === g ? 'on' : ''}" data-g="${g ?? ''}">${g == null ? 'Все' : gradeStars(g)}</button>`).join('')}</div></div>` : ''}
    <div class="grid lots" id="lots"><div class="tx small dim">Загрузка…</div></div></div>`);
  bindCommon(app);
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mkMode = b.dataset.m; render(); });
  const box = $('#lots');
  if (mode === 'mine') {
    const mine = S.me.cards.filter(c => c.listed);
    box.innerHTML = mine.map(c => `<div class="lot" data-uid="${c.id}"><div class="lc">${cardHTML(c.card, { mini: true, lvl: c.lvl, grade: c.grade || 0 })}</div><div class="ownfoot"><span class="owntag">${cur(c.cur, c.price)}</span><button class="btn sm gray ownoff">Снять</button></div></div>`).join('') || '<div class="tx small dim" style="grid-column:1/-1;text-align:center">Лотов нет. Выставить карту можно из рюкзака.</div>';
    box.querySelectorAll('[data-uid]').forEach(el => {
      const c = S.me.cards.find(x => x.id === el.dataset.uid);
      el.querySelector('.lc').onclick = () => lotModal({ card: c.card, lvl: c.lvl, grade: c.grade, price: c.price, cur: c.cur, listing: c.listing }, true);
      el.querySelector('.ownoff').onclick = async () => { await act(Api.cancel(c.listing), 'Лот снят'); };
    });
    return;
  }
  const fd = $('#fd'), mf = $('#mf'), mq = $('#mq');
  mf.onclick = () => { fd.hidden = !fd.hidden; };
  fd.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { S.mkRar = b.dataset.r || null; S.mkF = 1; render(); });
  fd.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { S.mkGrade = b.dataset.g === '' ? null : +b.dataset.g; S.mkF = 1; render(); });
  if (S.mkF) { fd.hidden = false; S.mkF = 0; }
  const lots = await Api.market(null, null, 'new');
  if (!box.isConnected) return;
  if (lots.error) { box.innerHTML = `<div class="tx small">${esc(errText(lots.error))}</div>`; return; }
  const draw = () => {
    const s = (mq.value || '').trim().toLowerCase(); S.mkQ = mq.value;
    const list = lots.filter(l => (!fr || l.rarity === fr) && (fg == null || (l.grade || 0) === fg) && (!s || TOWER_DEFS[l.card].name.toLowerCase().includes(s) || (l.seller || '').toLowerCase().includes(s) || (l.tg || '').toLowerCase().includes(s)));
    box.innerHTML = list.map(l => `<div class="lot" data-id="${l.id}"><div class="lc">${cardHTML(l.card, { mini: true, lvl: l.lvl, grade: l.grade || 0 })}</div>
      <div class="lfoot"><div class="seller sm">${sellerAva(l)}<div><b>${esc(l.seller)}</b>${l.tg ? `<span class="tgn">@${esc(l.tg)}</span>` : ''}</div></div>${l.sellerId === S.me.id ? `<button class="owntag pricebtn-own">${cur(l.cur, l.price)}<small>твой лот</small></button>` : `<button class="pricebtn buyb">${cur(l.cur, l.price)}</button>`}</div></div>`).join('') || '<div class="tx small dim" style="grid-column:1/-1;text-align:center">Ничего не найдено</div>';
    box.querySelectorAll('[data-id]').forEach(el => { const l = lots.find(x => x.id === el.dataset.id); el.querySelector('.lc').onclick = () => lotModal(l); el.querySelector('.pricebtn, .owntag').onclick = () => (l.sellerId === S.me.id ? lotModal(l) : buyLot(l)); });
  };
  mq.oninput = () => { clearTimeout(mq._t); mq._t = setTimeout(draw, 160); };
  draw();
}

// ───────── магазин ─────────
function shopScreen() {
  step('shop'); setTimeout(() => { PACKS.forEach(p => prefetchInvoice(p.id)); warmPay(); }, 400);   // счета готовы до нажатия — окно оплаты открывается сразу
  const m = S.me;
  app.innerHTML = frame(`<div class="content"><div class="title"><h1 class="tx">Магазин</h1></div>
    <h2 class="tx">Самоцветы</h2>
    <div class="shopgrid">${PACKS.map(p => `<button class="offer" data-pack="${p.id}">${p.tag ? `<span class="tag tx">${p.tag}</span>` : ''}<img class="pic" src="${uiImg('ic_prism')}" alt="" style="transform:scale(${0.8 + PACKS.indexOf(p) * 0.08})"><div class="tx">${fmt(p.prisms * (1 + p.bonus / 100))}</div>${p.bonus ? `<div class="tx small" style="color:#7dff6a">+${p.bonus}%</div>` : '<div class="tx small">&nbsp;</div>'}<span class="btn sm buy">${PAYIC.star}${p.stars}</span></button>`).join('')}</div>
    <h2 class="tx" style="margin-top:20px">Сундуки</h2>
    <div class="shopgrid">${['common', 'magic', 'legend'].map(k => `<button class="offer" data-chest="${k}"><span class="cnt tx">×${m.chests?.[k] || 0}</span><img class="pic" src="${uiImg('chest_' + k)}" alt=""><div class="tx small">${CHESTS[k].name}</div><span class="btn sm buy">${ic('ic_prism')}${CHESTS[k].prisms}</span></button>`).join('')}</div>
    <button class="btn blue" style="width:100%;margin-top:10px" data-go="chests">${bic('chests')}Мои сундуки</button>
    ${[['xp', 'Зелья опыта'], ['luck', 'Зелья удачи'], ['special', 'Особые']].map(([g, t]) => `<h2 class="tx" style="margin-top:20px">${t}</h2>
    <div class="shopgrid">${Object.entries(BOOSTERS).filter(([, b]) => b.group === g).map(([k, b]) => boostOffer(k, b, m)).join('')}</div>`).join('')}
  </div>`);
  bindCommon(app);
  app.querySelectorAll('[data-pack]').forEach(b => b.onclick = () => payModal(b.dataset.pack));
  app.querySelectorAll('[data-chest]').forEach(b => b.onclick = () => buyChests(b.dataset.chest));
  app.querySelectorAll('.shopgrid [data-boost]').forEach(b => b.onclick = () => buyBooster(b.dataset.boost));
}
// Покупка сундуков пачкой: 1–10 штук
// бустер в рюкзаке: описание, сколько есть, «Выпить» (зелья по времени и находки); свиток удачи срабатывает сам
const BUFF_NAME = { xp: 'опыта', luck: 'удачи', gems: 'самоцветов' };
function buffLeft(bf) { const ms = new Date(bf.until) - Date.now(); return ms > 0 ? `${Math.floor(ms / 6e4)}:${String(Math.floor(ms / 1e3) % 60).padStart(2, '0')}` : ''; }
function buffsHTML() { const B = S.me.buffs || {};
  return [...['xp', 'luck', 'gems'].filter(k => B[k]).map(k => `<span class="buff b-${k}"><img src="${uiImg(`boost/${k === 'gems' ? 'gems' : k + B[k].pct + '_30'}`)}" alt=""><b class="num">+${B[k].pct}%</b><small class="num" data-until="${B[k].until}">${buffLeft(B[k])}</small></span>`),
    ...(B.find ? [`<span class="buff b-find"><img src="${uiImg('boost/find')}" alt=""><b>находка</b>${B.find > 1 ? `<small class="num">×${B.find}</small>` : ''}</span>`] : [])].join(''); }
function boostModal(id) {
  const B = BOOSTERS[id], n = S.me.boosters?.[id] || 0, usable = B.kind && B.kind !== 'chestluck';
  const md = modal(`<div class="panel col center"><img src="${uiImg(B.icon)}" alt="" style="width:110px;margin:0 auto"><h2 class="tx">${esc(B.name)}</h2><div class="parch">${esc(B.desc)}</div>
    <div class="tx small">У тебя: ${n}</div>${usable && n ? `<button class="btn green" id="buse">${bic('continue')}Выпить</button>` : B.kind === 'chestluck' ? '<div class="tx small dim">Сработает при открытии следующего сундука</div>' : ''}</div>`);
  md.el.querySelector('#buse')?.addEventListener('click', async () => { md.close(); const r = await act(Api.useBoost(id)); if (r) { toast(B.min ? `Зелье ${BUFF_NAME[B.kind]} действует ${B.min} мин!` : 'Зелье находки сработает после следующей победы!', '#7dff6a'); render(); } });
}
// карточка бустера в магазине: колба, срок действия, название, описание, цена
const boostDur = b => b.min ? `<span class="bdur">${b.min === 60 ? '1 час' : b.min + ' мин'}</span>` : '<span class="bdur once">1 раз</span>';
function boostOffer(k, b, m) {
  return `<button class="offer boff" data-boost="${k}"><span class="cnt tx">×${m.boosters?.[k] || 0}</span>${boostDur(b)}<img class="pic" src="${uiImg(b.icon)}" alt="">
    <div class="tx small">${esc(b.name)}</div><div class="small dim bdesc">${esc(b.desc)}</div><span class="btn sm buy">${ic('ic_prism')}${b.prisms}</span></button>`;
}
// Покупка за самоцветы по нескольку штук сразу (сундуки и бустеры): − / ×N / + / ×10, итоговая цена на кнопке
function buyChests(k) { buyQty({ item: 'chest_' + k, name: CHESTS[k].name, img: uiImg('chest_' + k), price: CHESTS[k].prisms, done: n => n > 1 ? `+${n} сундуков на складе!` : 'Сундук на складе!' }); }
function buyBooster(k) { const B = BOOSTERS[k]; buyQty({ item: k, name: B.name, img: uiImg(B.icon), price: B.prisms, desc: B.desc, done: n => n > 1 ? `+${n} бустеров в рюкзаке!` : 'Бустер в рюкзаке!' }); }
function buyQty({ item, name, img, price, desc = '', done }) {
  let n = 1;
  const md = modal(`<div class="panel col center"><div class="ribbon tx">${esc(name)}</div><img src="${img}" alt="" style="width:150px;margin:0 auto">
    ${desc ? `<div class="parch small center">${esc(desc)}</div>` : ''}
    <div class="stepper center"><button class="btn sm red" data-n="-1">−</button><div class="num pricev" id="cn"></div><button class="btn sm green" data-n="1">+</button><button class="btn sm blue" data-n="10">×10</button></div>
    <button class="btn green buy" id="cbuy"></button></div>`);
  const upd = () => { md.el.querySelector('#cn').textContent = '×' + n; md.el.querySelector('#cbuy').innerHTML = `Купить за ${fmt(price * n)}${ic('ic_prism', 'ic cur')}`; };
  md.el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { const v = +b.dataset.n; n = v === 10 ? 10 : Math.max(1, Math.min(10, n + v)); upd(); });
  upd();
  md.el.querySelector('#cbuy').onclick = async () => { if (S.me.prisms < price * n) return note('Не хватает самоцветов'); md.close(); const r = await act(Api.buy(item, n)); if (r) toast(done(n), '#ffe14d'); };
}
// Окно «Пополнение» (как в Mortis Game): Telegram Stars, кошелёк TON, Crypto Bot, xRocket (GRAM/TON или USDT), подарок Telegram
// и ссылка «Нет звёзд? Купи за ₽ по СБП». Выключенные способы (нет ключей на сервере) не показываются.
function payModal(pack, onPaid) {
  step('pay_open'); prefetchInvoice(pack); warmPay();
  const P = pack === 'starter' ? STARTER : PACKS.find(p => p.id === pack), usd = PACK_USD[pack];
  const amount = pack === 'starter' ? STARTER.prisms : Math.round(P.prisms * (1 + P.bonus / 100));
  const row = (id, pic, name, sub, price) => `<button class="payrow" data-m="${id}"><span class="pic">${pic}</span><span class="pn"><b>${name}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="pp">${price} ›</span></button>`;
  const gt = `<i class="as ton">${PAYIC.ton}GRAM</i><i class="as usdt">${PAYIC.usdt}USDT</i>`;
  const md = modal(`<div class="panel col paybox"><div class="center"><div class="ribbon tx">Пополнение</div></div>
    <div class="tx center paywhat">${ic('ic_prism')} ${fmt(amount)} самоцветов${pack === 'starter' ? ' + сундуки' : ''}</div>
    ${PAY.gift ? row('gift', '🎁', 'Подарок Telegram', '', '') : ''}
    ${row('stars', PAYIC.star, 'Telegram Stars', '', `${P.stars} ${PAYIC.star}`)}
    ${PAY.ton ? row('ton', PAYIC.ton, 'Кошелёк TON', gt, `$${usd}`) : ''}
    ${PAY.cryptobot ? row('cryptobot', PAYIC.crypto, 'Crypto Bot', gt, `$${usd}`) : ''}
    ${PAY.xrocket ? row('xrocket', PAYIC.rocket, 'xRocket', gt, `$${usd}`) : ''}
    ${PAY.sbpUrl ? `<a class="paysbp" data-sbp>Нет звёзд? Купи за ₽ по СБП ›</a>` : ''}</div>`);
  md.el.querySelector('[data-sbp]')?.addEventListener('click', () => TG?.openLink ? TG.openLink(PAY.sbpUrl) : window.open(PAY.sbpUrl, '_blank'));
  md.el.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
    const m = b.dataset.m;
    step('pay_' + m);
    if (m === 'stars') { md.close(); return buyPack(pack, onPaid); }      // ссылка уже готовится с открытия окна
    if (m === 'gift') return note('Отправь подарок Telegram боту игры — его стоимость зачислится самоцветами');
    if (!inTelegram) return note('Оплата доступна в Telegram');
    const asset = await askAsset(m); if (!asset) return;
    b.disabled = true; b.classList.add('busy'); const r = await Api.cryptoInvoice(pack, m, asset); b.disabled = false; b.classList.remove('busy');
    if (r.error) return note(errText(r.error));
    md.close();
    if (m === 'ton') await payTon(r);
    else if (TG?.openTelegramLink && /t\.me\//.test(r.link)) TG.openTelegramLink(r.link); else TG?.openLink ? TG.openLink(r.link) : window.open(r.link, '_blank');
    waitCredit(onPaid, m === 'ton' ? r.order : null);
  });
}
// валюта: GRAM (TON) или USDT; Crypto Bot сам даёт выбор в своём счёте
function askAsset(m) {
  if (m === 'cryptobot') return Promise.resolve('USDT');
  return new Promise(res => {
    const md = modal(`<div class="panel col center paybox"><div class="ribbon tx">Чем платишь?</div>
      <button class="payrow" data-a="TON"><span class="pic">${PAYIC.ton}</span><span class="pn"><b>GRAM (TON)</b></span><span class="pp">›</span></button>
      ${m === 'ton' ? '' : `<button class="payrow" data-a="USDT"><span class="pic">${PAYIC.usdt}</span><span class="pn"><b>USDT</b></span><span class="pp">›</span></button>`}</div>`, { onClose: () => res(null) });
    md.el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a; md.el.remove(); res(a); });
  });
}
// перевод из кошелька TON: TON Connect (Tonkeeper, Telegram Wallet…), без него — ссылка ton://transfer
async function payTon(r) {
  const link = `ton://transfer/${r.address}?amount=${r.nano}&text=${encodeURIComponent(r.comment)}`;
  try {
    const { TonConnectUI } = await import('https://cdn.jsdelivr.net/npm/@tonconnect/ui@2.0.9/+esm');
    const ui = window.__tcui ||= new TonConnectUI({ manifestUrl: new URL('tonconnect-manifest.json', location.href).href });
    if (!ui.connected) { await ui.openModal(); await new Promise((ok, no) => { const off = ui.onStatusChange(w => { off(); w ? ok() : no(new Error('no wallet')); }); }); }
    const payload = await tonComment(r.comment);
    await ui.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 600, messages: [{ address: r.address, amount: r.nano, payload }] });
  } catch (e) { if (TG?.openLink) TG.openLink(link); else location.href = link; }
}
// комментарий перевода как ячейка BOC (op 0 + текст) — так его видят обозреватели и наша проверка
async function tonComment(text) {
  const { beginCell } = await import('https://cdn.jsdelivr.net/npm/@ton/core@0.59.1/+esm');
  return beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64');
}
// ждём начисления: самоцветы на балансе выросли (для TON — ещё и проверяем блокчейн)
async function waitCredit(onPaid, tonOrder) {
  const before = S.me.prisms;
  note('Ждём подтверждения оплаты…');
  for (let i = 0; i < 40; i++) {
    await new Promise(res => setTimeout(res, 4000));
    if (tonOrder) await Api.tonVerify(tonOrder);
    const p = await Api.profile();
    if (p.ok && p.prisms > before) { setMe(p); onPaid?.(); render(); toast(`+${p.prisms - before} самоцветов!`, '#ff8ad8'); return; }
  }
}
// Окно оплаты без задержки: ссылка на счёт Stars создаётся заранее (при входе в магазин и открытии окна «Пополнение») и живёт 10 мин;
// крипто-функция и TON Connect прогреваются заранее, чтобы нажатие сразу открывало оплату.
const invCache = {};
function prefetchInvoice(pack) {
  if (!inTelegram || !TG?.openInvoice) return null;
  if (pack === 'starter' && S.starter) return null;
  const c = invCache[pack];
  if (c && Date.now() - c.at < 600000) return c.p;
  const p = Api.invoice(pack).catch(() => ({ error: 'network' }));
  invCache[pack] = { p, at: Date.now() };
  p.then(r => { if (!r?.link) delete invCache[pack]; });
  return p;
}
let warmed = 0;
function warmPay() {
  if (!inTelegram || Date.now() - warmed < 120000) return;
  warmed = Date.now();
  if (PAY.ton || PAY.cryptobot || PAY.xrocket) fetch(`${SUPABASE_URL}/functions/v1/bb-crypto-invoice`, { method: 'OPTIONS' }).catch(() => {});
  if (PAY.ton) { fetch(`${SUPABASE_URL}/functions/v1/bb-ton-verify`, { method: 'OPTIONS' }).catch(() => {}); import('https://cdn.jsdelivr.net/npm/@tonconnect/ui@2.0.9/+esm').catch(() => {}); }
}
async function buyPack(pack, onPaid) {
  if (!inTelegram || !TG?.openInvoice) return note('Покупка самоцветов работает в Telegram');
  const slow = setTimeout(() => note('Открываем оплату…'), 350);
  const r = await (prefetchInvoice(pack) || Api.invoice(pack)); clearTimeout(slow); delete invCache[pack];
  if (!r.link) { step('pay_err'); return note(errText(r.error)); }
  const before = S.me.prisms;
  TG.openInvoice(r.link, async status => {
    step(status === 'paid' ? 'paid' : 'pay_' + status);
    if (status !== 'paid') return;
    onPaid?.();
    note('Оплата прошла, начисляем…');
    for (let i = 0; i < 12; i++) { await new Promise(res => setTimeout(res, 1500)); const p = await Api.profile(); if (p.ok && p.prisms > before) { setMe(p); render(); toast(`+${p.prisms - before} самоцветов!`, '#ff8ad8'); return; } }
  });
}

// ───────── сундуки ─────────
function chestsModal() {
  const m = S.me, kinds = ['common', 'magic', 'legend', 'weekly'];
  const md = modal(`<div class="panel col"><div class="center"><div class="ribbon tx">Сундуки</div></div>
    <div class="shopgrid">${kinds.map(k => `<div class="offer"><span class="cnt tx">×${m.chests?.[k] || 0}</span><img class="pic" src="${uiImg('chest_' + k)}" alt=""><div class="tx small">${CHESTS[k].name}</div>
      ${(m.boosters?.chestluck || m.boosters?.['luck_' + k]) ? `<div class="tx small" style="color:#7dff6a">Удача ×${k === 'weekly' ? '1,75' : '1,5'} (${(m.boosters.chestluck || 0) + (m.boosters['luck_' + k] || 0)})</div>` : ''}
      <button class="btn sm green" data-open="${k}" ${(m.chests?.[k] || 0) ? '' : 'disabled'}>${bic('open')}Открыть</button></div>`).join('')}</div>
    <div class="parch small">В каждом сундуке — карта. Редкая: ~5% (${(m.pity?.p4 ?? 0) >= 9 ? 'в следующем — точно' : `гарантия через ${10 - (m.pity?.p4 ?? 0)}`}). Легендарная или мистическая: ~0,6%, шанс растёт с 74-го сундука, гарантия через ${90 - (m.pity?.p5 ?? 0)}${m.pity?.g5 ? ' — и это будет мистическая' : ''}. Счётчик общий для всех сундуков и не сгорает. Бустеры удачи удваивают шансы.</div></div>`);
  md.el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { md.close(); openChestKind(b.dataset.open); });
}
async function openChestKind(k) {
  step('chest_open');
  const r = await Api.openChest(k, 1);
  if (r.error) return note(errText(r.error));
  setMe(r); const res = await openChest(k, r.items, { more: S.me.chests?.[k] || 0 }); render();
  if (res?.again && (S.me.chests?.[k] || 0) > 0) openChestKind(k);
}

// ───────── навыки ─────────
// ───────── рейтинг ─────────
// Турнир недели (как в Baalgor): рейтинг обнуляется в понедельник 00:00 UTC, отсчёт до итогов, пьедестал 2–1–3 с призами,
// награды за остальные места, строки с раскрытием колоды. Призы прошлой недели начисляет сервер, игра показывает окно «Итоги недели».
const WEEK_PRIZE = { 1: { prisms: 500, chests: { legend: 1 } }, 2: { prisms: 250, chests: { magic: 2 } }, 3: { prisms: 150, chests: { magic: 1 } } };
const prizeChips = z => `${Object.entries(z.chests || {}).map(([k, v]) => `<span class="pzc"><img src="${uiImg('chest_' + k)}" alt="">${v > 1 ? `<b class="num">×${v}</b>` : ''}</span>`).join('')}<span class="pzp">${ic('ic_prism')}<b class="num">${z.prisms}</b></span>`;
function weekClock(ends) { const ms = Math.max(0, new Date(ends) - Date.now()), d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, sc = Math.floor(ms / 1e3) % 60, p = n => String(n).padStart(2, '0');
  return { ms, html: `${d ? `<b>${d}</b><small>д</small>` : ''}<b>${p(h)}:${p(m)}:${p(sc)}</b>` }; }
async function rankScreen() {
  app.innerHTML = frame(`<div class="content tourney"><div class="title"><h1 class="tx">Турнир недели</h1></div>
    <div class="tn-cd"><span>Итоги через</span><div class="tn-clock" id="tnc">…</div></div>
    <div class="parch small tn-note">Очки недели — сумма лучших результатов по уровням кампании за эту неделю. В понедельник 00:00 UTC таблица обнуляется, призы приходят сами.</div>
    <div class="peds">${[2, 1, 3].map(p => { const z = WEEK_PRIZE[p], [ck, cn] = Object.entries(z.chests)[0];
      return `<div class="ped p${p}"><img class="ped-img" src="img/ui/kit6/ped_${p}.webp?v=1" alt=""><img class="ped-beam" src="img/ui/kit6/beam.webp?v=1" alt="">
        <div class="ped-top"><img class="ped-rays" src="img/ui/kit6/rays.webp?v=1" alt=""><img class="ped-chest" src="${uiImg('chest_' + ck)}" alt="">${cn > 1 ? `<b class="ped-x num">×${cn}</b>` : ''}</div>
        <span class="ped-n num">${p}</span>
        <div class="ped-cap"><span class="pzp">${ic('ic_prism')}<b class="num">+${z.prisms}</b></span><div class="pod-who" id="pw${p}"><b>—</b></div></div></div>`; }).join('')}</div>
    <div class="list rlist" id="world"><div class="tx small dim center">Загрузка…</div></div></div>`);
  bindCommon(app);
  const nowU = new Date(), ends0 = Date.UTC(nowU.getUTCFullYear(), nowU.getUTCMonth(), nowU.getUTCDate() + ((8 - (nowU.getUTCDay() || 7)) % 7 || 7));
  const r0 = { ends: ends0 }; let r = r0;
  const tick = () => { const c = $('#tnc'); if (!c) return clearInterval(t); const w = weekClock(r.ends || ends0); c.innerHTML = w.html; if (w.ms <= 0) { clearInterval(t); setTimeout(() => S.tab === 'rank' && rankScreen(), 4000); } };
  const t = setInterval(tick, 1000); tick();
  r = await Api.week(100);
  const box = $('#world'); if (!box) return;
  if (r.error || !r.ok) { r = r0; box.innerHTML = '<div class="tx small dim center">Таблица недели скоро появится</div>'; return; }
  for (let p = 1; p <= 3; p++) { const e = $('#pw' + p), w = r.top[p - 1]; if (e) e.innerHTML = w ? `<span class="ava">${avaImg(w.avatar, w.name)}</span><b>${esc(w.name)}</b><small class="num">${fmt(w.score)}</small>` : '<b>—</b>'; }
  box.innerHTML = r.top.map(rankRow).join('') + (r.me && r.me.rank > r.top.length ? `<div class="tx center dim">…</div>${rankRow({ ...r.me, name: S.me.name, username: S.me.username, avatar: S.me.avatar, lvl: S.me.lvl, me: true })}` : '') || '<div class="tx small dim center">На этой неделе ещё никого — пройди уровень и займи первое место!</div>';
  bindRanks(box);
  weekPrizes(r.prizes);
}
// окно «Итоги недели»: место и что начислено (сервер уже положил самоцветы и сундуки)
function weekPrizes(list) {
  const z = (list || [])[0]; if (!z) return;
  const md = modal(`<div class="panel col center weekprize"><div class="ribbon tx">Итоги недели</div>
    ${z.place <= 3 ? `<img class="wp-medal" src="img/ui/kit6/medal_${z.place}.webp?v=1" alt="">` : ''}
    <div class="wp-place"><b class="num">#${z.place}</b><small>из ${z.total}</small></div><div class="small">Очки недели: <b class="num">${fmt(z.score)}</b></div>
    <div class="wp-prize">${prizeChips(z)}</div><div class="small dim">Самоцветы уже на счёте, сундуки — в рюкзаке</div>
    <button class="btn green" id="wpok">${bic('continue')}Забрать</button></div>`, { closable: false });
  md.el.querySelector('#wpok').onclick = async () => { md.close(); const r = await Api.weekSeen(z.week); if (r && !r.error) setMe(r); weekPrizes((list || []).slice(1)); };
}

// ───────── профиль и настройки ─────────
// ───────── профиль (как в Clash Royale / Brawl Stars): баннер игрока, опыт, статистика, боевая колода, прогресс веток навыков ─────────
function profileScreen() {
  const m = S.me, k = Math.min(1, m.xp / m.xpNext), total = Object.keys(TOWER_DEFS).length, kinds = new Set(m.cards.map(c => c.card)).size, sk = m.skills || {};
  const learned = Object.values(sk).reduce((a, v) => a + v, 0), maxSk = SKILLS.reduce((a, s) => a + s.max, 0);
  const tile = (icon, v, label) => `<div class="pst"><span class="psi">${icon}</span><b class="num">${v}</b><small>${label}</small></div>`;
  const br = Object.entries(BRANCHES).map(([b, B]) => { const ss = SKILLS.filter(s => s.branch === b), have = ss.reduce((a, s) => a + (sk[s.id] || 0), 0), all = ss.reduce((a, s) => a + s.max, 0);
    return `<div class="pbr" style="--bc:${B.color}"><span>${B.name}</span><div class="pbb"><i style="width:${have / all * 100}%"></i></div><b class="num">${have}/${all}</b></div>`; }).join('');
  app.innerHTML = frame(`<div class="content prof">
    <div class="title row"><button class="iconbtn back" data-tab="battle"><img src="${uiImg('ic_back')}" alt=""></button><h1 class="tx grow">Профиль</h1></div>
    <div class="pbanner">
      <div class="pava"><div class="ava">${avaHTML(m)}</div><span class="pshield num">${m.lvl}</span></div>
      <div class="pinfo"><div class="pnm"><b class="tx">${esc(m.name)}</b><button class="pedit" id="pedit" aria-label="Сменить имя">✎</button></div>
        ${m.username ? `<span class="ptg">@${esc(m.username)}</span>` : ''}
        <div class="pxp"><i style="width:${k * 100}%"></i><span class="num">${fmt(m.xp)} / ${fmt(m.xpNext)}</span></div>
        <small class="pnext">до уровня ${m.lvl + 1}</small></div>
    </div>
    <div class="psec"><div class="psh tx">Статистика</div><div class="pstats">
      ${tile(ic('ic_cards'), `${kinds}/${total}`, 'башен собрано')}
      ${tile(ic('ic_sword'), `${m.progress}/${LEVELS.length}`, 'уровней пройдено')}
      ${tile(ic('ic_skill'), `${learned}/${maxSk}`, 'навыков изучено')}
      ${tile(ic('ic_trophy'), m.weeklyDone ? 'Есть' : 'Нет', 'испытание недели')}
    </div></div>
    <div class="psec"><div class="psh tx">Боевая колода</div><div class="pdeck">${deckCards().map(previewHTML).join('') || '<span class="tx small dim">Пусто</span>'}</div></div>
    <button class="ptree" data-go="skills"><span class="pti">${ic('ic_skill')}</span><span class="grow"><b class="tx">Древо навыков</b>${br}</span>${m.sp ? `<span class="badge static">${m.sp}</span>` : ''}</button>
  </div>`);
  bindCommon(app);
  $('#pedit').onclick = () => {
    const md = modal(`<div class="panel col center"><div class="ribbon tx">Имя</div><input class="field-in" id="nm" maxlength="20" value="${esc(m.name)}"><button class="btn green" id="save">${bic('save')}Сохранить</button></div>`);
    md.el.querySelector('#save').onclick = async () => { const r = await act(Api.setName(md.el.querySelector('#nm').value)); if (r) { md.close(); render(); } };
  };
}
// ───────── древо навыков: вкладки веток; в ветке корень внизу → две развилки → вершина, узлы связаны «ветвями» ─────────
const SK_FALLBACK = { atk1: 'dmg', atk2: 'crit', atk3: 'rate', atk4: 'img:ic_fist', atk5: 'splash', atk6: 'img:ic_skull', eco1: 'mana', eco2: 'img:ic_prism', eco3: 'aura', eco4: 'time', eco5: 'chain', eco6: 'img:ic_xp', def1: 'img:ic_heart', def2: 'range', def3: 'slow', def4: 'slow', def5: 'air', def6: 'img:ic_heart' };
const skIcon = id => { const v = SK_FALLBACK[id] || 'aura', fb = v.startsWith('img:') ? `<img src="${uiImg(v.slice(4))}" alt="">` : STAT_ICONS[v];
  return `<img class="skimg" src="img/ui/sk_${id}.webp" alt="" onerror="this.outerHTML=this.nextElementSibling.innerHTML"><template>${fb}</template>`; };
function skillsScreen() {
  const m = S.me, sk = m.skills || {}, branch = S.skBr || 'atk', list = SKILLS.filter(s => s.branch === branch), sel = list.find(s => s.id === S.skSel) || list[0], B = BRANCHES[branch];
  const state = s => { const lv = sk[s.id] || 0, locked = !!(s.req && (sk[s.req[0]] || 0) < s.req[1]); return { lv, locked, max: lv >= s.max, can: m.sp > 0 && !locked && lv < s.max }; };
  const X = c => 18 + c * 32, Y = t => 86 - t * 24;   // проценты поля: корень внизу
  const links = list.filter(s => s.req).map(s => { const p = SKILLS.find(x => x.id === s.req[0]), on = (sk[p.id] || 0) >= s.req[1];
    return `<path d="M${X(p.col)} ${Y(p.tier)} C${X(p.col)} ${(Y(p.tier) + Y(s.tier)) / 2} ${X(s.col)} ${(Y(p.tier) + Y(s.tier)) / 2} ${X(s.col)} ${Y(s.tier)}" class="${on ? 'on' : ''}"/>`; }).join('');
  const nodes = list.map(s => { const st = state(s); return `<button class="sknode t${s.tier} ${st.locked ? 'lock' : ''} ${st.max ? 'maxed' : ''} ${st.can ? 'can' : ''} ${s.id === sel.id ? 'sel' : ''}" style="left:${X(s.col)}%;top:${Y(s.tier)}%" data-sk="${s.id}">
      <span class="skic">${skIcon(s.id)}</span>${st.locked ? `<span class="sklock">${ic('ic_lock')}</span>` : ''}<span class="sklv num">${st.lv}/${s.max}</span></button>`; }).join('');
  const st0 = state(sel), spent = b => SKILLS.filter(s => s.branch === b).reduce((a, s) => a + (sk[s.id] || 0), 0);
  app.innerHTML = frame(`<div class="content skills" style="--bc:${B.color}">
    <div class="title row"><button class="iconbtn back" data-go="profile"><img src="${uiImg('ic_back')}" alt=""></button><h1 class="tx grow">Навыки</h1><span class="sppill tx">${ic('ic_skill')}${m.sp}</span></div>
    ${S.afterSkills ? `<button class="btn green big tobattle" id="tobattle">${bic('play')}К бою: ${esc(S.afterSkills.name)}</button>` : ''}
    <div class="sktabs">${Object.entries(BRANCHES).map(([b, BB]) => `<button class="sktab ${b === branch ? 'on' : ''}" style="--bc:${BB.color}" data-br="${b}"><b class="tx">${BB.name}</b><small class="num">${spent(b)}</small></button>`).join('')}</div>
    <div class="skfield"><svg class="sklinks" viewBox="0 0 100 100" preserveAspectRatio="none">${links}</svg>${nodes}</div>
    <div class="skcard"><span class="skic big">${skIcon(sel.id)}</span>
      <div class="grow"><b class="tx">${esc(sel.name)}</b> <span class="num dim">${st0.lv}/${sel.max}</span><p>${esc(sel.desc)}</p>${st0.locked ? `<small class="dim">Нужно: ${esc(SKILLS.find(x => x.id === sel.req[0]).name)} — ${sel.req[1]} ур.</small>` : ''}</div>
      <button class="btn green sm" id="learn" ${st0.can ? '' : 'disabled'}>${st0.max ? 'Максимум' : bic('learn') + 'Изучить'}</button></div>
    <button class="btn red skreset" id="reset">${bic('restart')}Сбросить все навыки · 50 ${ic('ic_prism')}</button>
  </div>`);
  bindCommon(app);
  $("#tobattle")?.addEventListener("click", () => { const L = S.afterSkills; S.afterSkills = null; S.tab = "battle"; render(); deckModal(L); });
  app.querySelectorAll('[data-br]').forEach(el => el.onclick = () => { S.skBr = el.dataset.br; S.skSel = null; Sfx.play('click'); render(); });
  app.querySelectorAll('[data-sk]').forEach(el => el.onclick = () => { S.skSel = el.dataset.sk; Sfx.play('click'); render(); });
  $('#learn').onclick = async () => { const r = await act(Api.skillUp(sel.id)); if (r) { Sfx.play('upgrade'); render(); } };
  $('#reset').onclick = async () => { if (!await confirmBox('Сбросить навыки?', 'Очки вернутся, стоимость 50 самоцветов.', 'Сбросить', 'red')) return; await act(Api.skillReset()); render(); };
}
function settingsModal() {
  const md = modal(`<div class="panel col"><div class="center"><div class="ribbon tx">Настройки</div></div>
    <div class="row"><div class="tx grow">Звук</div><button class="toggle ${S.settings.sound ? 'on' : ''}" id="snd"></button></div>
    <div class="row"><div class="tx grow">Язык</div><button class="langbtn" id="lng" translate="no">${(LANGS.find(l => l[0] === curLang) || LANGS[0]).slice(1).reverse().join(' ')}</button></div>
    <div class="tx small dim setsec">Бой</div>
    ${[['dmg', 'Цифры урона'], ['bounty', 'Мана за убийство'], ['hp', 'Полоски здоровья'], ['words', 'Надписи эффектов («КРИТ», «ЯРОСТЬ!»)']].map(([k, t]) => `<div class="row"><div class="tx grow">${t}</div><button class="toggle ${S.settings[k] !== false ? 'on' : ''}" data-v="${k}"></button></div>`).join('')}</div>`);
  md.el.querySelectorAll('[data-v]').forEach(b => b.onclick = e => { const k = b.dataset.v; S.settings[k] = S.settings[k] === false; e.currentTarget.classList.toggle('on', S.settings[k] !== false); saveSettings(); });
  md.el.querySelector('#snd').onclick = e => { S.settings.sound = !S.settings.sound; e.currentTarget.classList.toggle('on', S.settings.sound); saveSettings(); };
  md.el.querySelector('#lng').onclick = () => {          // список языков; выбор перезагружает игру
    md.close();
    const lm = modal(`<div class="panel col"><div class="center"><div class="ribbon tx">Язык</div></div><div class="langlist" translate="no">${LANGS.map(([c, n, f]) => `<button class="langopt ${c === curLang ? 'on' : ''}" data-l="${c}"><span>${f}</span><b>${n}</b></button>`).join('')}</div></div>`);
    lm.el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { Sfx.play('click'); if (b.dataset.l === curLang) lm.close(); else setLang(b.dataset.l); });
  };
}

// ───────── бой ─────────
async function startBattle(L) {
  step('b_start');
  const deck = deckCards(), w = L.world.id;
  const kinds = [...new Set(genWaves(L).flatMap(x => x.groups.map(g => ENEMY_DEFS[g.kind].sprite || g.kind)))];
  await preload([`img/level/ground_${w}.webp`, `img/level/road_${w}.webp`, `img/level/props_${w}1.webp`, `img/level/props_${w}2.webp`, `img/decor/${w}.webp`, `img/level/gate_${w}.webp`, `img/level/den_${w}.webp`, `img/level/mountain_${w}.webp`, `img/level/boulder_${w}.webp`, w === 'meadow' ? 'img/level/pad.webp' : `img/level/pad_${w}.webp`,
    `img/level/props_${w}3.webp`, `img/level/cliff_${w}.webp`, 'img/level/water.webp',
    ...deck.map(c => `img/towers/${c.card}.webp`), ...fxSrcs(deck.map(c => c.card)), ...kinds.map(k => `img/enemies/${k}.webp`)]);
  app.innerHTML = `<div class="screen battle">
    <div class="bhud"><div class="bstat"><img src="${uiImg('ic_heart')}" alt=""><span id="lives"></span></div><div class="bstat"><img src="${uiImg('ic_skull')}" alt=""><span id="wave"></span></div>
      <div class="bstat grow" style="justify-content:center"><span id="score">0</span></div>
      <button class="iconbtn" id="pause" style="width:44px;height:44px"><img src="${uiImg('ic_pause')}" alt="" style="width:30px;height:30px"></button></div>
    <div class="field"><canvas></canvas><div class="combo-meter tx" id="combo"></div>
      <button class="btn sm purple wavebtn" id="next">${bic('wave')}<span id="nextT"></span></button></div>
    <div class="hand"><div class="mana"><i></i>${Array.from({ length: BATTLE.energyMax / 5 - 1 }, (_, i) => `<span class="tick" style="left:${(i + 1) * 5 / BATTLE.energyMax * 100}%"></span>`).join('')}<b class="tx" id="manaT"></b></div>
      <div class="handcards">${deck.map((c, i) => `<div class="hc" data-i="${i}">${previewHTML(c)}</div>`).join('')}</div></div></div>`;
  const cv = $('.field canvas');
  const hud = {};
  const b = new Battle(cv, {
    level: L, deck, skills: S.me.skills,
    onHud: st => {
      hud.st = st;
      $('#lives').textContent = st.lives; $('#wave').textContent = `${st.wave}/${st.waves}`; $('#score').textContent = fmt(st.score);
      $('.mana i').style.width = (st.energy / st.emax * 100) + '%'; $('#manaT').textContent = Math.floor(st.energy);
      const cm = $('#combo'); if (st.combo >= 2) { if (cm.dataset.c != st.combo) { cm.classList.add('hit'); setTimeout(() => cm.classList.remove('hit'), 90); } cm.dataset.c = st.combo; cm.textContent = `СЕРИЯ ×${st.combo}`; cm.style.color = st.combo >= 10 ? '#ff2d7a' : st.combo >= 5 ? '#ffd23f' : '#fff'; } else cm.textContent = '';
      const nb = $('#next'); nb.style.display = st.next != null ? '' : 'none'; $('#nextT').textContent = st.next != null ? `Волна · ${st.next}` : '';
      document.querySelectorAll('.hc').forEach(el => { const c = deck[+el.dataset.i], cost = b.cardCost(c); el.classList.toggle('poor', st.energy < cost); el.querySelector('.pvc').textContent = cost; });
    },
    onToast: (t, c) => toast(t, c),
    onEnd: res => setTimeout(() => endBattle(L, res, b), 900),
  });
  S.battle = b;
  const selCard = i => { b.sel = i == null ? null : deck[i]; b.hover = null; b.focus = null; closeTowerMenu(); document.querySelectorAll('.hc').forEach(el => el.classList.toggle('sel', b.sel && +el.dataset.i === i)); };
  document.querySelectorAll('.hc').forEach(el => el.onclick = () => { const i = +el.dataset.i; selCard(b.sel === deck[i] ? null : i); });
  b.onPlaceTry = (cx, cy) => { if (b.energy < b.cardCost(b.sel)) { note('Не хватает маны'); return; } if (!b.place(b.sel, cx, cy)) { selCard(null); return; } selCard(null); };
  let menu = null;
  const closeTowerMenu = () => { menu?.remove(); menu = null; b.focus = null; };
  b.onPan = () => closeTowerMenu();
  b.onTap = (r) => {
    closeTowerMenu();
    if (!r.tower) return;
    const t = r.tower; b.focus = t;
    const uc = b.upCost(t);
    const sp = b.toScreen(t.x, t.y, 1.5);
    menu = h(`<div class="towermenu" style="left:${sp.x + cv.offsetLeft}px;top:${sp.y + cv.offsetTop}px">${uc != null ? `<button class="btn green" data-a="up">${bic('upgrade')}${uc}</button>` : ''}<button class="btn red" data-a="sell">${bic('sell')}Продать +${Math.floor(t.spent * 0.5)}</button></div>`);
    $('.field').appendChild(menu);
    { // не даём меню уехать за край поля (кнопки кита v3 шире)
      const fw = menu.parentElement.clientWidth, mw = menu.offsetWidth, x = sp.x + cv.offsetLeft;
      menu.style.left = Math.max(mw / 2 + 4, Math.min(fw - mw / 2 - 4, x)) + 'px';
    }
    menu.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'up' && !b.upgrade(t)) note('Не хватает маны'); if (a === 'sell') b.sell(t); closeTowerMenu(); };
  };
  $('#next').onclick = () => b.callWave(true);
  $('#pause').onclick = () => {
    b.paused = true;
    const md = modal(`<div class="panel col center pausebox"><div class="ribbon tx">Пауза</div><button class="btn big green" data-a="go">${bic('continue')}Продолжить</button><button class="btn big" data-a="re">${bic('restart')}Заново</button><button class="btn big red" data-a="quit">${bic('exit')}Выйти</button></div>`, { onClose: () => { b.paused = false; } });
    md.el.querySelector('[data-a=go]').onclick = () => md.close();
    md.el.querySelector('[data-a=re]').onclick = () => { md.el.remove(); b.stop(); startBattle(L); };
    md.el.querySelector('[data-a=quit]').onclick = () => { md.el.remove(); b.stop(); S.battle = null; render(); };
  };
  b.start();
  if (!S.me.progress && L.idx === 1 && !localStorage.getItem('bb_tut')) {
    try { localStorage.setItem('bb_tut', '1'); } catch {}
    b.paused = true;
    const md = modal(`<div class="panel col"><div class="center"><div class="ribbon tx">Как играть</div></div><div class="parch">1. Выбери карту внизу и коснись свободной земли — там встанет башня (стоит ману). Нельзя строить на дороге, в воде и на камнях. Поле двигается пальцем, щипком — масштаб.<br>2. Ослабевшего монстра (красный прицел) <b>добей касанием</b> — серии добиваний дают ману и очки.<br>3. Заряди <b>метеор</b> добиваниями и обрушь его на толпу.<br>4. Башни вместе дают <b>комбо</b> — смотри на карточках!</div><button class="btn green">${bic('ok')}Понятно!</button></div>`, { onClose: () => { b.paused = false; } });
    md.el.querySelector('.btn.green').onclick = () => md.close();
  }
}
// Итог боя (как в Clash Royale): звёзды, шкала опыта заполняется (с переходом уровня), затем выпадение —
// карточка переворачивается лицом или сундук падает с отскоком.
async function endBattle(L, res, b) {
  step(res.win ? 'b_win' : 'b_lose');
  const old = { lvl: S.me.lvl, xp: S.me.xp, next: S.me.xpNext };
  // оценка из 5 делений, каждое — пустое, наполовину или полное (шаг 0,5): победа даёт от 1 до 5 по сохранённым жизням,
  // поражение — до 2 делений за то, сколько волн выстояли
  const lf = Math.max(0, Math.min(1, res.lives / b.maxLives)), wf = Math.max(0, Math.min(1, (res.waves || 0) / Math.max(1, b.waves.length)));
  const rate = res.win ? Math.max(1, Math.round((1 + 4 * lf) * 2) / 2) : Math.round(wf * 2 * 2) / 2;
  const stars = !res.win ? 0 : rate >= 4.5 ? 3 : rate >= 3 ? 2 : 1;
  const md = modal(`<div class="result ${res.win ? 'win' : 'lose'}">
    <div class="rrate" aria-label="Оценка ${rate} из 5">${[0, 1, 2, 3, 4].map(i => { const v = rate - i >= 1 ? 'full' : rate - i >= 0.5 ? 'half' : 'empty';
      return `<span class="rr ${v}" style="--d:${0.25 + i * 0.16}s;--cx:${[19.17, 34.59, 50, 65.41, 80.83][i]}%"><img src="img/ui/kit5/rate_empty.webp" alt="">${v === 'empty' ? '' : `<img class="fill" src="img/ui/kit5/rate_${v}.webp" alt="">`}</span>`; }).join('')}</div>
    <div class="ribbon tx rtitle">${res.win ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</div>
    <div class="rtiles"><div class="rt"><small>Время</small><b class="num">⏱ ${clock(res.secs)}</b></div><div class="rt"><small>Очки</small><b class="num" id="rsc">0</b></div><div class="rt xp"><small>Опыт</small><b class="num" id="rxg">+0</b></div></div>
    <div class="rstats"><span>${ic('ic_skull')}<b class="num">${res.kills}</b><small>убито</small></span><span>${ic('ic_fist')}<b class="num">${res.finishers}</b><small>добито</small></span></div>
    <div class="rxp"><div class="rlv num" id="rlv">${old.lvl}</div><div class="rbar"><i id="rbi" style="width:${Math.min(100, old.xp / old.next * 100)}%"><em class="rmark"></em></i><span class="num" id="rbt">${fmt(old.xp)} / ${fmt(old.next)}</span></div><b class="num rxpv" id="rxp"></b></div>
    <div class="rdrop" id="rdrop"></div>
    <div class="tx small dim center" id="rw"></div>
    <div class="rplace" id="rplace"></div>
    <div class="ractions"><button class="act" data-a="menu">${bic('exit', '')}<span>Меню</span></button><button class="act" data-a="again">${bic('retry', '')}<span>Ещё раз</span></button>${res.win && !L.weekly && L.idx < LEVELS.length ? `<button class="act on" data-a="next">${bic('continue', '')}<span>Дальше</span></button>` : ''}</div>
  </div>`, { closable: false, cls: 'resultbox' });
  const r = await Api.finish(L.id, res.win, res.score, { kills: res.kills, waves: res.waves, secs: res.secs, finishers: res.finishers, combo: res.bestCombo });
  const q = sel => md.el.querySelector(sel), wait = ms => new Promise(f => setTimeout(f, ms));
  // счётчики «бегут» от нуля (очки сразу, опыт — вместе с полоской)
  const countUp = (el, to, ms, pre = '') => { const t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + fmt(Math.round(to * e)); if (k < 1 && el.isConnected) requestAnimationFrame(f); }; requestAnimationFrame(f); };
  countUp(q('#rsc'), res.score, 1100);
  if (r.error) { q('#rw').textContent = errText(r.error); }
  else {
    setMe(r);
    const w = r.reward || {};
    if (w.record) q('#rw').innerHTML = '<span style="color:#ffe14d">НОВЫЙ РЕКОРД!</span>';
    // место в мире на этом уровне (как в Baalgor): «Место 2 из 87 в мире» + похвала и пирамида
    if (res.win) Api.place(L.id, res.score).then(pl => { if (!pl?.ok || !md.el.isConnected) return; const t = placeText(pl.rank, pl.total);
      q('#rplace').innerHTML = `${pyramidSvg(t.pct)}<div><b>${t.place}</b><span>${t.praise}</span></div>`; q('#rplace').classList.add('show'); });
    await wait(700);
    // опыт — шкала, при переходе уровня: доливаем до конца, вспышка, новый уровень, дальше
    q('#rxp').textContent = `+${fmt(w.xp || 0)} XP`; countUp(q('#rxg'), w.xp || 0, 900, '+'); q('.rbar').classList.add('fill');
    const bar = q('#rbi'), txt = q('#rbt');
    let lv = old.lvl, xp = old.xp, next = old.next, left = w.xp || 0;
    while (left > 0) {
      const add = Math.min(left, next - xp); xp += add; left -= add;
      bar.style.transition = 'width .7s cubic-bezier(.3,.8,.3,1)'; bar.style.width = `${Math.min(100, xp / next * 100)}%`; txt.textContent = `${fmt(xp)} / ${fmt(next)}`;
      await wait(750);
      if (xp >= next && lv < r.lvl) {
        lv++; xp = 0; next = lv === r.lvl ? r.xpNext : Math.round(120 * Math.pow(lv, 1.45));
        q('#rlv').textContent = lv; q('.rxp').classList.add('lvup'); Sfx.play('upgrade');
        bar.style.transition = 'none'; bar.style.width = '0%'; await wait(450); q('.rxp').classList.remove('lvup');
      } else break;
    }
    q('.rbar')?.classList.remove('fill');
    if (w.levelUp) note('+1 очко навыков — загляни в профиль');
    // выпадение
    if (w.card) {
      const d = q('#rdrop'); d.innerHTML = `<div class="flip"><div class="back"><img src="${uiImg('ic_cards')}" alt=""></div><div class="front">${cardHTML(w.card, { mini: true, grade: w.grade || 0 })}</div></div><div class="tx small">Новая карта!</div>`;
      await wait(60); d.classList.add('show'); Sfx.play('reveal', 2); await wait(500); d.querySelector('.flip').classList.add('open'); Sfx.play('reveal', 3);
    } else if (w.chest) {
      const d = q('#rdrop'); d.innerHTML = `<img class="dropchest" src="${uiImg('chest_' + w.chest)}" alt=""><div class="tx small">${esc(CHESTS[w.chest].name)}!</div><button class="btn sm green" id="openc">${bic('open')}Открыть</button>`;
      await wait(60); d.classList.add('show', 'chest'); Sfx.play('chestTap', 2);
      q('#openc').onclick = () => { md.el.remove(); b.stop(); S.battle = null; S.tab = 'battle'; render(); openChestKind(w.chest); };
    }
  }
  md.el.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    md.el.remove(); b.stop(); S.battle = null;
    const go = () => { if (a === 'again') startBattle(L); else if (a === 'next') levelSheet(LEVELS[L.idx]); else { S.tab = 'battle'; render(); } };
    if (!adAsk(go)) go();
  };
}

// Окно «Награда за рекламу» (как в Baalgor): после каждого боя, когда игрок уходит с итогов. Награда выбрана заранее и видна в окне:
// 1–3 самоцвета 60%, бустер 35%, обычный сундук 5% (самый ценный — самый редкий). Начисляет сервер (bb_ad_claim) за просмотр,
// который подтвердил AdsGram. after — куда игрок шёл; false — окно не показано (реклама не настроена или вне Telegram).
// не чаще чем каждый 3-й выход из боя и не раньше чем через 3 минуты после прошлого предложения — реклама не надоедает
let adN = 0, adAt = 0;
function adAsk(after) {
  const x = Math.random(), kind = x < 0.05 ? 'chest' : x < 0.3 ? 'booster' : 'prisms';
  if (!Ads.on(kind) || ++adN % 3 !== 0 || Date.now() - adAt < 180000) return false;
  adAt = Date.now(); step('ad_show');
  const pic = kind === 'chest' ? uiImg('chest_common') : kind === 'booster' ? uiImg('boost/xp15_30') : uiImg('ic_prism');
  const txt = kind === 'chest' ? 'Обычный сундук' : kind === 'booster' ? 'Случайный бустер' : `${ic('ic_prism')} 1–3 самоцвета`;
  const md = modal(`<div class="panel col center adask"><div class="ribbon tx">Награда за рекламу</div><img class="adpic" src="${pic}" alt="">
    <div class="tx adprize">${txt}</div><div class="small">Посмотри короткий ролик до конца — награда твоя</div>
    <button class="btn green" id="adgo">${bic('continue')}Смотреть</button><button class="btn gray" id="adskip">Пропустить</button></div>`, { closable: false });
  const q = s => md.el.querySelector(s);
  q('#adskip').onclick = () => { md.close(); after(); };
  q('#adgo').onclick = async () => {
    const b = q('#adgo'); if (b.disabled) return; b.disabled = true;
    const res = await Ads.show(kind); b.disabled = false; step('ad_' + res);
    if (res !== 'done') return note(Ads.say(res));
    let r = null;
    for (let i = 0; i < 6; i++) { r = await Api.adClaim(kind); if (r.error !== 'ad_pending') break; await new Promise(f => setTimeout(f, 1500)); }   // подтверждение от AdsGram приходит за секунды
    md.close();
    if (r?.error) note(errText(r.error));
    else { setMe(r); const pz = r.prize || {}; toast(pz.kind === 'prisms' ? `+${pz.n} самоцветов!` : pz.kind === 'booster' ? `Бустер: ${BOOSTERS[pz.id]?.name || ''}` : 'Сундук на складе!', '#ff8ad8'); }
    after();
  };
  return true;
}
// Стартовый набор (как в Baalgor): только на главном экране, со 2-го захода, пока не куплен, не чаще раза в 3 дня; кнопка покупки
// первые 0,9 с не нажимается (чтобы не купить случайно пальцем, который закрывал прошлое окно).
function maybeOffer() {
  if (!inTelegram || S.starter || (S.visits || 0) < 2 || S.tab !== 'battle' || S.battle || document.querySelector('.modal')) return false;
  let at = 0; try { at = +localStorage.getItem('bb_offer_at') || 0; } catch {}
  if (Date.now() - at < 3 * 864e5) return false;
  try { localStorage.setItem('bb_offer_at', String(Date.now())); } catch {}
  const T = STARTER, worth = Math.round((T.prisms + T.chests.magic * CHESTS.magic.prisms + T.chests.legend * CHESTS.legend.prisms) / (PACKS[0].prisms / PACKS[0].stars));
  const md = modal(`<div class="panel col center offerbox"><div class="ribbon tx">Один раз</div><img class="adpic" src="${uiImg('chest_legend')}" alt="">
    <h2 class="tx">Стартовый набор</h2>
    <ul class="olist"><li>${ic('ic_prism')} ${T.prisms} самоцветов</li><li><img class="ic" src="${uiImg('chest_magic')}" alt=""> 2 магических сундука</li><li><img class="ic" src="${uiImg('chest_legend')}" alt=""> Легендарный сундук</li></ul>
    <div class="small oworth">Выгода: на ${worth} ${PAYIC.star} товаров за ${T.stars} ${PAYIC.star}</div>
    <button class="btn green buy" id="ofbuy">Купить за ${PAYIC.star}${T.stars}</button><button class="btn gray" id="oflater">Позже</button></div>`);
  const q = s => md.el.querySelector(s), b = q('#ofbuy');
  b.style.pointerEvents = 'none'; setTimeout(() => { b.style.pointerEvents = ''; }, 900);
  step('offer_show');
  q('#oflater').onclick = () => md.close();
  b.onclick = () => { step('offer_buy'); md.close(); payModal('starter', () => { S.starter = true; }); };
  return true;
}

if (/[?&]debug/.test(location.search)) window.__bb = { S, Api, render };
boot();
