import { PITCH, PLAYER, BALL } from './config.js';
import { Ball } from './ball.js';
import { Team } from './team.js';
import { sfx } from './sound.js';
import { Referee } from './referee.js';

const L = PITCH.length, W = PITCH.width, CY = W / 2;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Mapa de pisadas: celdas de WEAR_CELL m desde (-WEAR_PAD, -WEAR_PAD).
export const WEAR_CELL = 0.5, WEAR_PAD = 2;
export const WEAR_W = Math.ceil((L + 2 * WEAR_PAD) / WEAR_CELL), WEAR_H = Math.ceil((W + 2 * WEAR_PAD) / WEAR_CELL);
// Cuánto desgasta pisar: escalado por la duración de la parte para que un partido
// largo o corto acabe igual de gastado.
const WEAR_RATE = 0.15;

export class Match {
  constructor(opts) {
    this.opts = opts;
    this.ball = new Ball();
    this.home = new Team(opts.home, 1);
    this.away = new Team(opts.away, -1);
    this.home.opponent = this.away;
    this.away.opponent = this.home;
    this.teams = [this.home, this.away];
    this.referee = new Referee();
    // Desgaste del césped y la cal: celdas de medio metro (con margen fuera del campo).
    // Empieza a cero y crece donde los jugadores pisan corriendo.
    this.wear = new Float32Array(WEAR_W * WEAR_H);
    this.humans = [];
    this.halfDuration = opts.halfMinutes * 60;
    this.half = 1;
    this.clock = 0;
    this.time = 0;
    this.state = 'kickoff';
    this.stateT = 0;
    this.restartWait = 0;
    this.restartTaker = null;
    this.message = '';
    this.messageT = 0;
    this.stats = { shots: [0, 0], possession: [0, 0] };
    this.events = [];
    this.setupKickoff(this.home);
  }

  get players() { return [...this.home.players, ...this.away.players]; }

  addHuman(h) { this.humans.push(h); }

  // Minuto de partido (0-90).
  get minute() {
    const m = Math.min(45, (this.clock / this.halfDuration) * 45);
    return Math.floor(m + (this.half - 1) * 45);
  }

  show(text, t = 1.5) { this.message = text; this.messageT = t; }

  // ---------- Saques ----------

  setupKickoff(team) {
    const ball = this.ball;
    ball.reset(L / 2, CY);
    this.referee.place(...this.referee.target(ball));
    for (const t of this.teams) {
      for (const p of t.players) {
        const h = t.homePos(p, ball, t === team, true);
        if (p.isGK) { h.x = t.ownGoalX + t.dir * 1.5; h.y = CY; }
        // Fuera del círculo central.
        const dc = dist(h.x, h.y, L / 2, CY);
        if (dc < PITCH.centerRadius + 0.5) {
          h.x = L / 2 - t.dir * (PITCH.centerRadius + 0.5);
        }
        p.place(h.x, h.y);
        p.fx = t.dir; p.fy = 0;
        p.hasBall = false; p.mustPass = false;
      }
    }
    const taker = team.players.filter(p => p.role === 'FW')[0] || team.players[10];
    taker.place(L / 2 - team.dir * 0.4, CY);
    const mate = team.players.filter(p => p.role === 'FW')[1] || team.players[9];
    if (mate && mate !== taker) mate.place(L / 2 - team.dir * 0.5, CY + 6);
    this.giveBall(taker, true);
    // Todos quietos en su campo hasta el silbato; después solo actúa quien saca,
    // y el juego no empieza para los demás hasta que él toca el balón.
    this.state = 'kickoff';
    this.restartWait = 1.6;            // tiempo hasta el silbato
    this.whistled = false;
    this.kickDelay = 0.3 + Math.random() * 0.5;   // reacción de quien saca tras el silbato (IA)
    this.restartTaker = taker;
    this.show('Saque inicial', 1.2);
  }

  setupRestart(kind, team, x, y) {
    const ball = this.ball;
    ball.reset(x, y);
    let taker;
    if (kind === 'goalkick') taker = team.gk;
    else taker = team.nearestTo(x, y, p => !p.isGK);
    taker.place(x - (kind === 'throw' ? 0 : 0), y);
    // Mira hacia dentro del campo.
    taker.faceTo(kind === 'corner' ? team.oppGoalX - team.dir * 11 : L / 2, CY);
    this.giveBall(taker, true);
    // Los rivales se apartan.
    for (const o of team.opponent.players) {
      const d = dist(o.x, o.y, x, y);
      if (d < 6 && !o.isGK) {
        const k = 6 / (d || 1);
        o.place(x + (o.x - x) * k, y + (o.y - y) * k + (d === 0 ? 6 : 0));
      }
    }
    this.state = 'restart';
    this.restartWait = 1.0;
    this.restartTaker = taker;
    const names = { throw: 'Saque de banda', corner: 'Córner', goalkick: 'Saque de puerta' };
    this.show(names[kind], 1.0);
    sfx.whistle(0.15);
  }

  giveBall(p, mustPass = false) {
    const ball = this.ball;
    if (ball.owner) ball.owner.hasBall = false;
    ball.owner = p;
    ball.lastTouch = p;
    p.hasBall = true;
    p.mustPass = mustPass;
    p.stealCD = 0.4;
    p.holdT = 0;
    p.thinkT = 0.35 + Math.random() * 0.45;
    ball.vx = ball.vy = ball.vz = 0;
  }

  onKick(p, type) {
    if (type === 'shot') this.stats.shots[p.team === this.home ? 0 : 1]++;
    sfx.kick(type === 'shot' ? 1 : type === 'loft' ? 0.8 : 0.55);
  }

  // ---------- Bucle principal ----------

  update(dt) {
    if (!(dt > 0)) return;            // un paso nulo o negativo rompe la física (NaN)
    this.time += dt;
    this.messageT = Math.max(0, this.messageT - dt);

    if (this.state === 'goal' || this.state === 'half' || this.state === 'end') {
      this.stateT -= dt;
      // Los jugadores siguen moviéndose un poco (celebración / vuelta).
      for (const p of this.players) { p.mx *= 0.9; p.my *= 0.9; p.update(dt); }
      this.referee.update(dt, this.ball);
      this.ball.update(dt);
      if (this.stateT <= 0) this.afterPause();
      return;
    }

    if (this.state === 'kickoff') {
      this.restartWait -= dt;
      if (!this.whistled && this.restartWait <= 0) { this.whistled = true; sfx.whistle(0.4); }
      // Empieza el juego cuando quien saca suelta el balón.
      if (this.whistled && this.ball.owner !== this.restartTaker) {
        this.state = 'play';
        this.restartTaker = null;
      }
    } else if (this.state === 'restart') {
      this.restartWait -= dt;
      if (this.restartWait <= 0) {
        this.state = 'play';
        this.restartTaker = null;
      }
    }

    for (const h of this.humans) h.update(this, dt);
    for (const t of this.teams) t.updateAI(this, dt);
    for (const p of this.players) p.update(dt);
    this.referee.update(dt, this.ball);

    this.dribble(dt);
    const ev = this.ball.update(dt);

    if (this.state === 'play') {
      this.clock += dt;
      this.trample(dt);
      const owner = this.ball.owner || this.ball.lastTouch;
      if (owner) this.stats.possession[owner.team === this.home ? 0 : 1] += dt;
      this.contacts(dt);
      if (this.ball.onPost) { sfx.post(); this.ball.onPost = false; }
      if (ev) this.handleEvent(ev);
      else if (this.clock >= this.halfDuration) this.endHalf();
    }
  }

  // Cada jugador que corre gasta un poco la celda que pisa (y menos las de al lado).
  trample(dt) {
    const k = dt * WEAR_RATE * 60 / this.halfDuration;
    for (const p of [...this.players, this.referee]) {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp < 1) continue;
      const cx = Math.floor((p.x + WEAR_PAD) / WEAR_CELL), cy = Math.floor((p.y + WEAR_PAD) / WEAR_CELL);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= WEAR_W || y >= WEAR_H) continue;
        const i = y * WEAR_W + x;
        this.wear[i] = Math.min(1, this.wear[i] + k * sp * (dx || dy ? 0.35 : 1));
      }
    }
  }

  dribble(dt) {
    const ball = this.ball;
    const p = ball.owner;
    if (!p) return;
    if (p.state !== 'normal' && p.state !== 'dive' && p.state !== 'jump') { ball.owner = null; p.hasBall = false; return; }
    const off = p.isGK ? 0.35 : 0.55;
    const tx = p.x + p.fx * off, ty = p.y + p.fy * off;
    const k = Math.min(1, dt * 16);
    ball.x += (tx - ball.x) * k;
    ball.y += (ty - ball.y) * k;
    ball.z = p.isGK && !p.mustPass ? 1.1 + p.z : 0;
    ball.vx = p.vx; ball.vy = p.vy; ball.vz = 0;
    ball.spin = 0;
  }

  contacts(dt) {
    const ball = this.ball;
    const owner = ball.owner;
    const players = this.players;

    // Robos al poseedor.
    if (owner && owner.stealCD <= 0 && !(owner.isGK && !owner.mustPass)) {
      for (const o of owner.team.opponent.players) {
        if (o.state !== 'normal' || o.kickCD > 0) continue;
        if (dist(o.x, o.y, ball.x, ball.y) < 0.8) {
          const rate = (o.human ? 2.6 : 1.5) * o.skill;
          if (Math.random() < rate * dt) {
            owner.kickCD = 0.4;
            this.giveBall(o);
            o.stealCD = 0.6;
            sfx.kick(0.3);
            break;
          }
        }
      }
    }

    // Entradas en plancha.
    for (const p of players) {
      if (p.state !== 'slide' || p.slideHit) continue;
      if (dist(p.x, p.y, ball.x, ball.y) < 1.1 && ball.z < 0.6 && ball.owner !== p) {
        if (ball.owner) ball.owner.fall(0.7);
        ball.owner = null;
        const sp = Math.hypot(p.vx, p.vy);
        ball.kick(p.fx * (6 + sp * 0.6), p.fy * (6 + sp * 0.6) + (Math.random() - 0.5) * 3, 0.5);
        ball.lastTouch = p;
        p.slideHit = true;
        p.kickCD = 0.2;
        sfx.kick(0.5);
      } else {
        for (const o of p.team.opponent.players) {
          if (o.state === 'normal' && !(o.isGK && o === ball.owner) && dist(p.x, p.y, o.x, o.y) < 0.8) {
            o.fall();
            p.slideHit = true;
            if (o === ball.owner) { ball.owner = null; o.hasBall = false; }
          }
        }
      }
    }
    for (const p of players) if (p.state !== 'slide') p.slideHit = false;

    if (ball.owner || ball.inNet) return;

    this.aiJumps();

    // Balón suelto: control, despeje, rebote o parada.
    let best = null, bestD = Infinity;
    for (const p of players) {
      if (p.kickCD > 0) continue;
      const d = dist(p.x, p.y, ball.x, ball.y);
      const gkHands = p.isGK && this.inOwnBox(p);
      const reach = gkHands ? (p.state === 'dive' ? 1.8 : 1.1) : PLAYER.controlDist;
      // El portero llega con las manos más arriba si salta.
      const maxZ = gkHands ? 2.7 + p.z : 0.6;
      if (p.state === 'fallen' || (p.state === 'slide')) continue;
      const rel = ball.z - p.z;            // altura del balón respecto a los pies
      const airborne = p.state === 'jump';
      // En el aire, un jugador de campo no puede controlar un balón con el pie.
      if (d < reach && ball.z < maxZ && d < bestD && (!airborne || gkHands)) { best = p; bestD = d; }

      // Cabezazos y voleas automáticos de la IA (también saltando).
      if (!p.human && !p.isGK && (p.state === 'normal' || airborne) &&
          d < PLAYER.headReach && rel >= 0.6 && ball.z < p.headZ) {
        this.aiAerial(p);
        return;
      }
      // Rebote en el cuerpo.
      if (d < PLAYER.radius + BALL.radius && rel > -0.1 && rel < PLAYER.height && !gkHands) {
        const nx = (ball.x - p.x) / (d || 1), ny = (ball.y - p.y) / (d || 1);
        const rvx = ball.vx - p.vx, rvy = ball.vy - p.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0 && Math.hypot(rvx, rvy) > PLAYER.controlMaxSpeed) {
          ball.vx -= 1.35 * vn * nx; ball.vy -= 1.35 * vn * ny;
          ball.vz += Math.random() * 2;
          ball.lastTouch = p;
          p.kickCD = 0.25;
          sfx.kick(0.4);
          return;
        }
      }
    }
    if (!best) return;

    const rel = Math.hypot(ball.vx - best.vx, ball.vy - best.vy) + Math.abs(ball.vz) * 0.5;
    if (best.isGK && this.inOwnBox(best)) {
      // Una sola oportunidad por golpeo: si está estirado y el tiro es fuerte, puede no llegar.
      if (best.triedKick === ball.kickId) {
        // Ya falló la estirada: solo puede recogerla si va lenta.
        if (rel < 9) { this.giveBall(best); sfx.catch(); }
        return;
      }
      best.triedKick = ball.kickId;
      const reach = best.state === 'dive' ? 1.8 : 1.1;
      const stretch = bestD / reach;
      const reachChance = 1 - Math.max(0, stretch - 0.55) * 1.2 * Math.min(1, rel / 22);
      if (Math.random() > reachChance * best.skill) return;
      const lastOwn = ball.lastTouch && ball.lastTouch.team === best.team && ball.lastTouch !== best;
      const catchChance = rel < 14 ? 0.97 : rel < 22 ? 0.7 : 0.4;
      if (Math.random() < catchChance * best.skill || rel < 8) {
        if (lastOwn && rel > 3) {
          // Cesión de un compañero: la controla con el pie.
          this.giveBall(best);
        } else {
          this.giveBall(best);
          best.holdT = 0;
          if (rel > 14) this.show('¡Paradón!', 1);
        }
        sfx.catch();
      } else {
        // Despeje de puños.
        ball.vx = -ball.vx * 0.35 + best.team.dir * 3;
        ball.vy = ball.vy * 0.4 + (Math.random() - 0.5) * 10;
        ball.vz = 2 + Math.random() * 4;
        ball.lastTouch = best;
        best.kickCD = 0.4;
        sfx.kick(0.6);
      }
      return;
    }
    if (rel < PLAYER.controlMaxSpeed) {
      this.giveBall(best);
      best.stealCD = 0.25;
    }
  }

  // La IA salta si el balón le va a pasar por encima de la cabeza pero a su alcance saltando.
  // Calcula dónde estará el balón cuando le llegue y salta con el tiempo justo.
  aiJumps() {
    const ball = this.ball;
    const standHead = PLAYER.height + 0.15;
    for (const p of this.players) {
      if (p.human || p.state !== 'normal' || p.z > 0) continue;
      if (p.isGK && !this.inOwnBox(p)) continue;
      const dx = p.x - ball.x, dy = p.y - ball.y;
      const d = Math.hypot(dx, dy);
      if (d > 3) continue;
      // Velocidad del balón hacia el jugador y tiempo hasta que llegue.
      const vTo = (ball.vx * dx + ball.vy * dy) / (d || 1);
      const t = d < 0.6 ? 0 : d / Math.max(vTo, 0.5);
      if (t > 0.4) continue;
      const zAt = ball.z + ball.vz * t - 4.905 * t * t;
      const reachTop = p.isGK ? 2.7 + 0.8 : standHead + 0.8;
      const reachLow = p.isGK ? 2.5 : standHead - 0.1;
      if (zAt > reachLow && zAt < reachTop && Math.random() < 0.85 * p.skill) p.jump(1);
    }
  }

  aiAerial(p) {
    const ball = this.ball;
    const t = p.team;
    const attacking = t.progress(p.x) > 0.7;
    let dx, dy;
    if (attacking) { dx = t.oppGoalX - p.x; dy = CY + (Math.random() - 0.5) * 6 - p.y; }
    else { dx = t.dir * 10; dy = (p.y < CY ? -1 : 1) * 4 + (Math.random() - 0.5) * 8; }
    const type = ball.z - p.z > 1.3 ? 'header' : 'volley';
    p.kick(ball, dx, dy, attacking ? 0.85 : 0.7, type);
    this.onKick(p, attacking ? 'shot' : 'ground');
  }

  inOwnBox(p) {
    const t = p.team;
    return t.progress(p.x) < (PITCH.boxDepth + 0.5) / L &&
      Math.abs(p.y - CY) < PITCH.boxWidth / 2 + 0.5;
  }

  handleEvent(ev) {
    const ball = this.ball;
    const last = ball.lastTouch?.team || this.home;
    if (ev.type === 'goal') {
      const scorer = ev.side === 'left'
        ? (this.home.dir < 0 ? this.home : this.away)
        : (this.home.dir > 0 ? this.home : this.away);
      scorer.score++;
      this.state = 'goal';
      this.stateT = 3;
      this.lastScorer = scorer;
      this.show('¡GOOOL!', 3);
      sfx.goal();
      for (const p of this.players) p.hasBall = false;
      ball.owner = null;
      return;
    }
    if (ev.type === 'throw') {
      const team = last.opponent;
      const x = Math.max(1, Math.min(L - 1, ball.x));
      const y = ball.y < CY ? 0 : W;
      this.setupRestart('throw', team, x, y);
      return;
    }
    // Línea de fondo.
    const gx = ev.side === 'left' ? 0 : L;
    const defending = this.teams.find(t => t.ownGoalX === gx);
    if (last === defending) {
      const att = defending.opponent;
      this.setupRestart('corner', att, gx === 0 ? 0.5 : L - 0.5, ball.y < CY ? 0.5 : W - 0.5);
    } else {
      this.setupRestart('goalkick', defending, gx + defending.dir * 5.5, CY + (ball.y < CY ? -4 : 4));
    }
  }

  endHalf() {
    sfx.whistle(1.2);
    if (this.half === 1) {
      this.state = 'half';
      this.stateT = 3;
      this.show('Descanso', 3);
    } else {
      this.state = 'end';
      this.stateT = 9999;
      this.show('Final del partido', 9999);
    }
  }

  afterPause() {
    if (this.state === 'goal') {
      this.setupKickoff(this.lastScorer.opponent);
    } else if (this.state === 'half') {
      this.half = 2;
      this.clock = 0;
      for (const t of this.teams) t.dir *= -1;
      this.setupKickoff(this.away);
    }
  }
}
