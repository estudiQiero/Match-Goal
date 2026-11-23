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
  check(touches >= 6, `recta: va a toques (${touches} toques en 4 s)`);
  check(maxD - minD > 0.25, `recta: el balón se separa y se acerca (entre ${minD.toFixed(2)} y ${maxD.toFixed(2)} m)`);
}

// 2) Giro brusco hacia atrás: el balón se le queda delante y tiene que ir a buscarlo.
{
  const { m, me, keys } = setup();
  keys.x = 1;
  run(m, 2);
  keys.x = -1;                      // media vuelta
  let maxD = 0;
  run(m, 0.5, () => { maxD = Math.max(maxD, Math.hypot(m.ball.x - me.x, m.ball.y - me.y)); });
  check(maxD > 1, `media vuelta: el balón se le escapa (llega a ${maxD.toFixed(2)} m)`);
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

// 3) Pulsación seca: golpea con el valor del medidor automático al pulsar, tras la espera del doble toque.
{
  let auto = null;
  const k = kickWith((keys, t, h) => { if (t < 0.05) { keys.a = true; auto ??= h.autoMeter; } else keys.a = false; });
  check(k && k.type === 'ground' && Math.abs(k.power - auto) < 0.03 && k.t > KICK.doubleTap * 0.9,
    `pulsación seca: fuerza ${k?.power.toFixed(2)} = medidor al pulsar ${auto?.toFixed(2)}, sale a los ${k?.t.toFixed(2)} s`);
}
// 4) Doble pulsación: pase corto flojo.
{
  const k = kickWith(keys => { const t = keys._t = (keys._t || 0) + DT; keys.a = t < 0.05 || (t > 0.1 && t < 0.15); });
  check(k && Math.abs(k.power - KICK.tapPower) < 0.001, `doble pulsación: pase flojo (fuerza ${k?.power.toFixed(2)})`);
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
