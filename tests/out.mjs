// Pausas al salir el balón: rueda (o rebota en la valla, o se va a la grada), el que saca va a por
// él, lo lleva en brazos al punto y saca: banda por encima de la cabeza; córner y puerta, en el suelo.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS, PITCH, WALLS, OUT } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const DT = 1 / 120, L = PITCH.length, W = PITCH.width;

function setup() {
  const m = new Match({ halfMinutes: 30,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  m.state = 'play'; m.restartTaker = null;
  for (const p of m.players) { p.mustPass = false; p.hasBall = false; }
  return m;
}
// Lanza el balón desde (x, y), tocado por un jugador del local, y sigue el ciclo hasta que se saca.
function cycle(m, x, y, vx, vy, vz) {
  const b = m.ball;
  b.reset(x, y); b.kick(vx, vy, vz); b.lastTouch = m.home.players[6];
  const log = { phases: [], maxOut: 0, bounced: false, crowd: false, back: false, fetchers: new Set(), carriedZ: null, readyZ: null, readyAt: null, taker: null, resumed: false, t: 0 };
  let prevVy = vy;
  for (let i = 0; i < 25 / DT; i++) {
    m.update(DT); log.t += DT;
    if (m.out) {
      const o = m.out;
      if (log.phases[log.phases.length - 1] !== o.phase) log.phases.push(o.phase);
      log.taker = o.taker;
      if (-b.y > WALLS.far + 0.5 || b.y - W > WALLS.near + 0.5) log.crowd = true;
      if (log.crowd && b.y > -WALLS.far && b.y < W + WALLS.near) log.back = true;
      if (o.fetcher) log.fetchers.add(o.fetcher);
      if (o.phase === 'settle' && Math.sign(b.vy) !== Math.sign(prevVy) && Math.abs(b.y - W / 2) > W / 2) log.bounced = true;
      if (o.phase === 'walk') log.carriedZ = b.z;
      log.maxOut = Math.max(log.maxOut, b.y - W, -b.y, b.x - L, -b.x);
    }
    prevVy = b.vy;
    if (m.state === 'restart' && log.readyZ === null) { log.readyZ = b.z; log.readyAt = [m.restartTaker.x, m.restartTaker.y]; }
    if (log.readyZ !== null && m.state === 'play' && !m.restartTaker?.hasBall) { log.resumed = true; break; }
  }
  return log;
}

// 1) Banda de abajo, rodando despacio: se para fuera, lo recoge el rival y saca por encima de la cabeza.
{
  const m = setup();
  const r = cycle(m, 40, W - 1, 0, 4, 0);
  check(r.phases.join('>') === 'settle>fetch>walk', `banda: pausa, va a por él y lo lleva (${r.phases.join(' > ')})`);
  check(r.taker?.team === m.away, 'lo saca el rival del que la tiró fuera');
  check(Math.abs(r.carriedZ - OUT.carryHeight) < 0.05, `lo lleva en los brazos (a ${r.carriedZ?.toFixed(2)} m)`);
  check(r.readyZ !== null && Math.abs(r.readyZ - OUT.throwHeight) < 0.05 && Math.abs(r.readyAt[1] - W) < 0.4, `en la línea, con el balón encima de la cabeza (${r.readyZ?.toFixed(2)} m)`);
  check(r.resumed, `y saca: el partido sigue (a los ${r.t.toFixed(1)} s)`);
}
// 2) Fuerte y raso hacia la banda: rebota en la valla y no se sale del recinto.
{
  const m = setup();
  const r = cycle(m, 40, W - 2, 0, 20, 0);
  check(r.bounced && r.maxOut <= WALLS.near + 0.01, `fuerte y raso: rebota en la valla (como mucho ${r.maxOut.toFixed(1)} m fuera)`);
  check(r.resumed, 'y se saca igual');
}
// 3) Alto por encima de la valla: la salta, choca con la grada y vuelve al campo saltándola otra vez.
{
  const m = setup();
  const r = cycle(m, 40, 2, 0, -14, 9);
  check(r.crowd && r.back, `alto: salta la valla, choca con la grada y vuelve (${r.crowd ? 'pasó la valla' : 'no pasó'}${r.back ? ', volvió' : ''})`);
  check(r.maxOut <= WALLS.far + WALLS.stand + 0.01, `y nunca pasa de la grada (${r.maxOut.toFixed(1)} m fuera)`);
  check(r.resumed, 'se recoge y se saca');
}
// 3b) Saque de puerta con un defensa más cerca del balón que el portero: lo recoge el defensa y se lo da.
{
  const m = setup();
  const gx = m.away.ownGoalX, d = m.away.dir;
  const def = m.away.players[2];
  m.away.gk.place(gx + d * 2, PITCH.width / 2);
  def.place(gx + d * 2, 4);                              // junto a la esquina, lejos del portero
  for (const p of m.away.players) if (p !== def && !p.isGK) p.place(p.x, 40);
  const r = cycle(m, gx + d * 2, 3, -d * 5, 0, 0);
  check(r.fetchers.has(def) && r.taker?.isGK, 'saque de puerta: lo recoge el defensa más cercano y saca el portero');
  check(r.resumed, 'y saca');
}
// 3c) Red de seguridad: si quien va a por el balón no llega, a los 10 s se saca igual.
{
  const m = setup();
  const b = m.ball; b.reset(40, W - 1); b.kick(0, 4, 0); b.lastTouch = m.home.players[6];
  for (let i = 0; i < 4 / DT && m.state !== 'out'; i++) m.update(DT);
  let t = 0, ok = false;
  for (let i = 0; i < 20 / DT; i++) {
    if (m.out?.fetcher) { m.out.fetcher.state = 'fallen'; m.out.fetcher.stateT = 99; }   // no puede moverse
    m.update(DT); t += DT;
    if (m.state === 'restart' || m.state === 'play') { ok = true; break; }
  }
  check(ok && t < 15, `si no llega, se saca igualmente (a los ${t.toFixed(1)} s)`);
}
// 4) Saque de puerta: el portero va a por él y lo deja en el suelo en el área pequeña.
{
  const m = setup();
  const gx = m.away.ownGoalX, d = m.away.dir;
  const r = cycle(m, gx + d * 3, PITCH.width / 2 + 6, -d * 6, 0, 0);
  check(r.taker?.isGK, 'saque de puerta: lo coge el portero');
  check(r.readyZ !== null && r.readyZ < 0.05, `y lo deja en el suelo para golpear (${r.readyZ?.toFixed(2)} m)`);
  check(r.resumed, 'y saca');
}
// 5) Partidos completos: ninguna pausa se queda atascada.
{
  let outs = 0, stuck = 0;
  for (let g = 0; g < 2; g++) {
    const m = new Match({ halfMinutes: 3,
      home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
      away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
    let outT = 0;
    while (m.state !== 'end') {
      m.update(1 / 60);
      if (m.state === 'out') { if (outT === 0) outs++; outT += 1 / 60; if (outT > 25) { stuck++; break; } } else outT = 0;
    }
  }
  check(outs > 5 && stuck === 0, `partidos completos: ${outs} pausas y ninguna atascada`);
}
console.log(fails ? `${fails} fallos` : 'todo bien');
