// Место в мире на итогах боя (как в Baalgor, blood-keep/js/place.js): «Место 2 из 87 в мире» и похвала по проценту,
// плюс «пирамида редкости» (как у трофеев PlayStation): подсвечен ярус игрока — вершина у лучших 5%, затем 15%, 50% и остальные.
export function placeText(rank, total) {
  const raw = (rank / Math.max(total, 1)) * 100, p = Math.max(0.1, Math.round(raw * 10) / 10), q = Math.max(0, Math.round((100 - raw) * 10) / 10);
  const f1 = v => String(v).replace('.', ','), em = v => `<em class="pc">${f1(v)}%</em>`;
  const praise = rank === 1 ? 'Лучший результат в мире на этом уровне!'
    : p <= 10 ? `Лишь ${em(p)} игроков в мире набрали столько очков — молодец!`
    : p <= 50 ? `Ты в лучших ${em(p)} игроков на этом уровне`
    : q > 0 ? `Ты обошёл ${em(q)} игроков. Сыграй ещё — поднимешься выше!` : 'Сыграй ещё — поднимешься выше!';
  return { place: `Место ${rank} из ${total} в мире`, praise, pct: rank === 1 ? 0 : p };
}

export function pyramidSvg(pct) {
  const tier = pct <= 5 ? 0 : pct <= 15 ? 1 : pct <= 50 ? 2 : 3;
  const ys = [4, 16, 27, 38, 49], half = y => (y - 4) * 0.62;
  const band = i => {
    const y0 = ys[i] + (i ? 1.4 : 0), y1 = ys[i + 1], a = half(y0), b = half(y1);
    const pts = i === 0 ? `30,${y0} ${30 + b},${y1} ${30 - b},${y1}` : `${30 - a},${y0} ${30 + a},${y0} ${30 + b},${y1} ${30 - b},${y1}`;
    const on = i === tier;
    return `<polygon points="${pts}" fill="${on ? '#ffcf55' : '#8a6a3c'}" stroke="${on ? '#fff6d0' : '#5a3f1e'}" stroke-width="${on ? 1.6 : 1.1}" stroke-linejoin="round"/>`;
  };
  return `<svg class="pyr" viewBox="0 0 60 52" width="52" height="45" aria-hidden="true">${[0, 1, 2, 3].map(band).join('')}</svg>`;
}
