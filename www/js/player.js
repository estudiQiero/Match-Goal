import { PLAYER, KICK, PITCH, FATIGUE } from './config.js';

// Gira el vector (fx, fy) hacia (tx, ty) como mucho maxStep radianes.
// Por ángulo y no mezclando vectores: al mezclar, una media vuelta exacta (180°) se anula
// en cada paso y el jugador se quedaba mirando hacia atrás mientras corría.
export function turnToward(fx, fy, tx, ty, maxStep) {
  const a = Math.atan2(fy, fx), b = Math.atan2(ty, tx);
  let d = b - a;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;       // entre -π y π
  if (Math.abs(d) >= Math.PI - 1e-6) d = Math.PI;         // justo detrás: gira siempre hacia un lado
  const n = a + Math.max(-maxStep, Math.min(maxStep, d));
  return [Math.cos(n), Math.sin(n)];
}

export class Player {
  constructor(team, index, slot) {
    this.team = team;
    this.index = index;
    this.slot = slot;           // posición en la formación
    this.role = slot.role;
    this.number = index + 1;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.fx = team.dir; this.fy = 0;   // hacia dónde mira
    this.mx = 0; this.my = 0;          // movimiento deseado (-1..1)
    this.maxSpeed = PLAYER.speed;
    this.state = 'normal';             // normal | slide | fallen | dive | jump
    this.stateT = 0;
    this.kickCD = 0;
    this.stealCD = 0;
    this.hasBall = false;
    this.mustPass = false;             // en saques: no puede moverse con el balón
    this.anim = Math.random() * 10;
    this.kickAnim = 0;
    this.z = 0; this.vz = 0;           // altura de los pies (salto)
    this.human = null;                 // controlador humano si lo maneja una persona
    this.skill = 1;
    this.stamina = 1;                  // energía: 1 fresco, 0 agotado
    this.burstT = 0;                   // acelerón en curso
    this.burstCD = 0;
  }

  get isGK() { return this.role === 'GK'; }

  place(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.z = 0; this.vz = 0;
    this.state = 'normal'; this.stateT = 0;
  }

  // Movimiento hacia un punto (IA).
  moveTo(tx, ty, urgency = 1, stopDist = 0.4) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < stopDist) { this.mx = 0; this.my = 0; return d; }
    const f = Math.min(1, d / 3) * urgency;
    this.mx = (dx / d) * f; this.my = (dy / d) * f;
    return d;
  }

  faceTo(tx, ty) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) { this.fx = dx / d; this.fy = dy / d; }
  }

  update(dt) {
    this.kickCD = Math.max(0, this.kickCD - dt);
    this.stealCD = Math.max(0, this.stealCD - dt);
    this.kickAnim = Math.max(0, this.kickAnim - dt);
    this.burstT = Math.max(0, this.burstT - dt);
    this.burstCD = Math.max(0, this.burstCD - dt);
    if (this.stateT > 0) {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        // Tras una entrada, una caída o una estirada no se vuelve a jugar al momento: hay que levantarse.
        const r = PLAYER.getUp[this.state];
        if (r) {
          this.getUpFrom = this.state;
          this.getUpTime = r[0] + Math.random() * (r[1] - r[0]);
          this.state = 'getup';
          this.stateT = this.getUpTime;
        } else this.state = 'normal';
      }
    }

    if (this.state === 'jump') {
      // En el aire no se puede cambiar de dirección: sigue con el impulso que llevaba.
      this.vz -= 9.81 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) { this.z = 0; this.vz = 0; this.state = 'normal'; }
      const k = Math.exp(-0.6 * dt);
      this.vx *= k; this.vy *= k;
    } else if (this.state === 'slide' || this.state === 'dive') {
      const k = Math.exp(-3 * dt);
      this.vx *= k; this.vy *= k;
    } else if (this.state === 'fallen' || this.state === 'getup') {
      this.vx *= Math.exp(-8 * dt); this.vy *= Math.exp(-8 * dt);
    } else {
      const lv = this.fatigueLevel;
      let max = this.maxSpeed * this.skill * FATIGUE.speed[lv];
      if (this.burstT > 0) max *= PLAYER.burstSpeed;
      if (this.hasBall) max *= PLAYER.dribbleSpeed;
      if (this.hasBall && this.mustPass) max = 0;
      const tvx = this.mx * max, tvy = this.my * max;
      const dvx = tvx - this.vx, dvy = tvy - this.vy;
      const dv = Math.hypot(dvx, dvy);
      const step = PLAYER.accel * FATIGUE.accel[lv] * (this.burstT > 0 ? 1.5 : 1) * dt;
      if (dv <= step) { this.vx = tvx; this.vy = tvy; }
      else { this.vx += (dvx / dv) * step; this.vy += (dvy / dv) * step; }
      const s = Math.hypot(this.mx, this.my);
      if (s > 0.1) {
        // Gira hacia la dirección de movimiento a velocidad fija (también en una media vuelta).
        [this.fx, this.fy] = turnToward(this.fx, this.fy, this.mx / s, this.my / s, PLAYER.turnRate * dt);
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Límites (se permite salir un poco del campo).
    this.x = Math.max(-3, Math.min(PITCH.length + 3, this.x));
    this.y = Math.max(-3, Math.min(PITCH.width + 3, this.y));

    this.anim += Math.hypot(this.vx, this.vy) * dt * 1.6;
  }

  // Golpeo del balón.
  //  type: 'ground' | 'loft' | 'header' | 'volley'
  //  power: 0..1
  kick(ball, dx, dy, power, type, spin = 0) {
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    let v, vz;
    switch (type) {
      case 'loft': {
        const pc = Math.pow(power, KICK.curve);
        v = KICK.loftMin + (KICK.loftMax - KICK.loftMin) * pc;
        vz = KICK.loftVzMin + (KICK.loftVzMax - KICK.loftVzMin) * pc;
        break;
      }
      case 'header':
        v = KICK.headerSpeed * (0.6 + power * 0.5);
        vz = 1 + power * 2;
        break;
      case 'volley':
        v = KICK.volleySpeed * (0.7 + power * 0.4);
        vz = 1.5 + power * 2.5;
        break;
      default:
        v = KICK.groundMin + (KICK.groundMax - KICK.groundMin) * Math.pow(power, KICK.curve);
        vz = power > 0.7 ? (power - 0.7) * 10 : 0;   // un chut muy fuerte se levanta
    }
    ball.kick(dx * v, dy * v, vz, spin);
    ball.lastTouch = this;
    this.hasBall = false;
    this.mustPass = false;
    this.kickCD = PLAYER.kickCooldown;
    this.kickAnim = 0.25;
    this.fx = dx; this.fy = dy;
  }

  // Pase con velocidad calculada para llegar al punto (tx, ty).
  passTo(ball, tx, ty, lofted = false) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (lofted) {
      const T = 0.8 + d / 28;
      const vz = 9.81 * T / 2;
      const v = (d / T) * 1.06;
      ball.kick(dx / d * v, dy / d * v, vz);
    } else {
      const vEnd = 5.5;
      const v = Math.min(KICK.groundMax, Math.sqrt(vEnd * vEnd + 2 * 3.2 * d) * 1.12);
      ball.kick(dx / d * v, dy / d * v, 0);
    }
    ball.lastTouch = this;
    this.hasBall = false;
    this.mustPass = false;
    this.kickCD = PLAYER.kickCooldown;
    this.kickAnim = 0.25;
    this.fx = dx / d; this.fy = dy / d;
  }

  // Nivel de cansancio: 0 fresco (3 verdes) … 4 agotado (3 rojos).
  get fatigueLevel() {
    const s = this.stamina, L = FATIGUE.levels;
    return s > L[0] ? 0 : s > L[1] ? 1 : s > L[2] ? 2 : s > L[3] ? 3 : 4;
  }

  // Gasta o recupera energía. gameMin = minutos de partido que han pasado en este paso.
  tire(gameMin) {
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > FATIGUE.walk) {
      const e = Math.min(1.2, sp / PLAYER.speed);
      let k = FATIGUE.drain * e * e;
      if (this.hasBall) k *= FATIGUE.ballDrain;
      if (this.burstT > 0) k *= FATIGUE.burstDrain;
      this.stamina -= k * gameMin;
    } else {
      // Parado se recupera del todo; andando, menos.
      this.stamina += FATIGUE.recover * (1 - sp / FATIGUE.walk * 0.7) * gameMin;
    }
    this.stamina = Math.max(0, Math.min(1, this.stamina));
  }

  // Acelerón corto (cuando se pulsa «raso» sin balón y sin nadie a quien entrar).
  burst() {
    if (this.state !== 'normal' || this.burstCD > 0) return;
    this.burstT = PLAYER.burstTime;
    this.burstCD = PLAYER.burstCooldown;
  }

  slide() {
    if (this.state !== 'normal' || this.hasBall) return;
    this.state = 'slide';
    this.stateT = PLAYER.slideTime;
    this.vx = this.fx * PLAYER.slideSpeed;
    this.vy = this.fy * PLAYER.slideSpeed;
  }

  fall(t = PLAYER.fallTime) {
    this.state = 'fallen';
    this.stateT = t;
    this.hasBall = false;
  }

  // Salto para cabecear (o para atrapar, el portero). Sube ~0,8 m y cae en ~0,8 s.
  jump(power = 1) {
    if (this.state !== 'normal' || this.hasBall || this.z > 0) return false;
    this.state = 'jump';
    this.stateT = 0;
    this.vz = PLAYER.jumpSpeed * (0.75 + 0.25 * power);
    return true;
  }

  // Altura de la cabeza (lo más alto a lo que llega cabeceando).
  get headZ() { return this.z + PLAYER.height + 0.15; }

  dive(dirY, speed = 6) {
    if (this.state !== 'normal') return;
    this.state = 'dive';
    this.stateT = 0.6;
    this.vx = 0;
    this.vy = dirY * speed;
  }
}
