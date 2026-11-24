// Modo entrenamiento: solo, con 1 compañero o contra 1, 2 o 3 rivales; siempre con porteros y sin tiempo.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { Human } = await import('../www/js/human.js');
const { COLORS } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const DT = 1 / 120;

for (const [mates, rivals] of [[0, 0], [1, 0], [0, 1], [0, 2], [0, 3]]) {
  const label = mates ? `con ${mates} compañero` : rivals ? `contra ${rivals} rival${rivals > 1 ? 'es' : ''}` : 'solo';
  const m = new Match({ halfMinutes: 1, training: { mates, rivals },
    home: { name: 'A', color: COLORS[0], cpu: false, skill: 1, formation: '4-4-2' },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1, formation: '4-3-3' } });
  // Jugador humano que va a por el balón y chuta hacia la portería de vez en cuando.
  const keys = { x: 0, y: 0, a: false, b: false };
  const h = new Human(m.home, { poll: () => keys }, 1);
  m.addHuman(h);
  const nHome = m.home.players.length, nAway = m.away.players.length;
  const gks = m.home.players.filter(p => p.isGK).length + m.away.players.filter(p => p.isGK).length;
  let error = null, ended = false, restarts = 0, prev = m.state, nan = false;
  try {
    for (let i = 0; i < 180 / DT; i++) {            // 3 minutos (la «parte» dura 1)
      const p = h.player;
      if (p) {
        const tx = p.hasBall ? p.team.oppGoalX : m.ball.x, ty = p.hasBall ? 34 : m.ball.y;
        const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy) || 1;
        keys.x = dx / l; keys.y = dy / l;
        keys.a = p.hasBall && (p.mustPass || Math.abs(p.x - p.team.oppGoalX) < 25) && (i % 90) < 3;
      }
      m.update(DT);
      if (m.state === 'half' || m.state === 'end') ended = true;
      if (m.state === 'restart' && prev !== 'restart') restarts++;
      prev = m.state;
      if (!Number.isFinite(m.ball.x + m.ball.y)) nan = true;
    }
  } catch (e) { error = e; }
  check(!error, `${label}: sin errores${error ? ' — ' + error.message : ''}`);
  check(nHome === 2 + mates && nAway === 1 + rivals && gks === 2,
    `${label}: ${nHome - 1} de campo en tu equipo, ${nAway - 1} rivales, 2 porteros`);
  check(!ended && !nan, `${label}: sin final de tiempo (${m.home.score}-${m.away.score}, ${restarts} saques)`);
}

// Saques para un equipo sin jugadores de campo (entrenamiento solo): banda y córner.
{
  const m = new Match({ halfMinutes: 1, training: { mates: 0, rivals: 0 },
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  m.state = 'play'; m.restartTaker = null;
  let err = null;
  try {
    m.ball.lastTouch = m.home.players[1];
    m.handleEvent({ type: 'throw' });               // banda para el rival (que no tiene jugadores)
    const t1 = m.restartTaker;
    m.state = 'play';
    m.ball.lastTouch = m.home.players[1]; m.ball.y = 20;
    m.handleEvent({ type: 'byline', side: m.home.dir > 0 ? 'left' : 'right' });   // córner en tu portería
    const t2 = m.restartTaker;
    check(t1?.team === m.home && t2?.team === m.home && t2.isGK, 'sin rivales: la banda la sacas tú y el «córner» en tu portería es saque de puerta');
  } catch (e) { err = e; }
  check(!err, `saques sin rivales: sin errores${err ? ' — ' + err.message : ''}`);
}
console.log(fails ? `${fails} fallos` : 'todo bien');
