// Cansancio: en un partido normal los jugadores acaban en naranja (no en rojo); uno al que se
// hace correr todo el rato se agota; parado, se recupera.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS, FATIGUE, PLAYER } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const DT = 1 / 60;
const NAMES = ['verde', 'verde-naranja', 'naranja', 'naranja-rojo', 'rojo'];

// 1) Partido CPU contra CPU completo: niveles al final.
const m = new Match({ halfMinutes: 3,
  home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
  away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
// Uno de los jugadores, «el que usarías tú»: siempre persiguiendo el balón a tope.
const hard = m.home.players[6];
hard.human = { id: 1 };   // que la IA no lo mueva: lo movemos nosotros, como haría una persona
while (m.state !== 'end') {
  if (hard.state === 'normal' && m.state === 'play') {
    const t = m.ball.owner === hard ? { x: hard.team.oppGoalX, y: 34 } : m.ball;
    const dx = t.x - hard.x, dy = t.y - hard.y, l = Math.hypot(dx, dy) || 1;
    hard.mx = dx / l; hard.my = dy / l;
  }
  m.update(DT);
}
const field = m.players.filter(p => !p.isGK && p !== hard);
const lv = field.map(p => p.fatigueLevel);
const hist = NAMES.map((n, i) => `${n} ${lv.filter(l => l === i).length}`).join(' · ');
const avg = field.reduce((a, p) => a + p.stamina, 0) / field.length;
console.log(`final del partido (jugadores de campo): ${hist} · energía media ${avg.toFixed(2)}`);
console.log(`el que persigue el balón todo el partido: ${NAMES[hard.fatigueLevel]} (${hard.stamina.toFixed(2)})`);
check(lv.every(l => l <= 3) && lv.filter(l => l >= 1 && l <= 3).length >= field.length * 0.4,
  'un jugador normal acaba cansado (naranja) pero no agotado');
check(hard.fatigueLevel === 4, 'al que se usa a tope todo el partido se agota (rojo)');

// 2) En rojo apenas corre; parado se recupera.
{
  const p = m.home.players[5];
  p.stamina = 0.1; p.place(50, 34); p.mx = 1; p.my = 0;
  for (let i = 0; i < 120; i++) p.update(DT);
  check(Math.hypot(p.vx, p.vy) < PLAYER.speed * 0.6, `en rojo corre a ${Math.hypot(p.vx, p.vy).toFixed(1)} m/s (fresco: ${PLAYER.speed})`);
  p.mx = p.my = 0;
  for (let i = 0; i < 120; i++) p.update(DT);
  const before = p.stamina;
  for (let i = 0; i < 60 * 30; i++) p.tire(45 / 180 / 60);   // 30 s de verdad parado (parte de 3 min)
  check(p.stamina > before + 0.03, `parado se recupera (${before.toFixed(2)} → ${p.stamina.toFixed(2)} en 30 s)`);
}
console.log(fails ? `${fails} fallos` : 'todo bien');
