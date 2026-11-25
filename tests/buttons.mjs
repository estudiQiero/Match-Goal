// Botones sin balón: «raso» = entrada solo si hay un rival disputando el balón cerca;
// si no, acelerón. «Cambiar» (Cmd) pasa al jugador más cercano al balón.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { Human } = await import('../www/js/human.js');
const { COLORS, PLAYER } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const DT = 1 / 120;

function setup() {
  const m = new Match({ halfMinutes: 30,
    home: { name: 'A', color: COLORS[0], cpu: false, skill: 1 },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
  const keys = { x: 1, y: 0, a: false, b: false, sw: false };
  const h = new Human(m.home, { poll: () => keys }, 1);
  m.addHuman(h);
  m.state = 'play'; m.restartTaker = null;
  for (const p of m.players) { p.mustPass = false; p.hasBall = false; p.place(p.x, -40); }
  for (const t of m.teams) t.updateAI = () => {};
  const me = m.home.players[6];
  me.place(40, 34); h.setPlayer(me); h.switchT = 99;
  return { m, h, me, keys };
}
const press = (m, keys, k) => { keys[k] = true; m.update(DT); keys[k] = false; m.update(DT); };

// 1) Corriendo sin nadie cerca: raso = acelerón, no entrada.
{
  const { m, me, keys } = setup();
  m.ball.reset(70, 34);                                 // balón lejos, sin rivales cerca
  for (let i = 0; i < 60; i++) m.update(DT);
  press(m, keys, 'a');
  check(me.state === 'normal' && me.burstT > 0, 'sin rival cerca: raso es un acelerón (no se tira)');
  let vmax = 0; for (let i = 0; i < 40; i++) { m.update(DT); vmax = Math.max(vmax, Math.hypot(me.vx, me.vy)); }
  check(vmax > PLAYER.speed * 1.05, `el acelerón le hace ir más rápido (${vmax.toFixed(1)} m/s; normal ${PLAYER.speed})`);
}
// 2) Rival con el balón a 2 m: raso = entrada.
{
  const { m, me, keys } = setup();
  const o = m.away.players[6];
  o.place(42, 34); m.ball.reset(42.4, 34); m.giveBall(o);
  press(m, keys, 'a');
  check(me.state === 'slide', 'rival con el balón cerca: raso es una entrada');
}
// 3) Cambiar de jugador con su tecla (Cmd).
{
  const { m, h, me, keys } = setup();
  const mate = m.home.players[9];
  mate.place(60, 34); m.ball.reset(61, 34);
  press(m, keys, 'sw');
  check(h.player === mate, 'la tecla de cambiar pasa al compañero más cercano al balón');
}
// 4) El botón alto ya no cambia de jugador.
{
  const { m, h, me, keys } = setup();
  const mate = m.home.players[9];
  mate.place(60, 34); m.ball.reset(61, 34);
  press(m, keys, 'b');
  check(h.player === me, 'alto, sin balón alto cerca, no cambia de jugador');
}
// 5) Media vuelta exacta (180°): el jugador debe girarse y no correr de espaldas.
for (const [x0, y0] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071]]) {
  for (const withBall of [false, true]) {
    const { m, me, keys } = setup();
    m.ball.reset(withBall ? 40.5 : 70, 34);
    if (withBall) m.giveBall(me);
    keys.x = x0; keys.y = y0;
    for (let i = 0; i < 90; i++) m.update(DT);         // corre 0,75 s en una dirección
    keys.x = -x0; keys.y = -y0;                         // y pide justo la contraria
    for (let i = 0; i < 60; i++) m.update(DT);          // 0,5 s
    const facing = me.fx * -x0 + me.fy * -y0;           // 1 = mira hacia donde va
    check(facing > 0.95, `media vuelta (${x0},${y0}) ${withBall ? 'con' : 'sin'} balón: se gira (mira ${facing.toFixed(2)})`);
  }
}
// 6) Esprint: doble toque en la misma dirección. Más rápido y más cansancio; se acaba al soltar.
{
  const run = doubleTap => {
    const { m, me, keys } = setup();
    m.ball.reset(90, 10);
    me.place(20, 34); me.stamina = 1;
    keys.x = 0; keys.y = 0; m.update(DT);
    if (doubleTap) {
      keys.x = 1; for (let i = 0; i < 10; i++) m.update(DT);   // pulsa
      keys.x = 0; for (let i = 0; i < 12; i++) m.update(DT);   // suelta 0,1 s
    }
    keys.x = 1;                                                // vuelve a pulsar y mantiene
    let vmax = 0;
    const s0 = me.stamina;
    for (let i = 0; i < 3 / DT; i++) { m.update(DT); vmax = Math.max(vmax, Math.hypot(me.vx, me.vy)); }
    const used = s0 - me.stamina;
    keys.x = 0; m.update(DT);
    return { vmax, used, after: me.sprinting };
  };
  const normal = run(false), sprint = run(true);
  check(sprint.vmax > normal.vmax * 1.15, `doble toque: esprinta (${sprint.vmax.toFixed(1)} m/s; normal ${normal.vmax.toFixed(1)})`);
  check(sprint.used > normal.used * 2, `esprintar cansa más (${(sprint.used * 1000).toFixed(1)} frente a ${(normal.used * 1000).toFixed(1)} milésimas en 3 s)`);
  check(!sprint.after, 'al soltar la dirección deja de esprintar');
}
// 7) Cerca de la portería el medidor manual se llena más deprisa, y el chut sale al soltar.
{
  const meterAfter = (dist, secs) => {
    const { m, h, me, keys } = setup();
    const gx = m.home.oppGoalX, d = m.home.dir;
    me.place(gx - d * dist, 34); me.fx = d; me.fy = 0;
    m.ball.reset(me.x + d * 0.45, 34); m.giveBall(me);
    keys.x = 0; keys.y = 0; keys.a = true;
    for (let i = 0; i < secs / DT; i++) m.update(DT);
    const v = h.meter.value; keys.a = false;
    return v;
  };
  const near = meterAfter(9, 0.45), far = meterAfter(28, 0.45), pass = meterAfter(70, 0.45);
  check(near > 0.85, `a 9 m, en 0,45 s el medidor ya va por ${near.toFixed(2)}`);
  check(far < near && far > 0.35, `a 28 m, en 0,45 s va por ${far.toFixed(2)}`);
  check(pass < 0.3, `lejos de la portería (pase), en 0,45 s va por ${pass.toFixed(2)} (2 s para llenarse)`);

  // Al soltar sale el chut en ese mismo instante, aunque el balón esté algo adelantado.
  const { m, h, me, keys } = setup();
  const gx = m.home.oppGoalX, d = m.home.dir;
  me.place(gx - d * 14, 34); me.fx = d; me.fy = 0;
  m.ball.reset(me.x + d * 1.3, 34); m.giveBall(me);
  let at = null; const orig = h.release.bind(h); h.release = (...a) => { at ??= m.time; return orig(...a); };
  keys.a = true; for (let i = 0; i < 0.35 / DT; i++) m.update(DT);
  m.ball.x = me.x + d * 1.3; m.ball.y = 34; m.ball.vx = m.ball.vy = 0;
  keys.a = false; const tUp = m.time; m.update(DT); m.update(DT);
  check(at !== null && at - tUp < 0.03, `el chut sale al soltar (${at === null ? 'no salió' : ((at - tUp) * 1000).toFixed(0) + ' ms'}), con el balón a 1,3 m`);
}
// 8) Saque de banda para tu equipo: si no golpeas, a los pocos segundos saca el jugador solo
//    (antes se quedaba esperando y parecía que el juego se había congelado).
{
  const { m, h, me, keys } = setup();
  keys.x = 0; keys.y = 0;
  const mate = m.home.players[9]; mate.place(me.x + 8, 60);
  m.ball.reset(me.x, 68.5); m.ball.lastTouch = m.away.players[6];
  m.handleEvent({ type: 'throw' });                       // banda a favor: pausa, va a por el balón…
  const taker = m.restartTaker;
  let mustTake = false, t = 0, ready = false;
  for (let i = 0; i < 20 / DT; i++) {
    m.update(DT); t += DT;
    if (h.mustTakeRestart) mustTake = true;
    if (m.state === 'restart' || (m.state === 'play' && taker.hasBall)) ready = true;
    if (ready && !taker.hasBall) break;
  }
  check(mustTake, 'mientras te toca sacar se avisa en pantalla');
  check(!taker.hasBall && m.state === 'play', `si no golpeas, saca solo (a los ${t.toFixed(1)} s)`);
}
console.log(fails ? `${fails} fallos` : 'todo bien');
