globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS } = await import('../www/js/config.js');
for (let g = 0; g < 6; g++) {
  const m = new Match({ halfMinutes: 3,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  let same = 0, last = null, reported = false;
  while (m.state !== 'end') {
    m.update(1 / 120);
    const o = m.ball.owner;
    if (o && o === last) same++; else same = 0;
    last = o;
    if (same > 120 * 6 && !reported) {
      reported = true;
      console.log(`partido ${g}: ${o.team.name}${o.number} ${o.role} lleva el balón 6s. state=${m.state} p.state=${o.state} mustPass=${o.mustPass} pos ${o.x.toFixed(1)},${o.y.toFixed(1)} mv ${o.mx.toFixed(2)},${o.my.toFixed(2)} thinkT=${o.thinkT?.toFixed(2)} holdT=${o.holdT?.toFixed(2)} restartTaker=${m.restartTaker?.number} wait=${m.restartWait.toFixed(2)}`);
    }
  }
  if (!reported) console.log(`partido ${g}: ok ${m.home.score}-${m.away.score}`);
}
