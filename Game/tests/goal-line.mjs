// Comprueba que un balón que entra por la portería cuenta como gol a cualquier velocidad.
globalThis.window = {};
const { Ball } = await import('../www/js/ball.js');
const { PITCH } = await import('../www/js/config.js');
let fails = 0;
for (const v of [6, 10, 15, 20, 25, 30]) {
  for (const side of ['left', 'right']) {
    const b = new Ball();
    b.reset(side === 'left' ? 4 : PITCH.length - 4, PITCH.width / 2 + (Math.random() - 0.5) * 6);
    b.vx = side === 'left' ? -v : v;
    let ev = null;
    for (let i = 0; i < 600 && !ev; i++) ev = b.update(1 / 120);
    const ok = ev && ev.type === 'goal' && ev.side === side;
    if (!ok) fails++;
    console.log(`v=${v} ${side}: ${ok ? 'GOL' : 'FALLO ' + JSON.stringify(ev)}`);
  }
}
// Fuera por la línea de fondo (al lado del poste).
const b = new Ball(); b.reset(PITCH.length - 4, PITCH.width / 2 + 11); b.vx = 12;
let ev = null; for (let i = 0; i < 600 && !ev; i++) ev = b.update(1 / 120);
console.log('fuera:', ev?.type === 'byline' ? 'OK' : 'FALLO ' + JSON.stringify(ev));
if (ev?.type !== 'byline') fails++;
console.log(fails ? `${fails} fallos` : 'todo bien');
