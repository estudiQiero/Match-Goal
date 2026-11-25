import { PITCH, PLAYER } from './config.js';
import { FORMATIONS, MENTALITIES, PASSING } from './tactics.js';
import { Player } from './player.js';

const L = PITCH.length, W = PITCH.width, CY = W / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export class Team {
  constructor(cfg, dir) {
    this.name = cfg.name;
    this.color = cfg.color;
    this.gkColor = cfg.gkColor || '#3c3c3c';
    this.formation = cfg.formation || '4-4-2';
    this.mentality = cfg.mentality || 'equilibrada';
    this.passing = cfg.passing || 'mixto';
    this.dir = dir;           // +1 ataca hacia x = PITCH.length, -1 hacia x = 0
    this.score = 0;
    this.skill = cfg.skill ?? 1;
    this.cpu = cfg.cpu ?? true;
    this.players = FORMATIONS[this.formation].map((s, i) => new Player(this, i, s));
    this.players.forEach(p => (p.skill = this.cpu ? this.skill : 1));
    this.opponent = null;
    this.thinkT = 0;
  }

  setFormation(name) {
    this.formation = name;
    // Por el número de cada jugador (en el entrenamiento no están todos).
    for (const p of this.players) { const s = FORMATIONS[name][p.index]; p.slot = s; p.role = s.role; }
  }

  get ownGoalX() { return this.dir > 0 ? 0 : L; }
  get oppGoalX() { return this.dir > 0 ? L : 0; }
  get gk() { return this.players[0]; }
  get tactic() { return MENTALITIES[this.mentality]; }
  get passStyle() { return PASSING[this.passing]; }

  // Progreso de una x en el sentido de ataque (0 = propia portería, 1 = rival).
  progress(x) { return this.dir > 0 ? x / L : 1 - x / L; }
  xFromProgress(d) { return this.dir > 0 ? d * L : L - d * L; }
  yFromWidth(w) { return this.dir > 0 ? (1 - w) * W : w * W; }

  // Posición en la formación según dónde esté el balón.
  homePos(p, ball, inPossession, kickoff = false) {
    const s = p.slot;
    if (kickoff) {
      const d = Math.min(0.46, 0.04 + s.d * 0.5);
      return { x: this.xFromProgress(d), y: this.yFromWidth(s.w) };
    }
    // La forma del equipo sigue la ZONA del balón (con algo de retraso), no cada pase:
    // así nadie corre de un lado a otro con cada balón largo.
    const zone = this.zone || ball;
    const pb = this.progress(zone.x), pbReal = this.progress(ball.x), push = this.tactic.push;
    // Cada línea sigue al balón a su manera: la defensa se mueve poco, el medio campo más.
    const shift = p.role === 'DF' ? 0.3 : p.role === 'FW' ? 0.4 : 0.45;
    let d = 0.05 + s.d * 0.5 + 0.225 + (pb - 0.5) * shift + push + (inPossession ? 0.05 : -0.03);
    // Atacando, la defensa se queda en su campo.
    if (inPossession && p.role === 'DF') d = Math.min(d, 0.47 + push);
    // Defendiendo, nadie se queda por delante del balón: la línea se repliega por detrás de él…
    if (!inPossession) d = Math.min(d, pbReal - (2 + s.d * 6) / L);
    // …salvo los delanteros, que esperan cerca del medio campo para salir a la contra.
    if (!inPossession && p.role === 'FW') d = Math.max(d, 0.4 + push * 0.5);
    d = clamp(d, 0.05, 0.93);
    const spread = inPossession ? 1.05 : 0.8;
    let y = this.yFromWidth(0.5 + (s.w - 0.5) * spread);
    y += (zone.y - y) * (inPossession ? 0.15 : 0.3);
    return { x: this.xFromProgress(d), y: clamp(y, 2, W - 2) };
  }

  nearestTo(x, y, filter = () => true) {
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (!filter(p)) continue;
      const d = dist(p.x, p.y, x, y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ---------- IA ----------

  updateAI(match, dt) {
    const ball = match.ball;
    const owner = ball.owner;
    const inPossession = owner ? owner.team === this : ball.lastTouch?.team === this;
    const restart = match.state !== 'play';
    // Zona del balón con retraso (~1 s); en los saques, al momento.
    if (!this.zone || restart) this.zone = { x: ball.x, y: ball.y };
    else { const k = Math.min(1, dt / 1.0); this.zone.x += (ball.x - this.zone.x) * k; this.zone.y += (ball.y - this.zone.y) * k; }

    // Quién va a por el balón.
    const pred = predictBall(ball, 0.35);
    const byDist = this.players
      .filter(p => !p.isGK && p.state === 'normal')
      .sort((a, b) => dist(a.x, a.y, pred.x, pred.y) - dist(b.x, b.y, pred.x, pred.y));
    const chasers = new Set();
    const keeperHolds = owner && owner.isGK && !owner.mustPass;
    // Cerca de la propia portería se defiende entre dos: uno al balón y otro tapando el tiro.
    const danger = owner && owner.team !== this && this.progress(ball.x) < 0.3;
    if (!restart && owner?.team !== this && !keeperHolds) {
      const n = owner ? (danger ? 2 : Math.min(this.tactic.press, 2)) : 1;
      // Con presión alta solo presiona el segundo si el balón está en campo rival.
      for (let i = 0; i < n && i < byDist.length; i++) {
        if (i > 0 && !danger && this.progress(ball.x) < 0.45 && this.tactic.press < 3) break;
        chasers.add(byDist[i]);
      }
    }
    const firstChaser = byDist.find(p => chasers.has(p));

    // Saque de centro: todos esperan quietos; tras el silbato, solo quien saca juega el balón.
    if (match.state === 'kickoff') {
      for (const p of this.players) {
        if (p.human) continue;
        if (match.whistled && p === match.restartTaker && owner === p && match.restartWait <= -match.kickDelay) this.carrierAI(match, p, dt);
        else { p.mx = p.my = 0; }
      }
      return;
    }

    for (const p of this.players) {
      if (p.human || p.state !== 'normal') continue;
      if (p === match.restartTaker || match.outActors?.has(p)) { p.mx = p.my = 0; continue; }
      if (p.isGK) { this.keeperAI(match, p, dt); continue; }
      if (owner === p) { this.carrierAI(match, p, dt); continue; }

      if (chasers.has(p)) {
        const t = owner ? 0.2 : clamp(dist(p.x, p.y, ball.x, ball.y) / 8, 0, 0.8);
        const target = predictBall(ball, t);
        const cover = p !== firstChaser;
        if (owner) {
          // Se coloca entre el poseedor y su portería; el segundo, más atrás, tapando el tiro.
          const gx = this.ownGoalX;
          const k = (cover ? 3.5 : 1.2) / (dist(owner.x, owner.y, gx, CY) || 1);
          target.x = owner.x + (gx - owner.x) * k;
          target.y = owner.y + (CY - owner.y) * k;
        }
        p.moveTo(target.x, target.y, 1, 0.1);
        // La IA entra al balón si lo tiene cerca (con más decisión cerca de su portería).
        if (owner && !cover && dist(p.x, p.y, ball.x, ball.y) < 2.2 && Math.random() < dt * (danger ? 1.8 : 0.8) * p.skill) {
          p.faceTo(ball.x, ball.y);
          p.slide();
        }
        continue;
      }

      const home = this.homePos(p, ball, inPossession);
      // Desmarques de los delanteros cuando tenemos el balón.
      if (inPossession && p.role === 'FW' && owner) {
        home.x += this.dir * 4 * Math.sin(match.time * 0.7 + p.index);
      }
      // Sin prisa, anda: corre solo si se ha quedado descolocado o la jugada está cerca.
      const dHome = dist(p.x, p.y, home.x, home.y), dBall = dist(p.x, p.y, ball.x, ball.y);
      let urgency = 0.3 + 0.55 * clamp((dHome - 4) / 6, 0, 1);
      // Cerca de la jugada se activa: trotando suave si su equipo tiene el balón (salvo delanteros).
      if (dBall < 12) urgency = Math.max(urgency, inPossession && p.role !== 'FW' ? 0.45 : 0.6);
      // Al perder el balón, quien está en campo rival por delante de él vuelve corriendo;
      // ya en su campo, anda o trota según dónde esté la jugada.
      const prog = this.progress(p.x);
      if (!inPossession && prog > 0.5 && prog > this.progress(ball.x)) { urgency = 0.95; p.resting = false; }
      // Lejos de la jugada se conforma con estar cerca de su sitio: si se ha parado,
      // no vuelve a moverse hasta que su sitio se le aleja bastante.
      if (p.resting && dBall > 18 && dHome < 5) { p.mx = p.my = 0; p.faceTo(ball.x, ball.y); continue; }
      p.resting = p.moveTo(home.x, home.y, urgency, dBall > 20 ? 3 : 1.5) < (dBall > 20 ? 3 : 1.5);
      if (Math.hypot(p.mx, p.my) < 0.05) p.faceTo(ball.x, ball.y);
    }
  }

  carrierAI(match, p, dt) {
    const ball = match.ball;
    p.thinkT = (p.thinkT || 0) - dt;
    const opp = this.opponent;
    const gx = this.oppGoalX;
    const dGoal = dist(p.x, p.y, gx, CY);
    const nearOpp = opp.nearestTo(p.x, p.y);
    const pressure = nearOpp ? dist(nearOpp.x, nearOpp.y, p.x, p.y) : 99;

    // El balón va a toques: si se le ha ido un poco, primero lo alcanza (sin decidir nada aún).
    const dBall = dist(p.x, p.y, ball.x, ball.y);
    if (!p.mustPass && dBall > PLAYER.kickReach) {
      const t = Math.min(0.4, dBall / 8);
      p.moveTo(ball.x + ball.vx * t, ball.y + ball.vy * t, 1, 0.05);
      return;
    }

    if (p.thinkT <= 0 || p.mustPass) {
      p.thinkT = 0.22 + (1 - p.skill) * 0.4 + Math.random() * 0.15;

      if (p.mustPass && match.restartWait > 0) return;

      // Chut.
      const angleOk = Math.abs(p.y - CY) < dGoal * 0.9;
      if (dGoal < 26 && angleOk && !p.mustPass) {
        const chance = dGoal < 14 ? 0.85 : dGoal < 20 ? 0.45 : 0.18;
        if (Math.random() < chance + (pressure < 2 ? 0.2 : 0)) return this.shoot(match, p);
      }

      // Pase.
      const pass = this.bestPass(match, p, pressure);
      if (pass && (p.mustPass || pressure < 3.5 || pass.score > 1.3 || Math.random() < 0.1)) {
        p.passTo(ball, pass.x, pass.y, pass.lofted);
        match.onKick(p, pass.lofted ? 'loft' : 'ground');
        return;
      }
      if (p.mustPass) {
        // Sin opciones claras: balón largo hacia delante.
        const tx = p.x + this.dir * 30, ty = CY + (Math.random() - 0.5) * 30;
        p.passTo(ball, clamp(tx, 5, L - 5), ty, true);
        match.onKick(p, 'loft');
        return;
      }
    }

    // Conducción: hacia la portería esquivando rivales.
    let dx = gx - p.x, dy = CY - p.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    for (const o of opp.players) {
      const ox = o.x - p.x, oy = o.y - p.y;
      const od = Math.hypot(ox, oy);
      if (od < 6 && od > 0.01 && ox * dx + oy * dy > -1) {
        const w = (6 - od) / 6 * 1.4;
        dx -= (ox / od) * w; dy -= (oy / od) * w;
      }
    }
    // Lejos de la portería, prefiere avanzar por su carril.
    if (dGoal > 35) dy *= 0.5;
    if (p.y < 3) dy = Math.abs(dy) + 0.5;
    if (p.y > W - 3) dy = -Math.abs(dy) - 0.5;
    const l = Math.hypot(dx, dy) || 1;
    p.mx = dx / l; p.my = dy / l;
  }

  shoot(match, p) {
    const ball = match.ball;
    const gx = this.oppGoalX;
    const keeper = this.opponent.gk;
    // Apunta al palo más alejado del portero, pero no siempre a la escuadra:
    // a veces el tiro va más centrado, y cuanto más lejos, más se desvía.
    const side = keeper.y > CY ? -1 : 1;
    const dShot = dist(p.x, p.y, gx, CY);
    const err = (1.4 - p.skill) * (Math.random() - 0.5) * 4 + (Math.random() - 0.5) * dShot * 0.12;
    const ty = CY + side * (PITCH.goalWidth / 2 - 0.6 - Math.random() * 2) + err;
    const dGoal = dist(p.x, p.y, gx, ty);
    const power = clamp(0.75 + dGoal / 60 + Math.random() * 0.1, 0.75, 1);
    p.kick(ball, gx - p.x, ty - p.y, power, 'ground', (Math.random() - 0.5) * 4);
    match.onKick(p, 'shot');
  }

  bestPass(match, p, pressure) {
    const opp = this.opponent;
    const style = this.passStyle;
    const myProg = this.progress(p.x);
    let best = null;
    for (const t of this.players) {
      if (t === p || t.state !== 'normal') continue;
      if (t.isGK && pressure > 2 && myProg > 0.2) continue;
      const lead = 0.6;
      const tx = clamp(t.x + t.vx * lead, 1, L - 1);
      const ty = clamp(t.y + t.vy * lead, 1, W - 1);
      const d = dist(p.x, p.y, tx, ty);
      if (d < 6 || d > style.maxDist) continue;

      let free = 99;
      for (const o of opp.players) free = Math.min(free, dist(o.x, o.y, tx, ty));
      if (free < 2) continue;

      const blocked = opp.players.some(o => segDist(o.x, o.y, p.x, p.y, tx, ty) < 1.6 &&
        dist(o.x, o.y, p.x, p.y) > 1);
      const lofted = blocked || d > 30;
      if (lofted && d < 14) continue;

      const gain = (this.progress(tx) - myProg) * L;
      let score = gain / 20 * (0.6 + this.tactic.risk) + Math.min(free, 8) / 8 - d / 60;
      score += style.longBias * d / 30;
      if (lofted) score -= 0.35;
      if (gain < -10) score -= 0.5;
      if (!best || score > best.score) best = { x: tx, y: ty, lofted, score, target: t };
    }
    return best;
  }

  keeperAI(match, k, dt) {
    const ball = match.ball;
    const gx = this.ownGoalX;
    const dir = this.dir;

    if (ball.owner === k) {
      // Saca de mano tras un momento.
      k.holdT = (k.holdT || 0) + dt;
      k.mx = k.my = 0;
      if (k.holdT > 1.2) {
        k.holdT = 0;
        const pass = this.bestPass(match, k, 99);
        if (pass && Math.random() < 0.6) {
          k.passTo(ball, pass.x, pass.y, pass.lofted);
        } else {
          k.passTo(ball, this.xFromProgress(0.6), CY + (Math.random() - 0.5) * 36, true);
        }
        ball.z = 1;
        match.onKick(k, 'loft');
      }
      return;
    }

    const bd = dist(ball.x, ball.y, gx, CY);
    let tx = gx + dir * clamp(1 + bd * 0.05, 1, 4.5);
    let ty = CY + clamp((ball.y - CY) * 0.45, -3.4, 3.4);

    // ¿Viene un tiro?
    // Tiempo de reacción: tarda un instante en leer el tiro.
    const towards = ball.vx * dir < -4 && ball.age > 0.12 / k.skill;
    if (towards && !ball.owner) {
      const t = (k.x - ball.x) / ball.vx;
      if (t > 0 && t < 1.6) {
        const py = ball.y + ball.vy * t;
        if (Math.abs(py - CY) < PITCH.goalWidth / 2 + 1.5) {
          ty = py;
          if (Math.abs(py - k.y) > 1.1 && t < 0.6 && k.state === 'normal') {
            k.dive(Math.sign(py - k.y), clamp(Math.abs(py - k.y) / Math.max(t, 0.15), 3, 9));
            return;
          }
        }
      }
    }

    // Balón suelto cerca: sale a por él.
    const inBox = this.progress(ball.x) < PITCH.boxDepth / L && Math.abs(ball.y - CY) < PITCH.boxWidth / 2;
    if (!ball.owner && inBox && ball.z < 2) {
      const myD = dist(k.x, k.y, ball.x, ball.y);
      const oppN = this.opponent.nearestTo(ball.x, ball.y);
      const oppD = oppN ? dist(oppN.x, oppN.y, ball.x, ball.y) : 99;
      // Solo sale si llega claramente antes que el rival.
      if (myD < oppD - 1.5 && myD < 10) { tx = ball.x; ty = ball.y; }
    }
    k.moveTo(tx, ty, 1, 0.15);
    if (Math.hypot(k.mx, k.my) < 0.05) k.faceTo(ball.x, ball.y);
  }
}

export function predictBall(ball, t) {
  if (ball.owner) return { x: ball.x + ball.owner.vx * t, y: ball.y + ball.owner.vy * t };
  return { x: ball.x + ball.vx * t * 0.85, y: ball.y + ball.vy * t * 0.85 };
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
