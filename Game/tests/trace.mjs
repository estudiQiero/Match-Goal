globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS } = await import('../www/js/config.js');
const m = new Match({ halfMinutes: 3,
  home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
  away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
let lastOwner = 'x';
for (let i = 0; i < 120 * 60; i++) {
  m.update(1 / 120);
  const o = m.ball.owner;
  const id = o ? `${o.team.name}${o.number}${o.role}` : '-';
  if (id !== lastOwner || i % 600 === 0) {
    console.log((i / 120).toFixed(1).padStart(5), m.state.padEnd(7), id.padEnd(8),
      `ball ${m.ball.x.toFixed(1)},${m.ball.y.toFixed(1)},${m.ball.z.toFixed(1)} v=${m.ball.speed.toFixed(1)}`,
      o ? `mv ${o.mx.toFixed(2)},${o.my.toFixed(2)} v ${Math.hypot(o.vx,o.vy).toFixed(1)}` : '');
    lastOwner = id;
  }
}
