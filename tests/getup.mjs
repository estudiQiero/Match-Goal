// Entradas y caídas: después hay que levantarse, y mientras tanto no se juega.
globalThis.window = {};
const { Match } = await import('../www/js/match.js');
const { COLORS, PLAYER } = await import('../www/js/config.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLO ') + msg); if (!ok) fails++; };
const DT = 1 / 120;

const m = new Match({ halfMinutes: 30,
  home: { name: 'A', color: COLORS[0], cpu: true, skill: 1 },
  away: { name: 'B', color: COLORS[1], cpu: true, skill: 1 } });
m.state = 'play'; m.restartTaker = null;
for (const p of m.players) { p.mustPass = false; p.hasBall = false; p.place(p.x, -40); }
for (const t of m.teams) t.updateAI = () => {};
const atk = m.away.players[6], def = m.home.players[3];
atk.place(50, 34); atk.fx = -1; atk.fy = 0;
m.ball.reset(49.5, 34); m.giveBall(atk);
def.place(53, 34); def.fx = -1; def.fy = 0;
def.slide();                                   // entrada por detrás hacia el balón

let slideEnd = null, upAt = null, atkDown = false, atkUp = null, defTouched = false;
for (let i = 0; i < 4 / DT; i++) {
  m.update(DT);
  if (slideEnd === null && def.state === 'getup') slideEnd = m.time;
  if (slideEnd !== null && upAt === null && def.state === 'normal') upAt = m.time;
  if (atk.state === 'fallen') atkDown = true;
  if (atkDown && atkUp === null && atk.state === 'normal') atkUp = m.time;
  // Mientras se levanta no puede hacerse con el balón ni moverse.
  if (def.state === 'getup') {
    if (m.ball.owner === def) defTouched = true;
    def.mx = 1; def.my = 0;                    // intenta moverse: no debe poder
  }
}
const getUp = upAt - slideEnd;
const [lo, hi] = PLAYER.getUp.slide;
check(slideEnd !== null && upAt !== null, 'tras la entrada pasa por «levantarse» y vuelve a jugar');
check(getUp >= lo - 0.02 && getUp <= hi + 0.02, `tarda en levantarse ${getUp.toFixed(2)} s (entre ${lo} y ${hi})`);
check(!defTouched, 'mientras se levanta no coge el balón');
check(atkDown && atkUp !== null, `el que recibe la entrada cae y se levanta (vuelve a jugar a los ${(atkUp - 0).toFixed(2)} s)`);
console.log(fails ? `${fails} fallos` : 'todo bien');
