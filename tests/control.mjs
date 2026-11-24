// Conducción a toques y medidor de fuerza del jugador humano.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { Human } = await import('../www/js/human.js');
const { COLORS, KICK } = await import('../www/js/config.js');

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const DT = 1 / 120;

// Partido con un solo jugador humano en el campo (los demás, aparcados y quietos).
function setup() {
  const m = new Match({ halfMinutes: 30,
    home: { name: 'A', color: COLORS[0], cpu: false, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  const keys = { x: 0, y: 0, a: false, b: false };
  const h = new Human(m.home, { poll: () => keys }, 1);
  m.addHuman(h);
  // Sin esperar al saque inicial (lo tendría que hacer el humano): directamente en juego.
  m.state = 'play'; m.restartTaker = null;
  for (const p of m.players) { p.mustPass = false; p.hasBall = false; }
  const me = m.home.players[6];
  for (const p of m.players) if (p !== me) { p.place(p.x, -40); p.updateAI = null; }
  for (const t of m.teams) t.updateAI = () => {};
  me.place(30, 34); me.fx = 1; me.fy = 0;
  m.ball.reset(30.5, 34);
  m.giveBall(me);
  h.setPlayer(me);
  return { m, h, me, keys };
}
const run = (m, s, each) => { for (let i = 0; i < s / DT; i++) { each?.(i * DT); m.update(DT); } };

// 1) Conducción en línea recta: no lo pierde, el balón va por delante a toques, nunca pegado.
{
  const { m, me, keys } = setup();
  keys.x = 1;
  // Como haría una persona: corrige un poco la dirección si el balón se le va a un lado.
  const steer = () => { keys.y = Math.max(-1, Math.min(1, (m.ball.y - me.y) * 3)); };
  let touches = 0, last = m.ball.lastTouch, maxD = 0, minD = 9, kept = true, prevV = 0;
  run(m, 4, () => {
    steer();
    const d = Math.hypot(m.ball.x - me.x, m.ball.y - me.y);
    if (m.time > 1) { maxD = Math.max(maxD, d); minD = Math.min(minD, d); }
    const v = Math.hypot(m.ball.vx, m.ball.vy);
    if (v > prevV + 1) touches++;
    prevV = v;
    if (m.ball.owner !== me) kept = false;
  });
  check(kept, 'recta: conserva el balón 4 s');
  check(touches >= 4, `recta: va a toques (${touches} toques en 4 s)`);
  check(maxD - minD > 0.25, `recta: el balón se separa y se acerca (entre ${minD.toFixed(2)} y ${maxD.toFixed(2)} m)`);
}

// 2) Media vuelta. Con el balón dentro de su radio, gira con él; justo después de un toque
//    (balón ya más lejos que el radio de control) se le queda atrás.
{
  const { m, me, keys } = setup();
  keys.x = 1;
  run(m, 2, () => { keys.y = Math.max(-1, Math.min(1, (m.ball.y - me.y) * 3)); });
  // Espera a tener el balón cerca y da media vuelta.
  // …con el balón en el pie: medio metro por delante y a su misma velocidad.
  m.ball.x = me.x + 0.5; m.ball.y = me.y; m.ball.vx = me.vx; m.ball.vy = me.vy; me.touchCD = 0.1;
  keys.x = -1; keys.y = 0;
  run(m, 1);
  check(m.ball.owner === me && m.ball.x < me.x, 'media vuelta con el balón cerca: gira con él y lo lleva delante');
}
{
  const { m, me, keys } = setup();
  keys.x = 1;
  run(m, 2, () => { keys.y = Math.max(-1, Math.min(1, (m.ball.y - me.y) * 3)); });
  // Espera a que el balón se haya adelantado (tras un toque) y da media vuelta.
  let far = 0;
  for (let i = 0; i < 600 && (far = Math.hypot(m.ball.x - me.x, m.ball.y - me.y)) < 0.9; i++) {
    keys.y = Math.max(-1, Math.min(1, (m.ball.y - me.y) * 3)); m.update(DT);
  }
  keys.x = -1; keys.y = 0;
  let maxD = 0;
  run(m, 0.6, () => { maxD = Math.max(maxD, Math.hypot(m.ball.x - me.x, m.ball.y - me.y)); });
  check(maxD > 1.5, `media vuelta tras un toque largo: el balón se le queda atrás (se aleja hasta ${maxD.toFixed(2)} m)`);
}

// Llegar al balón sin estar justo delante: dentro del radio de control se hace con él
// y se lo coloca delante, en la dirección en la que quiere correr.
function approach(bx, by, label) {
  const { m, me, keys } = setup();
  m.ball.owner = null; me.hasBall = false;
  m.ball.reset(bx, by);
  me.place(30, 34); me.fx = 1; me.fy = 0;
  keys.x = 1; keys.y = 0;                       // corre recto hacia la derecha, sin apuntar al balón
  let got = null, aheadAfter = null;
  run(m, 2, t => {
    if (got === null && m.ball.owner === me) got = t;
    if (got !== null && aheadAfter === null && t > got + 0.4) {
      const fwd = m.ball.x - me.x, side = Math.abs(m.ball.y - me.y);
      aheadAfter = { fwd, side };
    }
  });
  check(got !== null && aheadAfter && aheadAfter.fwd > 0.1 && aheadAfter.side < 0.4 && m.ball.owner === me,
    `${label}: lo controla (a los ${got?.toFixed(2)} s) y lo lleva delante (adelante ${aheadAfter?.fwd.toFixed(2)} m, de lado ${aheadAfter?.side.toFixed(2)} m)`);
}
approach(33, 34.65, 'balón a un lado de su camino (0,65 m)');
approach(33, 33.4, 'balón al otro lado (0,6 m)');

// Carrera por un balón suelto: se lo queda el que llega antes.
{
  const { m, me } = setup();
  m.ball.owner = null; me.hasBall = false;
  const rival = m.away.players[6];
  m.ball.reset(40, 34);
  me.place(36.5, 34); me.fx = 1; me.fy = 0;          // 3,5 m: llega antes
  rival.place(44.5, 34); rival.fx = -1; rival.fy = 0; // 4,5 m
  const h = m.humans[0]; h.input = { poll: () => ({ x: 1, y: 0, a: false, b: false }) };
  let first = null;
  run(m, 1.5, () => { rival.mx = -1; rival.my = 0; if (!first && m.ball.owner) first = m.ball.owner; });
  check(first === me, `carrera: se lo queda el que llega antes (${first === me ? 'el mío' : first ? 'el rival' : 'nadie'})`);
}

// Golpeos con el medidor. Devuelve la fuerza con la que salió el balón (velocidad) y cuándo.
function kickWith(script) {
  const { m, h, me, keys } = setup();
  let kicked = null; const k0 = m.ball.kickId;
  const orig = me.kick.bind(me);
  me.kick = (ball, dx, dy, power, type, spin) => { kicked = kicked || { power, type, t: m.time }; return orig(ball, dx, dy, power, type, spin); };
  const t0 = m.time;
  run(m, 6, t => script(keys, t, h));
  return kicked && { ...kicked, t: kicked.t - t0 };
}

// 3) Pulsación seca: golpea al soltar, sin esperas, con el valor del medidor automático al pulsar.
{
  let auto = null;
  const k = kickWith((keys, t, h) => { if (t < 0.05) { keys.a = true; auto ??= h.autoMeter; } else keys.a = false; });
  check(k && k.type === 'ground' && Math.abs(k.power - auto) < 0.03 && k.t < 0.1,
    `pulsación seca: fuerza ${k?.power.toFixed(2)} = medidor al pulsar ${auto?.toFixed(2)}, sale a los ${k?.t.toFixed(2)} s (al soltar)`);
}
// 4) Ya no hay doble pulsación: dos pulsaciones seguidas son dos golpeos con el medidor (el primero sale ya).
{
  let auto = null;
  const k = kickWith((keys, t, h) => { const on = t < 0.05 || (t > 0.1 && t < 0.15); if (on && t < 0.05) auto ??= h.autoMeter; keys.a = on; });
  check(k && Math.abs(k.power - auto) < 0.03 && k.t < 0.1, `dos pulsaciones: la primera golpea al momento con el medidor (${k?.power.toFixed(2)})`);
}
// 5) Mantener 1 s (más la espera de pulsación larga) con el botón alto: medidor manual a la mitad.
{
  const k = kickWith((keys, t) => { keys.b = t < 1.0; });
  check(k && k.type === 'loft' && Math.abs(k.power - 1.0 / KICK.manualUp) < 0.05, `mantener 1 s: alto con fuerza ${k?.power.toFixed(2)}`);
}
// 6) Mantener demasiado: el medidor vuelve a cero y solo da un toque cortito.
{
  const k = kickWith((keys, t) => { keys.a = t < 5; });
  check(k && k.power === KICK.touchPower && k.t < 4.3, `pasarse: toque cortito (fuerza ${k?.power}) a los ${k?.t.toFixed(2)} s`);
}
console.log(fails ? `${fails} fallos` : 'todo bien');
