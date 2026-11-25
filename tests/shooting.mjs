// Chut a puerta del jugador humano: dónde acaban los tiros según orientación, velocidad,
// fuerza y dirección pulsada a última hora. Sin portero: solo se mira si van entre los tres palos.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { Human } = await import('../www/js/human.js');
const { COLORS, PITCH } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const CY = PITCH.width / 2, HALF = PITCH.goalWidth / 2;

const m = new Match({ halfMinutes: 30,
  home: { name: 'A', color: COLORS[0], cpu: false, skill: 1 },
  away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
const h = new Human(m.home, { poll: () => ({ x: 0, y: 0, a: false, b: false }) }, 1);
const me = m.home.players[6];
h.setPlayer(me);
const gx = m.home.oppGoalX, dir = m.home.dir;

// Un tiro: devuelve 'gol' | 'fuera' | 'alto' | 'corto'.
function shot({ dist = 14, side = 0, bodyDeg = 0, speed = 0, power = 0.75, type = 'ground', lateDeg = null }) {
  const b = m.ball;
  me.place(gx - dir * dist, CY + side);
  const a = Math.atan2(CY - me.y, gx - me.x) + bodyDeg * Math.PI / 180;
  me.fx = Math.cos(a); me.fy = Math.sin(a);
  me.vx = me.fx * speed; me.vy = me.fy * speed;
  b.reset(me.x + me.fx * 0.5, me.y + me.fy * 0.5);
  b.owner = me; me.hasBall = true;
  let inp = { x: 0, y: 0 };
  if (lateDeg !== null) { const la = a + lateDeg * Math.PI / 180; inp = { x: Math.cos(la), y: Math.sin(la) }; }
  h.shoot(m, inp, type, power);
  for (let i = 0; i < 600; i++) {
    const px = b.x;
    b.update(1 / 120);
    b.inNet = null;
    if ((px - gx) * dir < 0 && (b.x - gx) * dir >= 0) {
      if (Math.abs(b.y - CY) > HALF) return 'fuera';
      return b.z > PITCH.goalHeight ? 'alto' : 'gol';
    }
    if (b.speed < 0.3 && b.z <= 0) return 'corto';
  }
  return 'corto';
}
function rate(opts, n = 300) {
  const r = { gol: 0, fuera: 0, alto: 0, corto: 0 };
  for (let i = 0; i < n; i++) r[shot(opts)]++;
  const pct = k => Math.round(r[k] * 100 / n);
  return { gol: pct('gol'), fuera: pct('fuera'), alto: pct('alto'), corto: pct('corto') };
}
const show = (label, r) => `${label}: ${r.gol}% entre los palos · ${r.fuera}% fuera · ${r.alto}% alto · ${r.corto}% corto`;

const base = rate({});
const run = rate({ speed: 6.5 });
const offBody = rate({ bodyDeg: 30 });
const late = rate({ lateDeg: 90 });
const strong = rate({ power: 1 });
const high = rate({ type: 'loft', power: 0.55, dist: 18 });
const highStrong = rate({ type: 'loft', power: 1, dist: 18 });
const far = rate({ dist: 26 });
const angle = rate({ dist: 12, side: 12 });
for (const [l, r] of [['bien orientado, parado, 14 m', base], ['corriendo a tope', run], ['cuerpo 30° desviado', offBody],
  ['dirección perpendicular a última hora', late], ['fuerza al máximo (raso)', strong], ['chut alto bien medido, 18 m', high],
  ['chut alto al máximo', highStrong], ['desde lejos, 26 m', far], ['desde un lado, poco ángulo', angle]]) console.log(show(l, r));

check(base.gol >= 75, 'bien orientado: la mayoría entre los palos');
check(run.gol < base.gol && run.gol >= 45, 'corriendo deprisa: algo menos preciso');
check(offBody.gol < 45, 'con el cuerpo mal orientado: casi siempre fuera');
check(late.gol < 45 && late.alto + late.fuera > 50, 'dirección a última hora: se va fuera o alto');
check(strong.alto >= 10 && strong.gol < base.gol, 'pasarse de fuerza: a veces se va por encima');
check(high.gol >= 55, 'chut alto bien medido: suele ir bajo el larguero');
check(highStrong.alto >= 40, 'chut alto al máximo: casi siempre por encima');
console.log(fails ? `${fails} fallos` : 'todo bien');
