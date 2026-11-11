// Звуки синтезируются WebAudio (без файлов). Sfx.play('shot') и т.п.; громкость и выключатель — в настройках.
let ctx = null, master = null;
const last = {};
export const Sfx = {
  on: true, vol: 0.6,
  unlock() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.connect(ctx.destination); } catch { return; } }
    if (ctx.state === 'suspended') ctx.resume();
  },
  play(name, k = 1) {
    if (!this.on || !ctx) return;
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < (LIMIT[name] ?? 0.04)) return;   // не забивать эфир одинаковыми звуками
    last[name] = now;
    master.gain.value = this.vol;
    (S[name] || S.tick)(now, k);
  },
};
const LIMIT = { shot: 0.06, hit: 0.05, flame: 0.12, beam: 0.15, coin: 0.05 };

function tone(t, { f = 440, f2 = f, d = 0.12, type = 'sine', g = 0.25, attack = 0.004 }) {
  const o = ctx.createOscillator(), a = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
  a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g, t + attack); a.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(a).connect(master); o.start(t); o.stop(t + d + 0.02);
}
function noise(t, { d = 0.2, g = 0.3, f = 1200, q = 0.8, type = 'lowpass', f2 }) {
  const n = Math.floor(ctx.sampleRate * d), b = ctx.createBuffer(1, n, ctx.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), a = ctx.createGain();
  s.buffer = b; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d); fl.Q.value = q;
  a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(a).connect(master); s.start(t);
}
const S = {
  tick: t => tone(t, { f: 900, d: 0.05, g: 0.08, type: 'square' }),
  click: t => tone(t, { f: 660, f2: 990, d: 0.07, g: 0.12, type: 'triangle' }),
  shot: t => { tone(t, { f: 880, f2: 220, d: 0.08, g: 0.07, type: 'square' }); },
  boom: (t, k) => { noise(t, { d: 0.45 * k, g: 0.5, f: 900, f2: 80 }); tone(t, { f: 120, f2: 40, d: 0.35, g: 0.4 }); },
  zap: t => { noise(t, { d: 0.15, g: 0.2, f: 3000, type: 'bandpass', q: 3 }); tone(t, { f: 1400, f2: 300, d: 0.12, g: 0.08, type: 'sawtooth' }); },
  ice: t => tone(t, { f: 1800, f2: 2600, d: 0.12, g: 0.07, type: 'triangle' }),
  flame: t => noise(t, { d: 0.25, g: 0.12, f: 600, type: 'bandpass', q: 0.6 }),
  beam: t => tone(t, { f: 300, f2: 340, d: 0.2, g: 0.04, type: 'sawtooth' }),
  hit: t => noise(t, { d: 0.06, g: 0.12, f: 2500 }),
  splat: t => { noise(t, { d: 0.18, g: 0.25, f: 700, f2: 200 }); tone(t, { f: 260, f2: 90, d: 0.15, g: 0.15 }); },
  finisher: t => { tone(t, { f: 200, f2: 60, d: 0.4, g: 0.5, type: 'sawtooth' }); noise(t, { d: 0.35, g: 0.45, f: 1600, f2: 120 }); tone(t + 0.05, { f: 880, f2: 1760, d: 0.25, g: 0.15, type: 'triangle' }); },
  combo: (t, k) => tone(t, { f: 500 + k * 90, f2: 800 + k * 120, d: 0.14, g: 0.14, type: 'triangle' }),
  coin: t => { tone(t, { f: 1320, d: 0.08, g: 0.1, type: 'square' }); tone(t + 0.07, { f: 1760, d: 0.12, g: 0.1, type: 'square' }); },
  place: t => { tone(t, { f: 180, f2: 90, d: 0.18, g: 0.35 }); noise(t, { d: 0.12, g: 0.15, f: 500 }); },
  upgrade: t => [0, 0.08, 0.16].forEach((d, i) => tone(t + d, { f: 520 * (1 + i * 0.26), d: 0.14, g: 0.14, type: 'triangle' })),
  leak: t => tone(t, { f: 300, f2: 120, d: 0.3, g: 0.25, type: 'square' }),
  wave: t => { tone(t, { f: 392, d: 0.15, g: 0.15, type: 'sawtooth' }); tone(t + 0.15, { f: 523, d: 0.25, g: 0.15, type: 'sawtooth' }); },
  ult: t => { tone(t, { f: 1600, f2: 60, d: 0.9, g: 0.3, type: 'sawtooth' }); noise(t + 0.3, { d: 0.9, g: 0.6, f: 1200, f2: 60 }); },
  win: t => [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, { f, d: 0.3, g: 0.18, type: 'triangle' })),
  lose: t => [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.16, { f, d: 0.35, g: 0.16, type: 'sawtooth' })),
  chestTap: (t, k) => { tone(t, { f: 160 + k * 60, f2: 90, d: 0.2, g: 0.35 }); noise(t, { d: 0.1, g: 0.2, f: 900 }); },
  chestOpen: t => { noise(t, { d: 0.8, g: 0.4, f: 3000, f2: 300 }); [784, 988, 1175, 1568].forEach((f, i) => tone(t + 0.1 + i * 0.07, { f, d: 0.4, g: 0.12, type: 'triangle' })); },
  reveal: (t, k) => [0, 0.06, 0.12].forEach((d, i) => tone(t + d, { f: 600 + k * 200 + i * 150, d: 0.3, g: 0.12, type: 'sine' })),
};
