// Forma de los equipos en partidos CPU contra CPU: cuántos jugadores rodean el balón, lo separados
// que están entre ellos y cuánto campo ocupan. (Para comparar cambios en la IA de posicionamiento.)
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS, PITCH } = await import('../www/js/config.js');
const W = PITCH.width;
let samples = 0, near10 = 0, near5 = 0, mate = 0, width = 0, length = 0, chasingMax = 0, goals = 0;
for (let g = 0; g < 3; g++) {
  const m = new Match({ halfMinutes: 3,
    home: { name: 'A', color: COLORS[0], cpu: true, skill: 1, formation: '4-4-2' },
    away: { name: 'B', color: COLORS[1], cpu: true, skill: 1, formation: '4-3-3' } });
  let i = 0;
  while (m.state !== 'end') {
    m.update(1 / 60);
    if (m.state !== 'play' || ++i % 30) continue;
    samples++;
    const b = m.ball;
    const field = m.players.filter(p => !p.isGK);
    near10 += field.filter(p => Math.hypot(p.x - b.x, p.y - b.y) < 10).length;
    near5 += field.filter(p => Math.hypot(p.x - b.x, p.y - b.y) < 5).length;
    for (const t of m.teams) {
      const f = t.players.filter(p => !p.isGK);
      for (const p of f) mate += Math.min(...f.filter(q => q !== p).map(q => Math.hypot(q.x - p.x, q.y - p.y))) / f.length / 2;
      const ys = f.map(p => p.y), xs = f.map(p => p.x);
      width += (Math.max(...ys) - Math.min(...ys)) / 2;
      length += (Math.max(...xs) - Math.min(...xs)) / 2;
      // cuántos van hacia el balón (moviéndose hacia él a más de 3 m/s, a menos de 20 m)
      const chasing = f.filter(p => { const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy); return d < 20 && d > 1 && (p.vx * dx + p.vy * dy) / d > 3; }).length;
      chasingMax += chasing / 2;
    }
  }
  goals += m.home.score + m.away.score;
}
const f = v => (v / samples).toFixed(1);
console.log(`jugadores de campo a <10 m del balón: ${f(near10)} · a <5 m: ${f(near5)}`);
console.log(`distancia al compañero más cercano: ${f(mate)} m · ancho del equipo: ${f(width)} m de ${W} · largo: ${f(length)} m`);
console.log(`jugadores de un equipo corriendo hacia el balón: ${f(chasingMax)} · goles en 3 partidos: ${goals}`);
