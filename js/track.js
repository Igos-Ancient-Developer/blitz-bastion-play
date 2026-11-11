// Воронка новичка (как в Baalgor, blood-keep/js/track.js): отметка «открыл игру» с меткой ?startapp=… грузится отдельным модулем
// раньше main.js — так в отчёт попадают и те, кто закрыл игру, не дождавшись загрузки. Шаги и отчёты — supabase/blitz_funnel.sql.
// Только в Telegram (нужна подпись initData). Каждый шаг уходит на сервер один раз за запуск игры; сервер считает повторы.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=20261111150547';

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
window.addEventListener('error', () => step('err_js'));
window.addEventListener('unhandledrejection', () => step('err_promise'));
step('open');
