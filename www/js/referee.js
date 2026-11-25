// Árbitro: mismo dibujo que los jugadores, todo de negro y sin dorsal.
// No toca el balón ni choca con nadie. Es tranquilo: se queda quieto mirando la jugada
// y solo se recoloca cuando el balón se le aleja; casi siempre andando, trota si se queda muy lejos.
import { PITCH } from './config.js';
import { turnToward } from './player.js';

const L = PITCH.length, W = PITCH.width, CY = W / 2;

export const REF_KIT = {
  shirt: '#1e1e22', shorts: '#141416', socks: '#1e1e22',
  trim: '#f2f2f2', badge: '#e6c440',
};

const WALK = 2.2;      // m/s andando
const JOG = 4.6;       // m/s trotando (los jugadores van a 6,8 y esprintan a 8,2)
const ACCEL = 5;       // arranca y frena sin prisa
const START = 10;      // se pone en marcha si su sitio queda a más de esto
const ARRIVE = 3;      // y para al llegar a menos de esto

export class Referee {
  constructor() {
    this.x = L / 2; this.y = CY;
    this.vx = 0; this.vy = 0;
    this.fx = 0; this.fy = 1;
    this.anim = 0;
    this.state = 'normal';
    this.kit = REF_KIT;
    this.index = 3;
    this.moving = false;
    this.side = -1;        // lado del balón en el que se coloca (arriba / abajo)
  }

  place(x, y) { this.x = x; this.y = y; this.vx = this.vy = 0; this.moving = false; }

  // Sitio ideal: en diagonal respecto al balón, unos metros hacia el centro del campo
  // y al otro lado del balón respecto a la banda más cercana, para ver la jugada de frente.
  // Solo cambia de lado cuando el balón se va claramente a la otra mitad (no a cada cruce del centro).
  target(ball) {
    if (ball.y < CY - 8) this.side = 1;
    else if (ball.y > CY + 8) this.side = -1;
    const tx = ball.x + (L / 2 - ball.x) * 0.35;
    const ty = CY + (ball.y - CY) * 0.4 + this.side * 7;
    return [Math.max(4, Math.min(L - 4, tx)), Math.max(3, Math.min(W - 3, ty))];
  }

  update(dt, ball) {
    // goTo: cuando tiene una tarea (ir a por el balón tras un fuera de juego, plantarlo en su sitio).
    const [tx, ty] = this.goTo ? [this.goTo.x, this.goTo.y] : this.target(ball);
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (this.goTo) this.moving = d > 0.25;
    else {
      if (!this.moving && d > START) this.moving = true;
      if (this.moving && d < ARRIVE) this.moving = false;
    }

    const want = this.moving ? (this.goTo ? Math.min(JOG, d * 3) : d > 14 ? JOG : WALK) : 0;
    const wx = d ? dx / d * want : 0, wy = d ? dy / d * want : 0;
    const k = Math.min(1, ACCEL * dt / Math.max(0.01, Math.hypot(wx - this.vx, wy - this.vy)));
    this.vx += (wx - this.vx) * k; this.vy += (wy - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;

    // Mira hacia donde anda; parado, gira poco a poco hacia el balón.
    const sp = Math.hypot(this.vx, this.vy);
    let fx = this.vx, fy = this.vy;
    if (sp < 0.6) { fx = ball.x - this.x; fy = ball.y - this.y; }
    const fl = Math.hypot(fx, fy);
    if (fl > 0.01) {
      [this.fx, this.fy] = turnToward(this.fx, this.fy, fx / fl, fy / fl, 4 * dt);
    }
    this.anim += sp * dt * 1.6;
  }
}

// Linieres: uno en cada banda, cada uno en una mitad del campo. Corren por la banda siguiendo
// el balón (sin pasar del medio campo) y levantan el banderín cuando hay fuera de juego.
export class Linesman {
  // side: -1 banda lejana (arriba), 1 banda cercana (abajo). half: 0 mitad izquierda, 1 derecha.
  constructor(side, half, index) {
    this.side = side; this.half = half;
    this.y = side < 0 ? -LINE_OFF : W + LINE_OFF;
    this.x = half ? L * 0.75 : L * 0.25;
    this.vx = 0; this.vy = 0;
    this.fx = 0; this.fy = -side;            // mirando al campo
    this.anim = 0;
    this.state = 'normal';
    this.kit = REF_KIT;                      // mismo uniforme que el árbitro
    this.index = index;
    this.flagT = 0;                          // > 0: banderín levantado (fuera de juego)
  }

  place(x) { this.x = x; this.vx = 0; }

  // Cubre su mitad: sigue al balón por la banda, sin pasar del medio campo.
  update(dt, ball) {
    if (this.flagT > 0) {                    // con el banderín en alto, quieto
      this.flagT -= dt;
      this.vx *= Math.exp(-10 * dt);
    } else {
      const lo = this.half ? L / 2 : 2, hi = this.half ? L - 2 : L / 2;
      const tx = Math.max(lo, Math.min(hi, ball.x));
      const dx = tx - this.x;
      // Trota si la jugada se le aleja; si va casi alineado, anda.
      const want = Math.abs(dx) < 0.8 ? 0 : Math.sign(dx) * Math.min(LINE_SPEED, Math.abs(dx) * 1.5);
      const k = Math.min(1, 8 * dt);
      this.vx += (want - this.vx) * k;
    }
    this.x += this.vx * dt;
    // Mira hacia donde corre; parado, al campo.
    const sp = Math.abs(this.vx);
    const [tfx, tfy] = sp > 0.6 ? [Math.sign(this.vx), 0] : [0, -this.side];
    [this.fx, this.fy] = turnToward(this.fx, this.fy, tfx, tfy, 6 * dt);
    this.anim += sp * dt * 1.6;
  }
}

const LINE_OFF = 1.2;        // metros por fuera de la banda
const LINE_SPEED = 6;        // m/s como mucho (corriendo la banda)

