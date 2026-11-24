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
console.log(fails ? `${fails} fallos` : 'todo bien');
