// Подключение к Supabase. Publishable-ключ ПУБЛИЧНЫЙ (права ограничены функциями bb_* из supabase/blitz.sql).
// Игра живёт в схеме blitz проекта HellTD (на бесплатном тарифе лимит 2 активных проекта); перенос — выполнить blitz.sql в новом проекте и сменить URL/ключ.
export const SUPABASE_URL = 'https://sqhbrxjefabzybwtcvkt.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_DsExdZ4Wa0nJST1N_iRMMQ_9DXMWG_Q';
// Ссылка на бота игры (для приглашений). Заполнить после создания бота в @BotFather.
export const APP_LINK = 'https://t.me/blitz_bastion_bot';
// Реклама за награду (AdsGram): номера блоков площадки Blitz Bastion из partner.adsgram.ai. Пока пусто — окна рекламы не показываются.
// У каждого места свой блок, чтобы в кабинете было видно, какое место приносит больше (как в Baalgor).
export const ADS = { prisms: '', booster: '', chest: '' };
// Способы пополнения (как в Mortis Game). true — включено (на сервере заданы секреты: CRYPTO_PAY_TOKEN / XROCKET_KEY / TON_WALLET).
// sbpUrl — ссылка «Нет звёзд? Купи за ₽ по СБП» (сервис продажи Stars за рубли); пусто — ссылка не показывается.
export const PAY = { cryptobot: false, xrocket: false, ton: true, gift: false, sbpUrl: '' };
