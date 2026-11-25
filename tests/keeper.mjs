// Portero: alcanza el balón según su postura. Tumbado tras estirarse, un balón que le pasa por
// encima sigue su trayectoria (no «cae» a sus manos).
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS, PITCH, KEEPER } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const DT = 1 / 120, CY = PITCH.width / 2;

function scene(keeperState, ballZ, ballVz) {
  const m = new Match({ halfMinutes: 30,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  m.state = 'play'; m.restartTaker = null;
  for (const p of m.players) { p.mustPass = false; p.hasBall = false; if (!p.isGK) p.place(p.x, -40); }
  for (const t of m.teams) t.updateAI = () => {};
  const k = m.away.gk, gx = m.away.ownGoalX, d = m.away.dir;    // portería que defiende el visitante
  k.place(gx + d * 1.5, CY);
  if (keeperState === 'lying') { k.state = 'dive'; k.stateT = 0.24; k.vx = k.vy = 0; }   // ya en el suelo
  if (keeperState === 'air') { k.state = 'dive'; k.stateT = KEEPER.diveTime - 0.1; }
  // Balón que viene hacia la portería y pasa justo encima del portero.
  const b = m.ball;
  b.reset(k.x + d * 1.5, CY + 0.3);                // 1,5 m delante del portero, en el campo
  b.z = ballZ;
  b.kick(-d * 9, 0, ballVz);                      // hacia la portería
  b.lastTouch = m.home.players[9];
  let caught = false, goal = false;
  for (let i = 0; i < 2 / DT; i++) {
    m.update(DT);
    if (b.owner === k) { caught = true; break; }
    if (m.state === 'goal') { goal = true; break; }
  }
  return { caught, goal };
}
const lyingHigh = scene('lying', 1.6, 0);
check(!lyingHigh.caught && lyingHigh.goal, `portero tumbado, balón a ~1,6 m: le pasa por encima y es gol (${JSON.stringify(lyingHigh)})`);
const lyingLow = scene('lying', 0.15, 0);
check(lyingLow.caught, `portero tumbado, balón raso y lento: lo atrapa (${JSON.stringify(lyingLow)})`);
const standingHigh = scene('standing', 2.1, 0);
check(standingHigh.caught, `portero de pie, balón a ~2 m: lo atrapa (${JSON.stringify(standingHigh)})`);
console.log(fails ? `${fails} fallos` : 'todo bien');
