import { KICK, PITCH, PLAYER } from './config.js';
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
    this.prev = { a: false, b: false, sw: false };
    this.press = null;          // botón de golpeo: { type, phase: 'press'|'manual', t, auto }
    this.queued = null;         // golpeo decidido esperando a tener el balón al alcance: { type, power, t }
    this.autoT = Math.random(); // reloj del medidor automático
    this.switchT = 0;
  }

  // Medidor automático: de flojo a fuerte en autoUp s y de vuelta en autoDown s, sin parar.
  get autoMeter() {
    const up = KICK.autoUp, down = KICK.autoDown, t = this.autoT % (up + down);
    return t < up ? t / up : 1 - (t - up) / down;
  }

  // Medidor manual (manteniendo el botón): sube en manualUp s y, si te pasas, baja igual de lento.
  manualMeter(t) {
    const u = t / KICK.manualUp;
    return u <= 1 ? u : 2 - u;
  }

  // Lo que muestra el medidor encima del jugador: { value 0..1, manual }.
  get meter() {
    const k = this.press;
    if (k && k.phase === 'manual') return { value: Math.max(0, this.manualMeter(k.t)), manual: true, type: k.type };
    return { value: this.autoMeter, manual: false, type: k?.type || null };
  }

  setPlayer(p) {
    if (p === this.player) return;
    if (this.player) { this.player.human = null; this.player.mx = this.player.my = 0; }
    this.player = p;
    if (p) p.human = this;
    this.press = null;
    this.queued = null;
  }

  update(match, dt) {
    const ball = match.ball;
    const team = this.team;
    const inp = this.input.poll();
    const aDown = inp.a && !this.prev.a, bDown = inp.b && !this.prev.b;
    const aUp = !inp.a && this.prev.a, bUp = !inp.b && this.prev.b;
    const swDown = inp.sw && !this.prev.sw;
    this.prev = { a: inp.a, b: inp.b, sw: !!inp.sw };
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

    this.autoT += dt;

    if (p.hasBall) {
      if (!canAct) { this.press = null; this.queued = null; return; }
      this.kickInput(match, inp, dt, { aDown, bDown, aUp, bUp });
      return;
    }

    this.press = null;
    this.queued = null;
    if (match.state !== 'play') { this.pendingAerial = null; return; }

    // Cambiar de jugador: al más cercano al balón (que no sea el portero ni el que ya llevas).
    if (swDown) {
      const near = team.nearestTo(ball.x, ball.y, q => !q.isGK && q !== p);
      if (near) { this.setPlayer(near); this.switchT = 1.0; }
      return;
    }

    const d = dist(p.x, p.y, ball.x, ball.y);
    // Balón a su alcance ahora mismo (de pie o en el aire): volea o cabezazo.
    const rel = ball.z - p.z;
    const aerial = !ball.owner && d < 1.3 && rel > 0.3 && ball.z < p.headZ && p.kickCD <= 0;
    // Balón que viene por encima de la cabeza: hay que saltar.
    const high = !ball.owner && d < 4 && ball.z >= p.headZ - 0.1 && ball.z < p.headZ + 2.5;

    // En el aire: cabecea en cuanto la pelota llega a la cabeza.
    if (p.state === 'jump') {
      if (this.pendingAerial && aerial) { this.strikeAerial(match, inp, this.pendingAerial); this.pendingAerial = null; }
      return;
    }
    this.pendingAerial = null;

    if (aDown) {
      if (aerial) this.strikeAerial(match, inp, 1);
      else if (high && p.jump(1)) this.pendingAerial = 1;
      // Solo se tira si tiene un rival cerca disputando el balón; si no, no tiene sentido:
      // la pulsación se convierte en un pequeño acelerón.
      else if (this.rivalToTackle(match)) p.slide();
      else p.burst();
    } else if (bDown) {
      if (aerial) this.strikeAerial(match, inp, 0.7);
      else if (high && p.jump(1)) this.pendingAerial = 0.7;
    }
  }

  // ¿Hay un rival al que entrar? Cerca de ti y con el balón (o con el balón cerca de los dos).
  rivalToTackle(match) {
    const p = this.player, ball = match.ball;
    const dBall = Math.hypot(ball.x - p.x, ball.y - p.y);
    return this.team.opponent.players.some(o => {
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      return d < PLAYER.tackleRange && (ball.owner === o || (dBall < PLAYER.tackleRange && Math.hypot(ball.x - o.x, ball.y - o.y) < PLAYER.tackleRange));
    });
  }

  // Botones de golpeo con el balón:
  //  pulsación seca → al soltar, golpeo con la fuerza que marcaba el medidor automático al pulsar
  //  mantener       → el medidor lo cargas tú (de flojo a lleno en manualUp s); al soltar golpea y
  //                   el medidor vuelve a su bucle. Si te pasas, baja; al llegar a cero solo das un toque corto.
  kickInput(match, inp, dt, e) {
    const k = this.press;
    const up = { ground: e.aUp, loft: e.bUp };

    if (!k) {
      const type = e.aDown ? 'ground' : e.bDown ? 'loft' : null;
      if (type) this.press = { type, phase: 'press', t: 0, auto: this.autoMeter };
    } else if (k.phase === 'press') {
      k.t += dt;
      if (up[k.type]) { this.queue(k.type, k.auto); this.press = null; }   // pulsación seca
      else if (k.t >= KICK.holdTime) k.phase = 'manual';
    } else if (k.phase === 'manual') {
      k.t += dt;
      const v = this.manualMeter(k.t);
      if (v <= 0) {
        // Te has pasado y el medidor ha vuelto a cero: no hay golpeo, solo un toque cortito.
        this.queue('ground', KICK.touchPower);
        this.press = null;
      } else if (up[k.type]) {
        this.queue(k.type, v);
        this.press = null;
      }
    }

    // Golpea en cuanto tiene el balón a su alcance (va a toques: a veces está un poco lejos).
    const q = this.queued;
    if (q) {
      const p = this.player, ball = match.ball;
      if (Math.hypot(ball.x - p.x, ball.y - p.y) < PLAYER.kickReach && ball.z < 1) {
        this.queued = null;
        this.release(match, inp, q.type, q.power);
      } else if ((q.t += dt) > KICK.queueTime) this.queued = null;
    }
  }

  queue(type, power) { this.queued = { type, power: Math.max(0, Math.min(1, power)), t: 0 }; }

  aimDir(inp) {
    const p = this.player;
    const l = Math.hypot(inp.x, inp.y);
    if (l > 0.3) return { x: inp.x / l, y: inp.y / l };
    return { x: p.fx, y: p.fy };
  }

  release(match, inp, type, power) {
    const ball = match.ball;
    const p = this.player;
    let dir = this.aimDir(inp);
    const team = this.team;

    // ¿Apunta a portería? Entonces es un chut, sin ayuda.
    const gx = team.oppGoalX;
    const toGoalX = gx - p.x, toGoalY = CY - p.y;
    const dGoal = Math.hypot(toGoalX, toGoalY);
    const cosGoal = (dir.x * toGoalX + dir.y * toGoalY) / (dGoal || 1);
    const shooting = dGoal < 32 && cosGoal > 0.85 && power > 0.3;

    if (!shooting && power > KICK.assistMin) {
      // Ayuda al pase: si hay un compañero en la dirección apuntada, el balón va hacia él.
      // La fuerza es la del medidor: si te quedas corto o te pasas, es cosa tuya.
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
        if (score > bestScore) { bestScore = score; best = { x: tx / td, y: ty / td }; }
      }
      if (best) dir = best;
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
    p.kick(ball, dir.x, dir.y, power, ball.z - p.z > 1.3 ? 'header' : 'volley');
    match.onKick(p, 'shot');
  }
}
