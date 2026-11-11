// Реклама за награду (AdsGram), как в Baalgor (blood-keep/js/ads.js). Номера блоков — в config.js (ADS): у каждого места свой блок.
// SDK грузится только при первом показе. Вне Telegram и без номера блока окно рекламы не показывается.
// show(kind) → 'done' (досмотрел) | 'skip' (закрыл раньше) | 'none' (рекламы сейчас нет) | 'error'.
// Награду начисляет сервер: AdsGram сам сообщает о просмотре (Reward URL → bb-ad-reward), игра лишь забирает её (bb_ad_claim).
import { ADS } from './config.js?v=20261111200246';

const tg = window.Telegram && window.Telegram.WebApp;
const SDK = 'https://sad.adsgram.ai/js/sad.min.js';
let loadP = null;
const ctrls = {};

function load() {
  if (window.Adsgram) return Promise.resolve();
  return loadP ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = SDK; s.async = true;
    s.onload = () => (window.Adsgram ? res() : rej(new Error('sdk')));
    s.onerror = () => { loadP = null; s.remove(); rej(new Error('load')); };
    document.head.appendChild(s);
  });
}

export const Ads = {
  on: kind => !!(ADS[kind] && tg && tg.initData),
  async show(kind) {
    if (!Ads.on(kind)) return 'none';
    try {
      await load();
      const c = ctrls[kind] ||= window.Adsgram.init({ blockId: String(ADS[kind]) });
      const r = await c.show();
      return r && r.done ? 'done' : 'skip';
    } catch (e) {
      if (e && e.description && /no ?ads|no ads/i.test(e.description)) return 'none';
      return e && e.done === false ? 'skip' : 'error';
    }
  },
  say: res => res === 'skip' ? 'Награда — только за просмотр до конца' : res === 'none' ? 'Сейчас рекламы нет, попробуй позже' : 'Реклама не загрузилась',
};
