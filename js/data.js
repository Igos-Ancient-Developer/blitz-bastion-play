// Игровые данные: редкости, башни-карточки, враги, комбо, сундуки, бустеры, навыки, магазин.
// Цены и шансы, которые решают на сервере, продублированы в supabase/blitz.sql (менять в обоих местах).

export const RARITIES = {
  common:    { name: 'Обычная',     color: '#b8c2cf', dark: '#5d6876', glow: 'rgba(200,210,225,.55)', cost: 3, order: 0 },
  magic:     { name: 'Магическая',  color: '#3d8bff', dark: '#1a3f8f', glow: 'rgba(61,139,255,.6)',  cost: 4, order: 1 },
  rare:      { name: 'Редкая',      color: '#b25cff', dark: '#5a1f99', glow: 'rgba(178,92,255,.6)',  cost: 5, order: 2 },
  legendary: { name: 'Легендарная', color: '#ffb020', dark: '#9a5a00', glow: 'rgba(255,176,32,.65)', cost: 6, order: 3 },
  mystic:    { name: 'Мистическая', color: '#ff2d7a', dark: '#8a0838', glow: 'rgba(255,45,122,.7)',  cost: 7, order: 4 },
};
export const RARITY_ORDER = ['common', 'magic', 'rare', 'legendary', 'mystic'];

// Башни и здания (сказочный сеттинг). range — в клетках, rate — выстрелов в секунду, dmg — урон за выстрел.
// type: tower (стреляет) или building (усиливает). air: бьёт ли по летающим. death — как мультяшно погибает враг от этой башни.
export const TOWER_DEFS = {
  archer:    { name: 'Башня лучников',   rarity: 'common',    type: 'tower', dmg: 8,  rate: 2.2, range: 2.8, air: true,  proj: 'arrow',  death: 'pin',   desc: 'Меткие лучники осыпают врагов стрелами. Надёжная основа обороны.' },
  catapult:  { name: 'Катапульта',       rarity: 'common',    type: 'tower', dmg: 26, rate: 0.7, range: 3.0, air: false, proj: 'rock',   splash: 0.9, death: 'launch', desc: 'Швыряет валуны: взрыв задевает всех рядом и разносит врагов на куски.' },
  grease:    { name: 'Жирометатель',     rarity: 'common',    type: 'tower', dmg: 4,  rate: 0.8, range: 2.6, air: false, proj: 'barrel', splash: 0.8, grease: 3, death: 'slip', desc: 'Обливает врагов жиром с ног до головы: они скользят и тормозят на 35%. Жирных огонь жжёт вдвое сильнее.' },
  coop:      { name: 'Боевой курятник', rarity: 'common',    type: 'tower', dmg: 9,  rate: 0.5, range: 2.6, air: false, proj: 'chicken', death: 'puff', desc: 'Выпускает злых кур: они бегут по дороге навстречу врагам и клюют всех, кого встретят.' },
  scarecrow: { name: 'Пугало',           rarity: 'common',    type: 'building', aura: 1.5, fear: 0.15, desc: 'Монстры рядом с пугалом трясутся от страха и идут на 15% медленнее.' },
  mill:      { name: 'Мана-мельница',    rarity: 'common',    type: 'building', energy: 0.35, desc: 'Мелет волшебную ману: +0.35 маны в секунду. Ставь пораньше!' },
  crossbow:  { name: 'Арбалетная башня', rarity: 'magic',     type: 'tower', dmg: 18, rate: 1.1, range: 3.2, air: true,  proj: 'bolt',   pierce: 3, death: 'pin', desc: 'Тяжёлый болт прошивает до трёх врагов в линию.' },
  frostmage: { name: 'Башня ледяного мага', rarity: 'magic',  type: 'tower', dmg: 12, rate: 1.4, range: 2.6, air: true,  proj: 'ice',    slow: 0.5, slowT: 1.5, freeze: 0.12, death: 'shatter', desc: 'Ледяные сферы замедляют на 50%, иногда превращают врага в ледышку — от удара она разлетается.' },
  acid:      { name: 'Кислотный котёл',  rarity: 'magic',     type: 'tower', dmg: 6,  rate: 0.6, range: 2.4, air: false, proj: 'acid',   splash: 0.8, pool: 10, melt: 0.5, death: 'melt', desc: 'Ведьмин котёл выплёскивает кислоту: лужа жжёт и разъедает броню вдвое. Враги плавятся, как мороженое.' },
  candy:     { name: 'Конфетная лавка',  rarity: 'magic',     type: 'tower', dmg: 0,  rate: 0.5, range: 2.8, air: false, proj: 'candy',  death: 'burst', desc: 'Кидает сладости на дорогу. Монстры останавливаются их съесть, толстеют и замедляются, а обжоры лопаются!' },
  bubble:    { name: 'Мыльная башня',    rarity: 'magic',     type: 'tower', dmg: 20, rate: 0.45, range: 2.6, air: false, proj: 'bubble', liftT: 1.8, death: 'launch', desc: 'Запирает монстра в мыльный пузырь и поднимает в воздух. Пузырь лопается — монстр шлёпается об землю.' },
  drum:      { name: 'Боевой барабан',   rarity: 'magic',     type: 'building', aura: 1.6, haste: 0.2, desc: 'Бодрый ритм: башни в радиусе 1.6 клетки стреляют на 20% быстрее.' },
  ballista:  { name: 'Баллиста',         rarity: 'rare',      type: 'tower', dmg: 75, rate: 0.42, range: 4.6, air: true, proj: 'spear',  pierce: 99, knock: 0.5, crit: 0.2, execute: 0.15, death: 'pin', desc: 'Огромное копьё пробивает всю линию и отбрасывает врагов. Крит ×2 и казнь ослабших.' },
  basilisk:  { name: 'Огненный василиск', rarity: 'rare',     type: 'tower', dmg: 5,  rate: 8,   range: 1.9, air: false, proj: 'flame',  burn: 6, cone: true, death: 'char', desc: 'Каменный змей дышит пламенем: поджигает всех в конусе. Враги обугливаются и рассыпаются пеплом.' },
  stormmage: { name: 'Башня грозового мага', rarity: 'rare',  type: 'tower', dmg: 17, rate: 1.0, range: 2.4, air: true,  proj: 'zap',    chain: 3, death: 'electro', desc: 'Цепная молния бьёт трёх врагов подряд — видно, как светятся их скелеты!' },
  beehive:   { name: 'Пчелиный улей',    rarity: 'rare',      type: 'tower', dmg: 6,  rate: 0.7, range: 3.0, air: true,  proj: 'bees',   swarm: 4, poison: 4, panic: 0.2, death: 'puff', desc: 'Рой пчёл жалит и травит ядом. Ужаленные иногда в панике бегут назад!' },
  trapper:   { name: 'Хижина ловчего',   rarity: 'rare',      type: 'tower', dmg: 45, rate: 0.5, range: 2.4, air: false, proj: 'trap',  trapT: 1.8, death: 'squash', desc: 'Ловчий расставляет капканы на дороге: ХРЯСЬ! — монстр застревает и получает урон.' },
  bombard:   { name: 'Гномья бомбарда',  rarity: 'legendary', type: 'tower', dmg: 60, rate: 0.33, range: 4.3, air: false, proj: 'bomb',  splash: 1.3, minRange: 1.2, death: 'launch', desc: 'Гномы палят огромными бомбами через всю карту. Не стреляет вплотную.' },
  treant:    { name: 'Древень',          rarity: 'legendary', type: 'tower', dmg: 30, rate: 0.4, range: 2.3, air: false, proj: 'roots',  roots: 4, rootT: 1.6, death: 'squash', desc: 'Древний дуб опутывает до четырёх врагов корнями и бьёт их о землю.' },
  sheep:     { name: 'Овцемёт',          rarity: 'legendary', type: 'tower', dmg: 55, rate: 0.45, range: 3.6, air: false, proj: 'sheep', splash: 1.1, wool: 0.3, death: 'launch', desc: 'Запускает взрывных овец! Бээээ-БУМ: урон по площади и клочья шерсти, которые путают ноги.' },
  tornado:   { name: 'Храм ветров',      rarity: 'legendary', type: 'tower', dmg: 22, rate: 0.2, range: 3.0, air: true,  proj: 'tornado', push: 2.2, death: 'launch', desc: 'Призывает смерч: он идёт навстречу врагам, крутит их и отбрасывает назад по дороге.' },
  dragon:    { name: 'Логово дракона',   rarity: 'mystic',    type: 'tower', dmg: 42, rate: 1,   range: 2.0, air: true,  proj: 'dragon', burn: 12, death: 'char', desc: 'Дракон кружит над логовом и поливает огнём всех под собой.' },
  fairy:     { name: 'Башня феи-крёстной', rarity: 'mystic',  type: 'tower', dmg: 0,  rate: 0.28, range: 3.0, air: true, proj: 'poly',   death: 'puff', desc: 'Взмах палочки — и монстр становится лягушкой: медленной и хрупкой (урон ×2). Боссов уменьшает.' },
  mirror:    { name: 'Зеркало королевы', rarity: 'mystic',    type: 'building', aura: 1.6, echo: 0.5, desc: 'Волшебное зеркало повторяет выстрелы соседних башен: каждая вторая атака рядом дублируется.' },
  clock:     { name: 'Часовая башня',    rarity: 'mystic',    type: 'tower', dmg: 10, rate: 0.125, range: 2.6, air: true, proj: 'time',   stopT: 2.2, amp: 0.25, death: 'puff', desc: 'Бом! Каждые 8 секунд время вокруг замирает. Застывшие враги получают +25% урона.' },
};
export const TOWER_IDS = Object.keys(TOWER_DEFS);

// Комбинации: если обе карты стоят на поле, включается бонус (показывается на карточке).
export const COMBOS = [
  { id: 'roast',     a: 'grease',   b: 'basilisk', name: 'Жаркое',             desc: 'Жирные враги горят в 2.5 раза сильнее.' },
  { id: 'roast2',    a: 'grease',   b: 'dragon',   name: 'Жаркое',             desc: 'Жирные враги горят в 2.5 раза сильнее.' },
  { id: 'surprise',  a: 'candy',    b: 'catapult', name: 'Обед с сюрпризом',   desc: 'Жующие сладости получают ×2 от взрывов.' },
  { id: 'surprise2', a: 'candy',    b: 'bombard',  name: 'Обед с сюрпризом',   desc: 'Жующие сладости получают ×2 от взрывов.' },
  { id: 'sour',      a: 'candy',    b: 'acid',     name: 'Кислые леденцы',     desc: 'Съевший конфету плавится от кислоты вдвое быстрее.' },
  { id: 'honey',     a: 'candy',    b: 'beehive',  name: 'Медовый пир',        desc: 'Пчёлы лепят мёд: ужаленные сладкоежки замирают на 1 с.' },
  { id: 'icebreak',  a: 'frostmage', b: 'catapult', name: 'Ледокол',           desc: 'Замороженные враги получают +50% от взрывов.' },
  { id: 'supercond', a: 'frostmage', b: 'stormmage', name: 'Сверхпроводник',   desc: 'Молния делает +2 прыжка по замедленным.' },
  { id: 'volley',    a: 'archer',   b: 'drum',     name: 'Град стрел',         desc: 'Лучники пускают по две стрелы.' },
  { id: 'rapid',     a: 'crossbow', b: 'drum',     name: 'Скорострел',         desc: 'Арбалет стреляет ещё на 25% быстрее.' },
  { id: 'timeshot',  a: 'ballista', b: 'clock',    name: 'Выстрел вне времени', desc: 'Крит по застывшим врагам ×3.' },
  { id: 'rootrock',  a: 'treant',   b: 'bombard',  name: 'Корни и камни',      desc: 'Опутанные враги получают +50% от взрывов.' },
  { id: 'froggy',    a: 'fairy',    b: 'stormmage', name: 'Лягушачий разряд',  desc: 'Лягушки получают ×3 от молний.' },
  { id: 'woolfarm',  a: 'sheep',    b: 'mill',     name: 'Шерстяная ферма',    desc: 'Овцемёт стреляет на 30% быстрее.' },
  { id: 'henhouse',  a: 'coop',     b: 'candy',    name: 'Куриный пир',        desc: 'Куры клюют жующих монстров втрое сильнее.' },
  { id: 'bubbleup',  a: 'bubble',   b: 'ballista', name: 'Тир',                desc: 'Монстры в пузыре получают ×2 от баллисты и арбалета.' },
  { id: 'bubbleup2', a: 'bubble',   b: 'crossbow', name: 'Тир',                desc: 'Монстры в пузыре получают ×2 от баллисты и арбалета.' },
  { id: 'firestorm', a: 'tornado',  b: 'basilisk', name: 'Огненный смерч',     desc: 'Смерч поджигает всех, кого крутит.' },
  { id: 'scare',     a: 'scarecrow', b: 'trapper', name: 'Ловушка страха',     desc: 'Испуганные монстры наступают в капканы вдвое чаще.' },
  { id: 'mirrorsheep', a: 'mirror', b: 'sheep',    name: 'Двойная отара',      desc: 'Зеркало всегда дублирует овец.' },
  { id: 'greasefire',a: 'grease',   b: 'stormmage', name: 'Искра в жиру',      desc: 'Молния поджигает жирных врагов.' },
];
export const combosOf = id => COMBOS.filter(c => c.a === id || c.b === id).map(c => ({ ...c, with: c.a === id ? c.b : c.a }));

// Уровень карточки (1–5) усиливает урон/эффект.
export const CARD_MAX_LV = 5;
export const CARD_LV_MULT = [1, 1, 1.18, 1.38, 1.6, 1.85];
// Качество экземпляра карты (выпадает из сундука): характеристики и оформление карточки
export const GRADES = [
  { id: 0, name: 'Простая',     short: '',   mult: 1 },
  { id: 1, name: 'Улучшенная',  short: '+',  mult: 1.15 },
  { id: 2, name: 'Уникальная',  short: '++', mult: 1.3 },
];
// самоцветы за распыление (совпадает с blitz.dust_value на сервере)
export const DUST_BASE = { common: 1, magic: 2, rare: 5, legendary: 12, mystic: 30 };
export const dustValue = (rarity, grade = 0, lvl = 1) => Math.max(1, Math.round(DUST_BASE[rarity] * (1 + grade * 0.5) * (1 + (lvl - 1) * 0.5)));
export const CARD_UP_COST = { common: [0, 120, 300, 700, 1500], magic: [0, 200, 500, 1100, 2300], rare: [0, 320, 800, 1700, 3500], legendary: [0, 500, 1200, 2600, 5200], mystic: [0, 800, 1900, 4000, 8000] };
// В бою башню можно улучшить два раза (★★★): стоимость маны и множитель.
export const FIELD_UP = [{ cost: 0, mult: 1 }, { cost: 3, mult: 1.6 }, { cost: 5, mult: 2.4 }];

// Враги — толстые мультяшные монстры. hp — базовое здоровье, spd — клеток/с, armor — доля поглощаемого урона,
// lives — сколько жизней отнимает у базы, world — где встречается (null — везде).
export const ENEMY_DEFS = {
  piggy:     { name: 'Хрюн',             hp: 40,  spd: 1.0,  armor: 0,    lives: 1, size: 0.66, color: '#ff9fb2', pts: 10 },
  goblin:    { name: 'Гоблин-шустрик',   hp: 26,  spd: 1.85, armor: 0,    lives: 1, size: 0.58, color: '#6cc04a', pts: 12 },
  slime:     { name: 'Пузырь-слизень',   hp: 36,  spd: 0.95, armor: 0,    lives: 1, size: 0.62, color: '#7bdc4f', pts: 12, splits: 'slimelet' },
  slimelet:  { name: 'Слизнёнок',        hp: 14,  spd: 1.25, armor: 0,    lives: 1, size: 0.4,  color: '#7bdc4f', pts: 4, sprite: 'slime', minion: true },
  bat:       { name: 'Нетопырь',         hp: 30,  spd: 1.45, armor: 0,    lives: 1, size: 0.56, color: '#9b5de5', pts: 14, flying: true },
  troll:     { name: 'Тролль-толстяк',   hp: 170, spd: 0.65, armor: 0.3,  lives: 2, size: 0.86, color: '#7aa36b', pts: 32 },
  frogshaman:{ name: 'Жабо-шаман',       hp: 75,  spd: 0.9,  armor: 0,    lives: 1, size: 0.64, color: '#3dbb8a', pts: 26, heals: 6 },
  ghost:     { name: 'Привидение',       hp: 64,  spd: 1.2,  armor: 0,    lives: 1, size: 0.6,  color: '#bfe9ff', pts: 22, blink: true },
  mole:      { name: 'Крот-копатель',    hp: 60,  spd: 1.3,  armor: 0,    lives: 1, size: 0.6,  color: '#8d6e63', pts: 20, burrow: true },
  balloon:   { name: 'Гоблин на шаре',   hp: 90,  spd: 0.8,  armor: 0.15, lives: 1, size: 0.78, color: '#ff5d5d', pts: 26, flying: true, drops: 'goblin' },
  walrus:    { name: 'Морж-толстяк',     hp: 460, spd: 0.45, armor: 0.45, lives: 3, size: 0.98, color: '#a1887f', pts: 60 },
  scorpion:  { name: 'Скорпион-пузан',   hp: 95,  spd: 1.15, armor: 0.4,  lives: 1, size: 0.7,  color: '#e0913a', pts: 26, world: 'canyon' },
  armadillo: { name: 'Броненосец',       hp: 120, spd: 0.8,  armor: 0.2,  lives: 2, size: 0.7,  color: '#b8875a', pts: 28, roll: true, world: 'canyon' },
  penguin:   { name: 'Пингвин-скользун', hp: 48,  spd: 1.05, armor: 0,    lives: 1, size: 0.62, color: '#37474f', pts: 16, slide: true, world: 'glacier' },
  yeti:      { name: 'Пухлый йети',      hp: 330, spd: 0.6,  armor: 0.2,  lives: 2, size: 0.95, color: '#e3f2fd', pts: 50, rage: true, world: 'glacier' },
  boar:      { name: 'Кабан-таран',      hp: 110, spd: 0.85, armor: 0.15, lives: 2, size: 0.78, color: '#8d6e63', pts: 26, charge: true },
  goose:     { name: 'Гусь-скандалист',  hp: 38,  spd: 1.6,  armor: 0,    lives: 1, size: 0.6,  color: '#f5f5f5', pts: 14, honk: true },
  snail:     { name: 'Улитка-крепость',  hp: 260, spd: 0.4,  armor: 0.55, lives: 2, size: 0.82, color: '#ffb74d', pts: 40, trail: true },
  witch:     { name: 'Ведьма на метле',  hp: 85,  spd: 1.1,  armor: 0.1,  lives: 1, size: 0.7,  color: '#7e57c2', pts: 30, flying: true, curse: true },
  bear:      { name: 'Медведь-обжора',   hp: 300, spd: 0.6,  armor: 0.25, lives: 2, size: 0.95, color: '#795548', pts: 46, glutton: true },
  king:      { name: 'Король Обжора',    hp: 2600, spd: 0.38, armor: 0.3, lives: 10, size: 1.35, color: '#ffcf33', pts: 500, boss: true, summon: 'piggy' },
  hippo:     { name: 'Бегемот-султан',   hp: 4300, spd: 0.34, armor: 0.35, lives: 10, size: 1.4, color: '#b39ddb', pts: 800, boss: true, summon: 'goblin' },
  walrusking:{ name: 'Морж-император',   hp: 6600, spd: 0.3,  armor: 0.4, lives: 10, size: 1.45, color: '#90a4ae', pts: 1200, boss: true, roar: true },
};

// Боевые константы
export const BATTLE = {
  energyStart: 10, energyMax: 40, bountyBase: 0.55, bountyPerPt: 0.01, energyPerFinisher: 1,   // мана — за убийства (как золото в Baalgor)
  baseLives: 20, tapDmg: 6, finishAt: 0.18,           // враг ниже 18% здоровья — его можно добить касанием
  comboWindow: 1.6, comboMax: 8,                       // серия убийств: множитель очков до ×8
  firstWave: 30, waveGap: (n) => 26 + Math.min(8, n * 0.25), earlyBonus: 2,   // как в Baalgor: 30 с до первой волны, 26–34 с между волнами (после выхода последнего врага); ранний вызов даёт ⚡ и очки
  deckSize: 5,
};

// Аккаунт: опыт за бой, уровни и очки навыков.
export const xpForLevel = lv => Math.round(120 * Math.pow(lv, 1.45));
// Древо навыков: в каждой ветке корень → две развилки → вершина. req — что нужно изучить раньше (совпадает с blitz.skill_def на сервере).
export const SKILLS = [
  { id: 'atk1', branch: 'atk', tier: 0, col: 1, name: 'Острые заряды',   max: 5, desc: '+4% урона всех башен за уровень' },
  { id: 'atk2', branch: 'atk', tier: 1, col: 0, name: 'Меткий глаз',     max: 3, desc: '+5% шанса крита (урон ×2) за уровень', req: ['atk1', 2] },
  { id: 'atk3', branch: 'atk', tier: 1, col: 2, name: 'Скорострельность', max: 3, desc: '+5% скорости атаки башен за уровень', req: ['atk1', 2] },
  { id: 'atk4', branch: 'atk', tier: 2, col: 0, name: 'Палач',           max: 3, desc: 'Добивание касанием доступно на 4% раньше', req: ['atk2', 1] },
  { id: 'atk5', branch: 'atk', tier: 2, col: 2, name: 'Порох',           max: 3, desc: '+8% радиуса взрывов за уровень', req: ['atk3', 1] },
  { id: 'atk6', branch: 'atk', tier: 3, col: 1, name: 'Гроза боссов',    max: 3, desc: '+10% урона по боссам за уровень', req: ['atk4', 1] },
  { id: 'eco1', branch: 'eco', tier: 0, col: 1, name: 'Запас маны',      max: 5, desc: '+1 мана на старте боя за уровень' },
  { id: 'eco2', branch: 'eco', tier: 1, col: 0, name: 'Трофеи',          max: 5, desc: '+10% маны за убийство врага', req: ['eco1', 2] },
  { id: 'eco3', branch: 'eco', tier: 1, col: 2, name: 'Мельник',         max: 3, desc: '+10% маны от башен-добытчиков', req: ['eco1', 2] },
  { id: 'eco4', branch: 'eco', tier: 2, col: 0, name: 'Скидка',          max: 2, desc: 'Улучшение башни в бою на 1 ману дешевле', req: ['eco2', 2] },
  { id: 'eco5', branch: 'eco', tier: 2, col: 2, name: 'Боевой рог',      max: 3, desc: '+1 мана за ранний вызов волны', req: ['eco3', 1] },
  { id: 'eco6', branch: 'eco', tier: 3, col: 1, name: 'Добытчик',        max: 3, desc: '+10% опыта за победу', req: ['eco4', 1] },
  { id: 'def1', branch: 'def', tier: 0, col: 1, name: 'Толстые стены',   max: 5, desc: '+2 жизни базы за уровень' },
  { id: 'def2', branch: 'def', tier: 1, col: 0, name: 'Дальнобойность',  max: 3, desc: '+5% радиуса башен', req: ['def1', 2] },
  { id: 'def3', branch: 'def', tier: 1, col: 2, name: 'Вязкая земля',    max: 3, desc: 'Все враги на 4% медленнее', req: ['def1', 2] },
  { id: 'def4', branch: 'def', tier: 2, col: 2, name: 'Ледяная хватка',  max: 3, desc: '+10% силы замедления башен', req: ['def3', 1] },
  { id: 'def5', branch: 'def', tier: 2, col: 0, name: 'Соколиный глаз',  max: 3, desc: '+10% урона по летающим', req: ['def2', 1] },
  { id: 'def6', branch: 'def', tier: 3, col: 1, name: 'Второй шанс',     max: 1, desc: 'Один раз за бой база выживает с 1 жизнью', req: ['def4', 1] },
];
export const BRANCHES = { atk: { name: 'Атака', color: '#ff5a3c' }, eco: { name: 'Мана', color: '#3d8bff' }, def: { name: 'Оборона', color: '#5fd35a' } };

// Сундуки: содержимое бросает сервер (supabase/blitz.sql, blitz.roll_chest). Здесь — для показа шансов.
// Шансы как молитвы в Genshin Impact (сервер: supabase/blitz_gacha.sql): в каждом сундуке карта; 5★ (легендарная/мистическая) ~0,6 %
// с гарантией к 90-му сундуку и «мягкой» с 74-го, 4★ (редкая) ~5 % с гарантией каждые 10. cardOdds — итоговые доли для ленты наград.
export const CHESTS = {
  common: { name: 'Обычный сундук',     color: '#b8c2cf', prisms: 15,  prisms_drop: [1, 3],  b5: 0.004, b4: 0.040, cardOdds: { common: 73, magic: 13, rare: 12.5, legendary: 0.75, mystic: 0.75 }, booster: 0.10 },
  magic:  { name: 'Магический сундук',  color: '#3d8bff', prisms: 45,  prisms_drop: [3, 8],  b5: 0.006, b4: 0.051, cardOdds: { common: 47, magic: 38.5, rare: 13, legendary: 0.8, mystic: 0.8 }, booster: 0.18 },
  legend: { name: 'Легендарный сундук', color: '#ffb020', prisms: 140, prisms_drop: [8, 20], b5: 0.009, b4: 0.070, cardOdds: { common: 25, magic: 59, rare: 14, legendary: 0.9, mystic: 0.9 }, booster: 0.25 },
  weekly: { name: 'Еженедельный сундук', color: '#ff2d7a', prisms: 0, prisms_drop: [10, 25], b5: 0.012, b4: 0.090, cardOdds: { common: 16.5, magic: 66.5, rare: 15, legendary: 1, mystic: 1 }, booster: 0.3, weeklyOnly: true },
};
// Бустеры. luck_* увеличивает шанс карты в своём сундуке; luck_weekly работает только на еженедельном уровне.
// Бустеры v2 (= blitz.boost_def() в supabase/blitz_boost2.sql). Зелья действуют по времени после «Выпить» в рюкзаке;
// «Свиток удачи сундука» срабатывает сам при следующем сундуке. legacy — старые, в магазине не продаются, у кого остались — работают.
const BXP = (pct, min, prisms) => ({ name: `Зелье опыта +${pct}%`, icon: `boost/xp${pct}_${min}`, kind: 'xp', pct, min, prisms, group: 'xp', desc: `+${pct}% опыта за бои ${min} минут` });
const BLK = (pct, min, prisms) => ({ name: `Зелье удачи +${pct}%`, icon: `boost/luck${pct}_${min}`, kind: 'luck', pct, min, prisms, group: 'luck', desc: `+${pct}% к шансу трофея с уровня (сундук или карта) ${min} минут` });
export const BOOSTERS = {
  xp15_30: BXP(15, 30, 15), xp15_60: BXP(15, 60, 25), xp25_30: BXP(25, 30, 25), xp25_60: BXP(25, 60, 40),
  xp35_30: BXP(35, 30, 35), xp35_60: BXP(35, 60, 55), xp50_30: BXP(50, 30, 50), xp50_60: BXP(50, 60, 80),
  luck10_30: BLK(10, 30, 20), luck10_60: BLK(10, 60, 32), luck20_30: BLK(20, 30, 35), luck20_60: BLK(20, 60, 55), luck35_30: BLK(35, 30, 55), luck35_60: BLK(35, 60, 90),
  gems25_60:  { name: 'Зелье самоцветов', icon: 'boost/gems', kind: 'gems', pct: 25, min: 60, prisms: 45, group: 'special', desc: '+25% самоцветов из сундуков 60 минут' },
  find:       { name: 'Зелье находки', icon: 'boost/find', kind: 'find', prisms: 40, group: 'special', desc: 'После следующей победы на уровне точно выпадет одно из трёх: сундук, немного самоцветов или карта' },
  chestluck:  { name: 'Свиток удачи сундука', icon: 'boost/chestluck', kind: 'chestluck', prisms: 30, group: 'special', desc: 'Шансы редкой и легендарной карты в следующем сундуке ×1,5. Срабатывает сам' },
  xp2:         { legacy: true, name: 'Двойной опыт', icon: 'ic_boost_xp', desc: '×2 опыта аккаунта за следующие бои' },
  luck_common: { legacy: true, name: 'Удача: обычный', icon: 'ic_boost_luck', desc: 'Шансы в следующем обычном сундуке ×1,5', chest: 'common' },
  luck_magic:  { legacy: true, name: 'Удача: магический', icon: 'ic_boost_luck', desc: 'Шансы в следующем магическом сундуке ×1,5', chest: 'magic' },
  luck_legend: { legacy: true, name: 'Удача: легендарный', icon: 'ic_boost_luck', desc: 'Шансы в следующем легендарном сундуке ×1,5', chest: 'legend' },
  luck_weekly: { legacy: true, name: 'Удача недели', icon: 'ic_boost_weekly', desc: 'Шансы в сундуке недели ×1,75', chest: 'weekly' },
};

// Пакеты Самоцветов за Telegram Stars (дубль — supabase/functions/_shared/packs.ts и blitz.packs())
export const PACKS = [            // prisms × (1 + bonus%) = итог из blitz.packs() и supabase/functions/_shared/bb_packs.ts
  { id: 'p1', prisms: 60,   stars: 25,  bonus: 0 },
  { id: 'p2', prisms: 140,  stars: 50,  bonus: 10, tag: 'Хит' },
  { id: 'p3', prisms: 320,  stars: 100, bonus: 25 },
  { id: 'p4', prisms: 900,  stars: 250, bonus: 40, tag: 'Выгодно' },
  { id: 'p5', prisms: 2000, stars: 500, bonus: 60 },
];
// стартовый набор (как в Baalgor): один раз, предлагается на главном экране со 2-го захода, не чаще раза в 3 дня
export const PACK_USD = { p1: 0.49, p2: 0.99, p3: 1.99, p4: 4.99, p5: 9.99, starter: 0.59 };   // цена в крипте (blitz.pack_usd())
export const STARTER = { id: 'starter', stars: 30, prisms: 300, chests: { magic: 2, legend: 1 } };
export const MARKET_FEE = { prisms: 0, stars: 0.08 };   // комиссия рынка: за самоцветы 0%, за Stars 8% (совпадает с blitz.market_fee_for)
export const STARTER_DECK = ['archer', 'catapult', 'grease', 'mill'];
// Чем выше редкость, тем роскошнее арт (используется в промтах tools/asset_spec.mjs)
export const RARITY_LOOK = {
  common: 'simple charming craftsmanship: plain wood, rough stone, rope and iron',
  magic: 'enchanted: polished stone with glowing sapphire-blue runes and small floating magic sparkles',
  rare: 'ornate: carved details, purple amethyst gems, gold trims and a soft violet magic aura',
  legendary: 'epic and majestic: gleaming gold and marble, big glowing orange gems, banners, radiant golden light rays, a true showpiece',
  mystic: 'breathtaking mythical masterpiece: crimson-magenta enchanted crystal, swirling rainbow magic, floating runes and particles, divine glow, the most beautiful object in the game',
};

// Шансы распыления пачки (совпадает с bb_dust_many на сервере)
const DUST_GEM = { common: [0.10, 1], magic: [0.15, 2], rare: [0.20, 3], legendary: [0.25, 5], mystic: [0.30, 8] };
const DUST_CHEST_W = { common: 1, magic: 1.5, rare: 2, legendary: 3, mystic: 4 };
export function dustOdds(cards) {
  const gems = {}, groups = {}; let pchest = 0, top = -1;
  for (const c of cards) {
    const r = TOWER_DEFS[c.card].rarity, [p, v] = DUST_GEM[r];
    gems[r] ??= { p, v, n: 0 }; gems[r].n++;
    pchest += 0.008 * DUST_CHEST_W[r]; top = Math.max(top, RARITIES[r].order);
    (groups[c.card] ??= []).push(c);
  }
  const ups = Object.entries(groups).filter(([, g]) => g.length >= 3 && Math.max(...g.map(c => c.grade || 0)) < 2).map(([card, g]) => {
    const mg = Math.max(...g.map(c => c.grade || 0)), p = Math.min(0.4, (g.length - 2) * 0.04);
    return { card, from: mg, p1: mg === 0 ? p * 2 / 3 : p, p2: mg === 0 ? p / 3 : 0 };
  });
  const chest = top >= 2 ? 'legend' : top === 1 ? 'magic' : 'common';
  return { gems: Object.entries(gems).map(([r, g]) => ({ r, ...g })), ups, chest, pChest: Math.min(0.15, pchest) };
}
