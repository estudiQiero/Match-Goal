// Simulación sin pantalla: CPU contra CPU para detectar errores y ver que hay goles.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS } = await import('../www/js/config.js');
let goals = 0, restarts = {}, errors = 0;
for (let g = 0; g < 4; g++) {
  const m = new Match({ halfMinutes: 3,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1, formation: '4-4-2' },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1, formation: '4-3-3' } });
  let prevState = m.state, steps = 0;
  while (m.state !== 'end' && steps < 120 * 60 * 10) {
    m.update(1 / 120); steps++;
    if (m.state !== prevState && (m.state === 'restart')) restarts[m.message] = (restarts[m.message] || 0) + 1;
    prevState = m.state;
    for (const p of m.players) if (!Number.isFinite(p.x + p.y)) errors++;
    if (!Number.isFinite(m.ball.x + m.ball.y + m.ball.z)) errors++;
  }
  goals += m.home.score + m.away.score;
  console.log(`partido ${g + 1}: ${m.home.score}-${m.away.score} estado=${m.state} tiros=${m.stats.shots} pos=${m.stats.possession.map(x => x.toFixed(0))}`);
}
console.log('goles', goals, 'saques', restarts, 'NaN', errors);
