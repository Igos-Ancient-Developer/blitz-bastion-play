// Воронка новичка (как в Baalgor, blood-keep/js/track.js): отметка «открыл игру» с меткой ?startapp=… грузится отдельным модулем
// раньше main.js — так в отчёт попадают и те, кто закрыл игру, не дождавшись загрузки. Шаги и отчёты — supabase/blitz_funnel.sql.
// Только в Telegram (нужна подпись initData). Каждый шаг уходит на сервер один раз за запуск игры; сервер считает повторы.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=20261111201705';

const TG = window.Telegram?.WebApp;
const init = TG?.initData || '';
const sent = new Set();

export function step(name) {
  if (!init || !name || sent.has(name)) return;
  sent.add(name);
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_track`, {
      method: 'POST', keepalive: true,
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_init: init, p_step: name, p_src: name === 'open' ? (TG.initDataUnsafe?.start_param || null) : null }),
    }).catch(() => {});
  } catch {}
}
// ошибки JS у живых игроков тоже видны в воронке (err_js), чтобы ловить баги, из-за которых уходят
let nerr = 0;
function err(kind, msg) {
  step(kind);
  if (!init || ++nerr > 5) return;
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_err`, { method: 'POST', keepalive: true, headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_init: init, p_msg: `${kind} ${msg} | ${location.pathname}${location.search} | ${navigator.userAgent.slice(0, 120)}` }) }).catch(() => {});
  } catch {}
}
window.addEventListener('error', e => err('err_js', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno} ${(e.error && e.error.stack || '').split('\n').slice(1, 4).join(' / ')}`));
window.addEventListener('unhandledrejection', e => err('err_promise', String(e.reason && (e.reason.stack || e.reason.message) || e.reason).slice(0, 400)));
step('open');
