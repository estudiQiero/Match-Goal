// Línea de trayectoria: lo que dibuja coincide con lo que hace el balón en un golpeo sin azar
// (pase raso y pase alto), crece con la fuerza, y el alto dibuja un arco.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { Human } = await import('../www/js/human.js');
const { COLORS } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };

const m = new Match({ halfMinutes: 30,
  home: { name: 'A', color: COLORS[0], cpu: false, skill: 1 },
  away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
const h = new Human(m.home, { poll: () => ({ x: 0, y: 0, a: false, b: false }) }, 1);
const me = m.home.players[6];
h.setPlayer(me);
const dir = m.home.dir;
// Lejos de la portería rival y mirando hacia la banda: golpeo normal, no chut.
function setupKick() {
  for (const p of m.players) if (p !== me) p.place(p.x, -40);
  me.place(m.home.xFromProgress(0.3), 34); me.fx = 0; me.fy = -1; me.vx = me.vy = 0;
  m.ball.reset(me.x, me.y - 0.5); m.ball.owner = me; me.hasBall = true;
}
const inp = { x: 0, y: -1 };
for (const [type, power] of [['ground', 0.3], ['ground', 0.6], ['loft', 0.4], ['loft', 0.7]]) {
  setupKick();
  const pts = h.trajectory(m, type, power, inp);
  const end = pts[pts.length - 1];
  const maxZ = Math.max(...pts.map(q => q[2]));
  // Golpeo de verdad con la misma fuerza y física: ¿dónde acaba el balón?
  setupKick();
  h.release(m, inp, type, power);
  const b = m.ball;
  for (let i = 0; i < 360; i++) { const ev = b.update(1 / 60); if (ev || (b.speed < 0.4 && b.z <= 0.01)) break; }
  const err = Math.hypot(b.x - end[0], b.y - end[1]);
  const len = Math.hypot(end[0] - pts[0][0], end[1] - pts[0][1]);
  check(err < 0.5, `${type === 'loft' ? 'alto' : 'raso'} ${power}: la línea (${len.toFixed(1)} m, altura máx ${maxZ.toFixed(1)} m) acaba donde el balón (a ${err.toFixed(2)} m)`);
}
// Más fuerza, línea más larga; el alto sube y el raso no.
setupKick();
const g1 = h.trajectory(m, 'ground', 0.3, inp), g2 = h.trajectory(m, 'ground', 0.7, inp);
const L = q => Math.hypot(q[q.length - 1][0] - q[0][0], q[q.length - 1][1] - q[0][1]);
check(L(g2) > L(g1) * 1.5, `más fuerza, más larga (${L(g1).toFixed(1)} m → ${L(g2).toFixed(1)} m)`);
check(Math.max(...g1.map(q => q[2])) < 0.3, 'el raso va a ras de césped');
{ const hz = Math.max(...h.trajectory(m, 'loft', 0.6, inp).map(q => q[2])); check(hz > 1.5, `el alto hace un arco (sube a ${hz.toFixed(1)} m)`); }
// Sin balón no hay línea.
me.hasBall = false;
check(h.trajectory(m, 'ground', 0.5, inp) === null, 'sin balón no hay línea');
// Posición de chut: cerca de la portería y encarándola sí; de espaldas o lejos, no.
{
  const gx = m.home.oppGoalX;
  me.hasBall = true;
  me.place(gx - dir * 15, 34); me.fx = dir; me.fy = 0;
  check(h.canShoot, 'a 15 m encarando la portería: se puede chutar (punto y línea rojos)');
  h.press = { type: 'ground', phase: 'manual', t: 1.2, u: 0.6, auto: 0.5 };
  check(h.previewLine(m)?.shot === true, 'la línea de un chut a puerta va en rojo');
  me.fx = -dir;
  check(!h.canShoot, 'de espaldas a la portería: no');
  check(h.previewLine(m)?.shot === false, 'y la línea vuelve a ser amarilla');
  me.fx = dir; me.place(gx - dir * 40, 34);
  check(!h.canShoot, 'a 40 m: no');
  h.press = null;
}
// Tras golpear, la línea que se queda sigue los pies: lo que queda detrás del jugador se borra.
{
  setupKick();
  h.release(m, inp, 'ground', 0.6);
  const before = h.previewLine(m).pts;
  me.y -= 4;                                             // el jugador sigue corriendo 4 m en esa dirección
  const after = h.previewLine(m).pts;
  const behind = after.some(q => q[1] > me.y - 0.4);      // ningún punto a su espalda (va hacia y negativa)
  check(!behind && after.length < before.length, `tras golpear, la línea empieza delante de sus pies (de ${before.length} a ${after.length} puntos)`);
  me.y -= 40;
  check(h.previewLine(m) === null, 'si ya ha pasado toda la línea, desaparece');
}
console.log(fails ? `${fails} fallos` : 'todo bien');
