// Языки интерфейса (как в Baalgor, blood-keep/js/i18n.js). Тексты в коде написаны по-русски; для других языков словарь js/lang/<код>.js
// (ключ — русская строка) подменяет текст в построенной странице и во всём, что добавляется позже (MutationObserver), а tr() — текст на холсте.
// Порядок: строка целиком → шаблон с {} (весь шаблон из кода, порядок слов языка) → куски фраз, самые длинные первыми.
// Словари собирает tools/i18n/pack.py из tools/i18n/tr/<код>.txt; ключи — tools/i18n/extract.mjs. Новые русские строки в коде без пересборки остаются по-русски.
// Язык: ?lang=xx → выбор игрока (localStorage) → язык Telegram → язык браузера; незнакомые — английский, СНГ — русский.
// [код, название на своём языке, флаг]
export const LANGS = [
  ['ru', 'Русский', '🇷🇺'], ['en', 'English', '🇬🇧'], ['uk', 'Українська', '🇺🇦'], ['es', 'Español', '🇪🇸'], ['pt', 'Português', '🇧🇷'],
  ['de', 'Deutsch', '🇩🇪'], ['tr', 'Türkçe', '🇹🇷'], ['fr', 'Français', '🇫🇷'], ['it', 'Italiano', '🇮🇹'], ['pl', 'Polski', '🇵🇱'],
  ['id', 'Bahasa Indonesia', '🇮🇩'], ['vi', 'Tiếng Việt', '🇻🇳'], ['ar', 'العربية', '🇸🇦'], ['fa', 'فارسی', '🇮🇷'], ['hi', 'हिन्दी', '🇮🇳'],
  ['uz', 'Oʻzbekcha', '🇺🇿'], ['kk', 'Қазақша', '🇰🇿'], ['zh', '简体中文', '🇨🇳'], ['ja', '日本語', '🇯🇵'],
];
const RTL = ['ar', 'fa'];
// разделитель тысяч и десятичный знак (в тексте игры числа в русском виде: «1 300», «1,5»)
const NUMFMT = { en: [',', '.'], zh: [',', '.'], ja: [',', '.'], hi: [',', '.'], ar: [',', '.'], fa: [',', '.'], uk: [' ', ','], kk: [' ', ','], uz: [' ', ','], pl: [' ', ','], fr: [' ', ','], es: ['.', ','], pt: ['.', ','], de: ['.', ','], tr: ['.', ','], it: ['.', ','], id: ['.', ','], vi: ['.', ','] };
const KEY = 'bb_lang';
export let lang = 'ru';

const CYR = /[А-Яа-яЁё]/;
const NUMS = /\d[   ]\d{3}|\d,\d/;
let exact = new Map(), pats = [], regs = [], grp = '', decSep = ',';

export function pickLang() {
  let c = '';
  try { c = (new URLSearchParams(location.search).get('lang') || '').toLowerCase(); } catch { /* */ }
  if (!c) try { c = localStorage.getItem(KEY) || ''; } catch { /* */ }
  if (!c) {
    let tgc = ''; try { tgc = window.Telegram.WebApp.initDataUnsafe.user.language_code || ''; } catch { /* */ }
    c = (tgc || navigator.language || 'en').toLowerCase().slice(0, 2);
    if (['be', 'ky', 'tg', 'tt', 'ba', 'hy', 'mo', 'ab', 'os', 'ce', 'cv', 'sah'].includes(c)) c = 'ru'; else if (c === 'ms') c = 'id'; else if (c === 'az') c = 'tr';
  }
  return LANGS.some(l => l[0] === c) ? c : 'en';
}
export function setLang(code) { try { localStorage.setItem(KEY, code); } catch { /* */ } const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href); }

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function initLang(code) {
  lang = code; document.documentElement.lang = code; document.documentElement.classList.add('lang-' + code);
  if (RTL.includes(code)) document.documentElement.classList.add('rtl');
  if (code === 'ru') return;
  let dict; try { dict = (await import(`./lang/${code}.js?v=20261111201213`)).default; } catch { lang = 'ru'; return; }
  exact = new Map();
  const pieces = [];
  for (const [k, v] of Object.entries(dict)) {
    if (!k.includes('{}')) { exact.set(k, v); pieces.push(k); continue; }
    // шаблон: «Место {} из {} в мире» → /Место (.+?) из (.+?) в мире/; в переводе {} по порядку или {1}, {2}
    const parts = k.split('{}'), re = new RegExp('^' + parts.map(esc).join('(.+?)') + '$', 's');
    let i = 0; const to = v.replace(/\{(\d*)\}/g, (m, d) => '\u0000' + (d ? +d : ++i) + '\u0000');
    pats.push([re, to, parts.join('').length]);
  }
  pats.sort((a, b) => b[2] - a[2]);
  let behind = true; try { new RegExp('(?<!a)b'); } catch { behind = false; }         // iOS < 16.4
  regs = pieces.sort((a, b) => b.length - a.length).map(k => {
    const lead = /^\p{L}/u.test(k), b = /\p{L}$/u.test(k) ? '(?!\\p{L})' : '';
    if (!lead) return [new RegExp(esc(k) + b, 'gu'), dict[k].replace(/\$/g, '$$$$')];
    if (behind) return [new RegExp('(?<!\\p{L})' + esc(k) + b, 'gu'), dict[k].replace(/\$/g, '$$$$')];
    return [new RegExp('(^|[^\\p{L}])' + esc(k) + b, 'gu'), '$1' + dict[k].replace(/\$/g, '$$$$')];
  });
  [grp, decSep] = NUMFMT[code] || [',', '.'];
  translateTree(document.body); document.title = tr(document.title);
  new MutationObserver(onMut).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
}

// перевод фрагментов (без шаблонов): самые длинные куски первыми
function pieceTr(s) {
  const trimmed = s.trim(), hit = exact.get(trimmed);
  if (hit !== undefined) return s.replace(trimmed, hit);
  for (const [re, to] of regs) { s = s.replace(re, to); if (!CYR.test(s)) break; }
  return s;
}
// перевод одной строки (для текста на холсте и собранного кодом)
export function tr(s) {
  if (lang === 'ru' || !s || typeof s !== 'string') return s;
  if (CYR.test(s)) {
    const trimmed = s.trim();
    if (exact.has(trimmed)) s = s.replace(trimmed, exact.get(trimmed));
    else {
      let done = false;
      for (const [re, to] of pats) {
        const m = trimmed.match(re); if (!m) continue;
        s = s.replace(trimmed, to.replace(/\u0000(\d+)\u0000/g, (x, n) => pieceTr(m[+n] ?? ''))); done = true; break;
      }
      if (!done || CYR.test(s)) s = pieceTr(s);                // «{}{}» делит вставку неточно — остаток добиваем кусками
    }
  }
  if (NUMS.test(s)) {                                          // 1 300 → 1,300 / 1.300; 1,5 → 1.5
    s = s.replace(/(\d)[   ](\d{3})/g, `$1${grp}$2`);
    if (decSep !== ',') s = s.replace(/(\d),(\d)(?!\d{2})/g, `$1${decSep}$2`);
  }
  return s;
}
export const t = tr;

const done = new WeakMap();
function doText(n) {
  const v = n.nodeValue; if (!v || done.get(n) === v) return;
  const p = n.parentElement; if (p && (p.closest('[translate="no"]') || p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) return;
  const nv = (CYR.test(v) || NUMS.test(v)) ? tr(v) : v; done.set(n, nv);
  if (nv !== v) n.nodeValue = nv;
}
function doEl(e) {
  for (const a of ['aria-label', 'title', 'placeholder']) { const v = e.getAttribute && e.getAttribute(a); if (v && CYR.test(v)) { const nv = tr(v); if (nv !== v) e.setAttribute(a, nv); } }
}
function translateTree(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1) return;
  doEl(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n;
  while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
}
function onMut(list) {
  for (const m of list) {
    if (m.type === 'childList') m.addedNodes.forEach(translateTree);
    else if (m.type === 'characterData') doText(m.target);
    else if (m.type === 'attributes') doEl(m.target);
  }
}
