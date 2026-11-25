import { BALL, PITCH, WALLS } from './config.js';

const CY = PITCH.width / 2;
const HALF_GOAL = PITCH.goalWidth / 2;

export class Ball {
  constructor() {
    this.reset(PITCH.length / 2, CY);
  }

  reset(x, y) {
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.spin = 0;          // aceleración lateral (efecto), m/s²
    this.owner = null;      // jugador que la controla (la conduce a toques: no va pegada)
    this.attached = false;  // pegada al jugador: en las manos del portero o esperando un saque
    this.lastTouch = null;  // último jugador que la tocó
    this.inNet = null;      // 'left' | 'right' cuando ha entrado en una portería
    this.dead = false;      // fuera de juego: rueda libre hasta pararse, rebota en las vallas o vuelve de la grada
    this.returning = false; // volviendo de la grada por encima de la valla
    this.inCrowd = false;   // se ha ido a la grada (no se ve hasta que el público lo devuelve)
    this.rot = 0;           // rotación visual
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  kick(vx, vy, vz, spin = 0) {
    this.vx = vx; this.vy = vy; this.vz = vz; this.spin = spin;
    this.kickId = (this.kickId || 0) + 1;
    this.age = 0;
    if (this.owner) this.owner.hasBall = false;
    this.owner = null;
  }

  // Devuelve un evento si el balón sale del campo o entra en una portería.
  update(dt) {
    const px = this.x;
    let event = null;
    this.age = (this.age || 0) + dt;

    if (!this.attached) {
      // Efecto: aceleración perpendicular a la velocidad.
      const s = this.speed;
      if (s > 1 && this.spin) {
        this.vx += (-this.vy / s) * this.spin * dt;
        this.vy += (this.vx / s) * this.spin * dt;
        this.spin *= Math.exp(-1.2 * dt);
      }

      if (this.z > 0 || this.vz > 0) {
        this.vz -= BALL.gravity * dt;
        const drag = 1 - BALL.airDrag * dt;
        this.vx *= drag; this.vy *= drag;
      } else if (s > 0) {
        const ns = Math.max(0, s - BALL.groundDecel * dt) * (1 - 0.25 * dt);
        this.vx *= ns / s; this.vy *= ns / s;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;

      if (this.z < 0) {
        this.z = 0;
        if (this.vz < -1.5) {
          this.vz = -this.vz * BALL.bounce;
          this.vx *= BALL.bounceFriction; this.vy *= BALL.bounceFriction;
          this.spin *= 0.5;
        } else {
          this.vz = 0;
        }
      }

      this.collideGoal(0, -1);
      this.collideGoal(PITCH.length, 1);
    }

    this.rot += this.speed * dt * 3;

    if (this.inNet) {
      this.containNet();
      return null;
    }
    if (this.dead) { this.walls(); return null; }

    // ¿Ha cruzado la línea de fondo?
    const r = BALL.radius;
    // El balón entero tiene que pasar la línea (x < -r o x > largo + r).
    // Se mira si la ha pasado en este paso, aunque en el anterior ya estuviera encima de la línea.
    if (px >= -r && this.x < -r) event = this.lineEvent('left');
    else if (px <= PITCH.length + r && this.x > PITCH.length + r) event = this.lineEvent('right');
    else if (this.y < -r || this.y > PITCH.width + r) event = { type: 'throw' };
    return event;
  }

  // Fuera del campo: las vallas publicitarias (bajas) y, un poco detrás, la grada.
  // Bajo, el balón rebota en la valla. Alto, salta la valla, choca con la grada y vuelve al campo
  // saltando otra vez la valla (nunca se queda detrás ni se pierde).
  walls() {
    const lim = [['x', -WALLS.end, -1], ['x', PITCH.length + WALLS.end, 1], ['y', -WALLS.far, -1], ['y', PITCH.width + WALLS.near, 1]];
    let behind = false;
    for (const [axis, at, s] of lim) {
      const vk = axis === 'x' ? 'vx' : 'vy', ok = axis === 'x' ? 'vy' : 'vx';
      const past = (this[axis] - at) * s;                   // metros por detrás de la valla
      if (past <= 0) continue;
      behind = true;
      if (this.returning) continue;                         // volviendo de la grada: pasa por encima
      if (past < 0.4 && this.z <= WALLS.height) {
        // Rebote en la valla.
        this[axis] = at;
        if (this[vk] * s > 0) { this[vk] = -this[vk] * WALLS.bounce; this[ok] *= 0.8; }
      } else if (past >= WALLS.stand) {
        // Choca con la grada: vuelve hacia el campo, con un saltito para pasar la valla.
        this[axis] = at + s * WALLS.stand;
        this[vk] = -s * Math.max(2.5, Math.abs(this[vk]) * 0.35);
        this[ok] *= 0.5;
        this.vz = Math.max(this.vz * 0.3, 4.2);
        this.returning = true;
      }
    }
    if (!behind) this.returning = false;
  }

  lineEvent(side) {
    if (Math.abs(this.y - CY) < HALF_GOAL && this.z < PITCH.goalHeight) {
      this.inNet = side;
      return { type: 'goal', side };
    }
    return { type: 'byline', side };
  }

  // Postes y larguero.
  collideGoal(gx, dir) {
    if (this.z < PITCH.goalHeight + BALL.radius) {
      for (const py of [CY - HALF_GOAL, CY + HALF_GOAL]) {
        if (this.z < PITCH.goalHeight) this.bounceOff(this.x - gx, this.y - py, 'xy');
      }
    }
    if (Math.abs(this.y - CY) < HALF_GOAL) {
      this.bounceOff(this.x - gx, this.z - PITCH.goalHeight, 'xz');
    }
  }

  bounceOff(dx, dd, plane) {
    const minD = BALL.radius + BALL.postRadius;
    const d = Math.hypot(dx, dd);
    if (d >= minD || d === 0) return;
    const nx = dx / d, nd = dd / d;
    const v2 = plane === 'xy' ? this.vy : this.vz;
    const vn = this.vx * nx + v2 * nd;
    // Empuja fuera del poste.
    this.x += nx * (minD - d);
    if (plane === 'xy') this.y += nd * (minD - d); else this.z += nd * (minD - d);
    if (vn < 0) {
      this.vx -= (1 + BALL.postBounce) * vn * nx;
      if (plane === 'xy') this.vy -= (1 + BALL.postBounce) * vn * nd;
      else this.vz -= (1 + BALL.postBounce) * vn * nd;
      this.spin = 0;
      this.onPost = true;
    }
  }

  containNet() {
    const back = this.inNet === 'left' ? -PITCH.goalDepth : PITCH.length + PITCH.goalDepth;
    const r = BALL.radius;
    if (this.inNet === 'left' ? this.x < back + r : this.x > back - r) {
      this.x = this.inNet === 'left' ? back + r : back - r;
      this.vx *= -0.15; this.vy *= 0.5; this.vz *= 0.5;
    }
    const lim = HALF_GOAL - r;
    if (Math.abs(this.y - CY) > lim) {
      this.y = CY + Math.sign(this.y - CY) * lim;
      this.vy *= -0.15;
    }
    if (this.z > PITCH.goalHeight - r) { this.z = PITCH.goalHeight - r; this.vz *= -0.2; }
  }
}
