globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS, PITCH } = await import('../www/js/config.js');
const src = {};
for (let g = 0; g < 4; g++) {
  const m = new Match({ halfMinutes: 3,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  let lastKick = null;
  const ok = m.onKick.bind(m);
  m.onKick = (p, type) => { ok(p, type); lastKick = { type, p, x: p.x, y: p.y, gk: p.isGK }; };
  let prev = m.state;
  while (m.state !== 'end') {
    m.update(1 / 120);
    if (m.state === 'goal' && prev !== 'goal') {
      const lt = m.ball.lastTouch;
      const own = lt && lt.team !== m.lastScorer;
      const k = lastKick && lastKick.p === lt ? `${lastKick.type}${lastKick.gk ? '(GK)' : ''} d=${Math.hypot(lastKick.x - lt.team.oppGoalX, lastKick.y - PITCH.width / 2).toFixed(0)}` : `toque sin golpeo (${lt?.isGK ? 'GK' : lt?.role})`;
      const key = (own ? 'PROPIA ' : '') + k.split(' ')[0];
      src[key] = (src[key] || 0) + 1;
      console.log(own ? 'PROPIA' : 'gol', k);
    }
    prev = m.state;
  }
}
console.log(src);
