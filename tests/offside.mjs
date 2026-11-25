// Fuera de juego: se pita si recibe el pase un compañero que estaba por delante del penúltimo
// defensor y del balón en campo rival; no en línea, ni en un saque de banda. El linier levanta el
// banderín, el árbitro planta el balón donde estaba el jugador y se saca la falta.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS, PITCH } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const DT = 1 / 120, L = PITCH.length, CY = PITCH.width / 2;

// El local ataca hacia x = L. Defensa rival en x = 85 (y portero), pasador en 60, delantero en fwX.
function scene(fwX, { restartKick = false } = {}) {
  const m = new Match({ halfMinutes: 30,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  m.state = 'play'; m.restartTaker = null;
  for (const t of m.teams) t.updateAI = () => {};
  for (const p of m.players) { p.mustPass = false; p.hasBall = false; p.place(p.isGK ? p.team.ownGoalX + p.team.dir : 30, p.isGK ? CY : 5 + p.index); }
  const passer = m.home.players[6], fw = m.home.players[9], def = m.away.players[3];
  def.place(85, CY + 10);
  passer.place(60, CY); fw.place(fwX, CY);
  m.ball.reset(60.5, CY); m.giveBall(passer);
  passer.restartKick = restartKick;
  passer.kick(m.ball, fw.x - 1 - passer.x, fw.y - passer.y, 0.85, 'ground');   // pase raso fuerte hacia el delantero
  m.onKick(passer, 'ground');
  let called = false, flag = false;
  for (let i = 0; i < 4 / DT; i++) {
    m.update(DT);
    if (m.state === 'out' && m.out?.kind === 'freekick') called = true;
    if (m.linesmen.some(l => l.flagT > 0)) flag = true;
    if (called) break;
  }
  return { m, called, flag, fw };
}

const off = scene(92);
check(off.called && off.flag, 'delantero por delante del último defensa: fuera de juego, banderín y falta');
check(off.m.message === 'Fuera de juego', `aviso en pantalla («${off.m.message}»)`);
const lm = off.m.linesmen.find(l => l.flagT > 0);
check(lm && lm.half === 1, 'levanta el banderín el linier de esa mitad');
const onside = scene(80);
check(!onside.called, 'delantero por detrás del defensa: no hay fuera de juego');
const inLine = scene(85);
check(!inLine.called, 'en línea con el defensa: no hay fuera de juego');
const throwIn = scene(92, { restartKick: true });
check(!throwIn.called, 'tras un saque de banda: no hay fuera de juego');

// Ciclo completo: el árbitro coge el balón, lo planta donde estaba el jugador y saca el rival.
{
  const { m, fw } = scene(92);
  const spot = { x: 92, y: CY };
  let held = false, placedAt = null, resumed = false;
  for (const t of m.teams) delete t.updateAI;               // vuelve la IA normal
  for (let i = 0; i < 30 / DT; i++) {
    m.update(DT);
    if (m.ball.held === m.referee) held = true;
    if (m.state === 'restart' && !placedAt) placedAt = { x: m.ball.x, y: m.ball.y, taker: m.restartTaker };
    if (placedAt && m.state === 'play' && !placedAt.taker.hasBall) { resumed = true; break; }
  }
  check(held, 'el árbitro coge el balón');
  check(placedAt && Math.hypot(placedAt.x - spot.x, placedAt.y - spot.y) < 1.5, `lo planta donde estaba el jugador en fuera de juego (${placedAt ? Math.hypot(placedAt.x - spot.x, placedAt.y - spot.y).toFixed(1) : '-'} m)`);
  check(placedAt?.taker?.team === m.away, 'saca la falta el rival');
  const near = m.home.players.filter(p => Math.hypot(p.x - spot.x, p.y - spot.y) < 9).length;
  check(resumed, 'y el partido sigue');
}

// Linieres: cada uno en su banda y en su mitad, siguiendo el balón.
{
  const m = new Match({ halfMinutes: 3,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  let ok = true, offs = 0, stuck = 0, outT = 0;
  while (m.state !== 'end') {
    const wasOff = m.out?.kind === 'freekick';
    m.update(1 / 60);
    if (!wasOff && m.out?.kind === 'freekick') offs++;
    for (const l of m.linesmen) if ((l.half ? l.x < L / 2 - 0.5 : l.x > L / 2 + 0.5) || (l.side < 0 ? l.y > 0 : l.y < PITCH.width)) ok = false;
    if (m.state === 'out') { outT += 1 / 60; if (outT > 40) { stuck++; break; } } else outT = 0;
  }
  check(ok, 'los linieres no salen de su banda ni pasan de su medio campo');
  check(stuck === 0, `partido completo: ${offs} fueras de juego y ninguna pausa atascada (${m.home.score}-${m.away.score})`);
}
console.log(fails ? `${fails} fallos` : 'todo bien');
