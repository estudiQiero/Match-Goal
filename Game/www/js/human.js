import { KICK, PITCH } from './config.js';
import { predictBall } from './team.js';

const CY = PITCH.width / 2;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Controla un equipo con un dispositivo de entrada (teclado, mando o táctil).
export class Human {
  constructor(team, input, id) {
    this.team = team;
    this.input = input;
    this.id = id;               // 1 o 2, para el indicador de color
    this.player = null;
    this.prev = { a: false, b: false };
    this.charge = null;         // { type, t }
    this.switchT = 0;
  }

  get meter() {
    if (!this.charge) return null;
    // El medidor sube y baja mientras mantienes el botón.
    const c = (this.charge.t / KICK.chargeTime) % 2;
    return c <= 1 ? c : 2 - c;
  }

  setPlayer(p) {
    if (p === this.player) return;
    if (this.player) { this.player.human = null; this.player.mx = this.player.my = 0; }
    this.player = p;
    if (p) p.human = this;
    this.charge = null;
  }

  update(match, dt) {
    const ball = match.ball;
    const team = this.team;
    const inp = this.input.poll();
    const aDown = inp.a && !this.prev.a, bDown = inp.b && !this.prev.b;
    const aUp = !inp.a && this.prev.a, bUp = !inp.b && this.prev.b;
    this.prev = { a: inp.a, b: inp.b };
    this.switchT = Math.max(0, this.switchT - dt);

    // ¿A quién manejo?
    const owner = ball.owner;
    if (owner && owner.team === team && !owner.isGK) {
      this.setPlayer(owner);
    } else if (!this.player || this.player.isGK) {
      this.setPlayer(team.nearestTo(ball.x, ball.y, p => !p.isGK));
    } else if (this.switchT <= 0 && !(owner && owner.team === team)) {
      const pred = predictBall(ball, 0.5);
      const near = team.nearestTo(pred.x, pred.y, p => !p.isGK && p.state === 'normal');
      const cur = this.player;
      if (near && near !== cur &&
          dist(cur.x, cur.y, pred.x, pred.y) - dist(near.x, near.y, pred.x, pred.y) > 4) {
        this.setPlayer(near);
        this.switchT = 0.6;
      }
    }

    const p = this.player;
    if (!p) return;
    if (match.state === 'kickoff' && match.restartTaker !== p) { p.mx = p.my = 0; }
    else { p.mx = inp.x; p.my = inp.y; }

    // En el saque de centro solo puede jugar quien saca, y solo después del silbato.
    const canAct = match.state === 'play' ||
      (match.restartTaker === p && (match.state === 'kickoff' ? match.whistled : match.restartWait < 0.6));

    if (p.hasBall) {
      if (!canAct) return;
      if (aDown) this.charge = { type: 'ground', t: 0 };
      if (bDown) this.charge = { type: 'loft', t: 0 };
      if (this.charge) {
        this.charge.t += dt;
        const released = this.charge.type === 'ground' ? aUp : bUp;
        if (released) this.release(match, inp);
      }
      return;
    }

    this.charge = null;
    if (match.state !== 'play') return;

    const d = dist(p.x, p.y, ball.x, ball.y);
    const aerial = !ball.owner && d < 1.3 && ball.z > 0.3 && ball.z < 2.8 && p.kickCD <= 0;

    if (aDown) {
      if (aerial) this.strikeAerial(match, inp, 1);
      else p.slide();
    } else if (bDown) {
      if (aerial) this.strikeAerial(match, inp, 0.7);
      else {
        const near = team.nearestTo(ball.x, ball.y, q => !q.isGK && q !== p);
        if (near) { this.setPlayer(near); this.switchT = 1.0; }
      }
    }
  }

  aimDir(inp) {
    const p = this.player;
    const l = Math.hypot(inp.x, inp.y);
    if (l > 0.3) return { x: inp.x / l, y: inp.y / l };
    return { x: p.fx, y: p.fy };
  }

  release(match, inp) {
    const ball = match.ball;
    const p = this.player;
    const power = Math.max(0.05, this.meter);
    const type = this.charge.type;
    this.charge = null;
    const dir = this.aimDir(inp);
    const team = this.team;

    // ¿Apunta a portería? Entonces es un chut, sin ayuda.
    const gx = team.oppGoalX;
    const toGoalX = gx - p.x, toGoalY = CY - p.y;
    const dGoal = Math.hypot(toGoalX, toGoalY);
    const cosGoal = (dir.x * toGoalX + dir.y * toGoalY) / (dGoal || 1);
    const shooting = dGoal < 32 && cosGoal > 0.85;

    if (!shooting && !(type === 'ground' && power > 0.65)) {
      // Ayuda al pase: busca un compañero en la dirección apuntada.
      const cone = type === 'ground' ? 0.93 : 0.88;
      let best = null, bestScore = -Infinity;
      for (const t of team.players) {
        if (t === p || t.state !== 'normal') continue;
        const tx = t.x + t.vx * 0.6 - p.x, ty = t.y + t.vy * 0.6 - p.y;
        const td = Math.hypot(tx, ty);
        if (td < 4 || td > (type === 'ground' ? 40 : 55)) continue;
        const c = (tx * dir.x + ty * dir.y) / td;
        if (c < cone) continue;
        const score = c * 2 - td / 40;
        if (score > bestScore) { bestScore = score; best = { x: p.x + tx, y: p.y + ty }; }
      }
      if (best) {
        p.passTo(ball, best.x, best.y, type === 'loft');
        match.onKick(p, type);
        return;
      }
    }
    // Efecto: la dirección perpendicular que pulses al soltar curva el balón.
    const spin = shooting ? (inp.y * team.dir) * -3 * Math.abs(dir.x) : 0;
    p.kick(ball, dir.x, dir.y, power, type, spin);
    match.onKick(p, shooting ? 'shot' : type);
  }

  strikeAerial(match, inp, power) {
    const ball = match.ball;
    const p = this.player;
    let dir = this.aimDir(inp);
    const team = this.team;
    if (Math.hypot(inp.x, inp.y) < 0.3 && team.progress(p.x) > 0.7) {
      dir = { x: team.oppGoalX - p.x, y: CY - p.y };
    }
    p.kick(ball, dir.x, dir.y, power, ball.z > 1.3 ? 'header' : 'volley');
    match.onKick(p, 'shot');
  }
}
