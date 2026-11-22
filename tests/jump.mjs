// Salto: el jugador humano salta y cabecea un balón alto; la IA salta sola en partidos simulados.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { Human } = await import('../www/js/human.js');
const { COLORS } = await import('../www/js/config.js');

const mk = () => new Match({ halfMinutes: 3,
  home: { name: 'A', color: COLORS[0], cpu: false, skill: 1 },
  away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };

// 1) Humano: balón que llega a 2,3 m (por encima de la cabeza). Pulsa raso y debe saltar y cabecear.
for (const press of [true, false]) {
  const m = mk();
  const keys = { x: 0, y: 0, a: false, b: false };
  const h = new Human(m.home, { poll: () => keys }, 1);
  m.addHuman(h);
  while (m.state !== 'play') { m.update(1 / 120); if (m.time > 5) break; }
  // Quitamos a todos de en medio salvo un jugador local en (40, 27).
  for (const p of m.players) p.place(p.isGK ? p.team.ownGoalX : 5, 5 + p.index);
  const me = m.home.players[5];
  me.place(40, 27);
  h.setPlayer(me);
  const b = m.ball; b.owner && (b.owner.hasBall = false); b.owner = null;
  b.reset(32, 27); b.lastTouch = m.away.players[3];
  // Lanzado para que pase sobre el jugador a unos 2,3 m de altura.
  b.kick(12, 0, 6.8);
  let jumped = false, maxZ = 0, headed = false;
  for (let i = 0; i < 120 * 2; i++) {
    const d = Math.hypot(b.x - me.x, b.y - me.y);
    keys.a = press && d < 3.2 && d > 2.2;
    const before = b.kickId;
    m.update(1 / 120);
    if (me.state === 'jump') jumped = true;
    maxZ = Math.max(maxZ, me.z);
    if (b.kickId !== before && b.lastTouch === me) headed = true;
  }
  if (press) {
    check(jumped, `humano pulsa: salta (altura máx ${maxZ.toFixed(2)} m)`);
    check(headed, 'humano pulsa: cabecea el balón');
    check(me.z === 0 && me.state === 'normal', 'humano: vuelve al suelo');
  } else {
    check(!jumped, 'humano sin pulsar: no salta solo');
  }
}

// 2) IA: en partidos simulados salta y cabecea alguna vez, y nadie se queda en el aire.
let jumps = 0, headersInAir = 0, stuck = 0, goals = 0;
for (let g = 0; g < 3; g++) {
  const m = new Match({ halfMinutes: 3,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  const prev = new Map();
  while (m.state !== 'end') {
    const k = m.ball.kickId;
    m.update(1 / 120);
    for (const p of m.players) {
      if (p.state === 'jump' && prev.get(p) !== 'jump') jumps++;
      if (p.z > 2) stuck++;
      prev.set(p, p.state);
    }
    if (m.ball.kickId !== k && m.ball.lastTouch?.state === 'jump') headersInAir++;
  }
  goals += m.home.score + m.away.score;
}
check(jumps > 0, `IA: ${jumps} saltos en 3 partidos`);
check(headersInAir > 0, `IA: ${headersInAir} cabezazos en el aire`);
check(stuck === 0, 'nadie sube más de 2 m');
console.log(`goles en 3 partidos: ${goals}`);
console.log(fails ? `${fails} fallos` : 'todo bien');
