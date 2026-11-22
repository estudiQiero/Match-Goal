globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS, PITCH } = await import('../www/js/config.js');
const out = {}; let shots = 0; const dists = [];
for (let g = 0; g < 4; g++) {
  const m = new Match({ halfMinutes: 3,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  const ok = m.onKick.bind(m);
  let pending = null;
  m.onKick = (p, type) => { ok(p, type); if (type === 'shot') { shots++; pending = { t: m.time, p };
    dists.push(Math.hypot(p.x - p.team.oppGoalX, p.y - PITCH.width / 2).toFixed(0) + (p.isGK?'':'')); } };
  let prevOwner = null, prevState = m.state;
  while (m.state !== 'end') {
    m.update(1 / 120);
    if (pending) {
      let r = null;
      if (m.state === 'goal') r = 'gol';
      else if (m.state === 'restart' && prevState !== 'restart') r = m.message;
      else if (m.ball.owner && m.ball.owner !== pending.p) r = m.ball.owner.isGK ? 'parada GK' : (m.ball.owner.team === pending.p.team ? 'compañero' : 'rival');
      else if (m.time - pending.t > 4) r = 'suelto';
      if (r) { out[r] = (out[r] || 0) + 1; pending = null; }
    }
    prevState = m.state;
  }
}
console.log('tiros', shots, out, 'distancias', dists.join(' '));
