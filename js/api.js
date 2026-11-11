// Связь с сервером: функции bb_* в Supabase (supabase/blitz.sql).
// В Telegram игрок определяется подписью initData, вне Telegram — анонимной сессией Supabase Auth (токены в localStorage).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=20261111151953';

const TG = window.Telegram?.WebApp;
export const initData = TG?.initData || '';
export const inTelegram = !!initData;
const LS = 'bb_auth';

let session = null;
function loadSession() { try { session = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { session = null; } }
function saveSession(s) { session = s; try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} }

async function auth(path, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j.msg || j.error_description || 'auth');
  return { access: j.access_token, refresh: j.refresh_token, exp: Date.now() / 1000 + (j.expires_in || 3600) - 60 };
}
async function token() {
  if (inTelegram) return null;
  if (!session) loadSession();
  if (session && session.exp > Date.now() / 1000) return session.access;
  if (session?.refresh) { try { saveSession(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh })); return session.access; } catch {} }
  saveSession(await auth('signup', {}));          // анонимный вход
  return session.access;
}

export async function rpc(fn, args = {}) {
  const tk = await token();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => ({ error: 'network' }));
  if (!r.ok) return { error: j.message || 'network' };
  return j;
}
const P = () => ({ p_init: initData });

export const Api = {
  profile: () => rpc('bb_profile', P()),
  setName: name => rpc('bb_set_name', { ...P(), p_name: name }),
  setDeck: ids => rpc('bb_set_deck', { ...P(), p_deck: ids }),
  skillUp: id => rpc('bb_skill_up', { ...P(), p_skill: id }),
  skillReset: () => rpc('bb_skill_reset', P()),
  upgrade: cardUid => rpc('bb_card_upgrade', { ...P(), p_card: cardUid }),
  dust: cardUid => rpc('bb_card_dust', { ...P(), p_card: cardUid }),
  dustMany: ids => rpc('bb_dust_many', { ...P(), p_cards: ids }),
  openChest: (kind, n = 1) => rpc('bb_open_chest', { ...P(), p_kind: kind, p_n: n }),
  useBoost: (id) => rpc('bb_use_boost', { ...P(), p_id: id }),
  buy: (item, n = 1) => rpc('bb_buy', { ...P(), p_item: item, p_n: n }),
  daily: () => rpc('bb_daily', P()),
  finish: (level, win, score, stats) => rpc('bb_finish', { ...P(), p_level: String(level), p_win: win, p_score: score, p_stats: stats }),
  market: (rarity = null, card = null, sort = 'new') => rpc('bb_market', { p_rarity: rarity, p_card: card, p_sort: sort }),
  marketStats: card => rpc('bb_market_stats', { p_card: card }),
  sell: (cardUid, price, currency = 'prisms') => rpc('bb_market_sell', { ...P(), p_card: cardUid, p_price: price, p_currency: currency }),
  cancel: listing => rpc('bb_market_cancel', { ...P(), p_listing: listing }),
  buyListing: listing => rpc('bb_market_buy', { ...P(), p_listing: listing }),
  week: (limit = 100) => rpc('bb_week_top', { p_limit: limit, ...P() }),
  weekSeen: (week) => rpc('bb_week_seen', { ...P(), p_week: week }),
  top: (level, limit = 3) => rpc('bb_top', { p_level: String(level), p_limit: limit, ...P() }),
  world: (limit = 100) => rpc('bb_world', { p_limit: limit, ...P() }),
  place: (level, score) => rpc('bb_place', { ...P(), p_level: String(level), p_score: score }),
  adClaim: kind => rpc('bb_ad_claim', { ...P(), p_kind: kind }),
  visit: src => rpc('bb_visit', { ...P(), p_src: src || null }),
  // покупка Самоцветов за Telegram Stars: ссылка на счёт от edge-функции
  // крипта (как в Mortis): счёт Crypto Bot / xRocket (ссылка) или реквизиты перевода для кошелька TON
  async cryptoInvoice(pack, provider, asset) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/bb-crypto-invoice`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ init_data: initData, pack, provider, asset }) });
    return r.json().catch(() => ({ error: 'network' }));
  },
  async tonVerify(order) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/bb-ton-verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ init_data: initData, order }) });
    return r.json().catch(() => ({ error: 'network' }));
  },
  async invoice(pack) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/bb-create-invoice`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ init_data: initData, pack }) });
    return r.json().catch(() => ({ error: 'network' }));
  },
};

export const ERR = {
  stronger_active: 'Уже действует зелье сильнее — дождись его окончания', no_item: 'Этого бустера нет в рюкзаке',
  auth: 'Не удалось войти. Проверь интернет.', network: 'Нет связи с сервером', coins: 'Не хватает монет', prisms: 'Не хватает самоцветов',
  no_chest: 'Нет такого сундука', listed: 'Карта выставлена на рынок', max: 'Максимальный уровень', sold: 'Лот уже купили', own: 'Это твой лот',
  limit: 'Не больше 20 лотов', price: 'Неверная цена', locked: 'Сначала открой предыдущий уровень', too_fast: 'Слишком быстро', implausible: 'Результат не принят',
  no_points: 'Нет очков навыков', done: 'Уже получено сегодня', not_owned: 'Это не твоя карта', deck_size: 'В колоде максимум 6 карт', short: 'Слишком короткое имя',
  not_tg: 'Покупка доступна в Telegram', stars_tg: 'Лот за Stars оплачивается в Telegram', in_deck: 'Сначала убери карту из колоды', ad_limit: 'На сегодня награды за рекламу закончились', ad_pending: 'Награда ещё не подтверждена — попробуй через минуту', starter_owned: 'Стартовый набор уже куплен', disabled: 'Этот способ оплаты ещё не подключён', provider: 'Платёжный сервис не ответил, попробуй позже', no_card: 'Карты нет', disabled: 'Покупки пока недоступны',
};
export const errText = e => ERR[e] || (typeof e === 'string' && e.length < 60 ? e : 'Что-то пошло не так');
