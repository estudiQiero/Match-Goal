import { KICK, PITCH, PLAYER, SHOT, BALL, THROW, OUT } from './config.js';
import { predictBall } from './team.js';
import { Ball } from './ball.js';

const SIM_BALL = new Ball();   // balón de prueba para calcular trayectorias

// Quita de una trayectoria lo que queda detrás del jugador (medido sobre el suelo, en la dirección
// de la línea) y la hace empezar justo delante de sus pies. null si ya no queda nada delante.
function clipBehind(pts, p) {
  if (!p || pts.length < 2) return pts;
  const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 0.01) return pts;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  const start = (p.x - x0) * ux + (p.y - y0) * uy + 0.45;     // delante del pie
  const along = q => (q[0] - x0) * ux + (q[1] - y0) * uy;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = along(pts[i]);
    if (a < start) continue;
    if (!out.length && i > 0) {
      // Punto de corte, entre el anterior (detrás) y este (delante).
      const a0 = along(pts[i - 1]), t = (start - a0) / ((a - a0) || 1);
      out.push(pts[i - 1].map((v, k) => v + (pts[i][k] - v) * t));
    }
    out.push(pts[i]);
  }
  return out.length >= 2 ? out : null;
}

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

  // Medidor manual (manteniendo el botón). u es el avance: de 0 a 1 sube, de 1 a 2 baja (te has pasado).
  manualMeter(u) { return u <= 1 ? u : 2 - u; }

  // Lo que tarda en llenarse el medidor manual. Lejos de la portería, manualUp (2 s); en posición de
  // chut, mucho menos, y cuanto más cerca, más rápido: delante del portero no hay tiempo.
  fillTime() {
    if (!this.canShoot) return KICK.manualUp;
    const p = this.player, d = Math.hypot(this.team.oppGoalX - p.x, CY - p.y);
    const f = Math.max(0, Math.min(1, (d - SHOT.fillNearDist) / (SHOT.range - SHOT.fillNearDist)));
    return SHOT.fillNear + (SHOT.fillFar - SHOT.fillNear) * f;
  }

  // Lo que muestra el medidor encima del jugador: { value 0..1, manual }.
  get meter() {
    const k = this.press;
    if (k && k.phase === 'manual') return { value: Math.max(0, this.manualMeter(k.u)), manual: true, type: k.type };
    return { value: this.autoMeter, manual: false, type: k?.type || null };
  }

  setPlayer(p) {
    if (p === this.player) return;
    if (this.player) { this.player.human = null; this.player.mx = this.player.my = 0; this.player.sprinting = false; }
    this.sprint = false;
    this.player = p;
    if (p) p.human = this;
    this.press = null;
    this.queued = null;
  }

  update(match, dt) {
    const ball = match.ball;
    const team = this.team;
    const inp = this.input.poll();
    this.lastInp = inp;
    this.sprintInput(match, inp);
    if (this.trail && (this.trail.t -= dt) <= 0) this.trail = null;
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
      if (!canAct) { this.press = null; this.queued = null; this.restartT = 0; return; }
      // Te toca sacar (banda, córner, puerta o centro): el jugador no se mueve hasta que golpees.
      // Si no lo haces en unos segundos, saca él solo, para que el partido nunca se quede parado.
      if (p.mustPass && !this.press && !this.queued) {
        this.restartT = (this.restartT || 0) + dt;
        if (this.restartT > KICK.autoRestart) { this.restartT = 0; this.team.carrierAI(match, p, dt); return; }
      } else this.restartT = 0;
      this.kickInput(match, inp, dt, { aDown, bDown, aUp, bUp });
      return;
    }
    this.restartT = 0;

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

  // Esprint: doble toque en la misma dirección (soltar y volver a pulsar enseguida). Dura mientras
  // mantengas esa dirección; se acaba al soltarla o al cambiar de dirección. Más rápido, pero cansa más.
  sprintInput(match, inp) {
    const t = match.time;
    const dir = Math.hypot(inp.x, inp.y) > 0.5 ? (Math.round(Math.atan2(inp.y, inp.x) / (Math.PI / 4)) + 8) % 8 : null;
    if (dir !== this.lastDir) {
      if (dir === null) {
        this.releasedDir = this.lastDir; this.releasedT = t;
        this.sprint = false;
      } else {
        if (dir === this.releasedDir && t - this.releasedT < PLAYER.sprintDoubleTap) this.sprint = true;
        else if (this.sprint && dir !== this.sprintDir) this.sprint = false;
        this.sprintDir = dir;
      }
      this.lastDir = dir;
    }
    if (this.player) this.player.sprinting = this.sprint;
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
      if (type) this.press = { type, phase: 'press', t: 0, u: 0, auto: this.autoMeter };
    } else if (k.phase === 'press') {
      k.t += dt; k.u += dt / this.fillTime();
      if (up[k.type]) { this.queue(k.type, k.auto); this.press = null; }   // pulsación seca
      else if (k.t >= KICK.holdTime) k.phase = 'manual';
    } else if (k.phase === 'manual') {
      k.t += dt; k.u += dt / this.fillTime();
      const v = this.manualMeter(k.u);
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
      // En posición de chut llega algo más lejos con la pierna: el disparo sale al soltar, sin esperas.
      const reach = this.canShoot ? SHOT.reach : PLAYER.kickReach;
      if (Math.hypot(ball.x - p.x, ball.y - p.y) < reach && ball.z < 1) {
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

  // ¿Este golpeo sería un chut a puerta? Cerca de la portería y con el cuerpo encarándola.
  isShot(power) { return this.inShotAngle() && power > SHOT.minPower; }

  // ¿Está en posición de chutar a puerta? Cerca de la portería y con el cuerpo encarándola.
  // (Es lo que enciende el punto rojo junto al medidor y pone roja la línea de trayectoria.)
  inShotAngle() {
    const p = this.player;
    if (!p) return false;
    const gx = this.team.oppGoalX;
    const toGoalX = gx - p.x, toGoalY = CY - p.y;
    const dGoal = Math.hypot(toGoalX, toGoalY);
    return dGoal < SHOT.range && (p.fx * toGoalX + p.fy * toGoalY) / (dGoal || 1) > SHOT.facing;
  }
  // ¿Tiene que sacar (y aún no lo ha hecho)? Para el aviso de pantalla.
  get mustTakeRestart() { return !!(this.player?.hasBall && this.player.mustPass); }

  get canShoot() { return !!this.player?.hasBall && this.inShotAngle(); }

  // Plan de un golpeo: velocidad con la que saldría el balón { vx, vy, vz, shot }.
  // Con random = false es el golpeo «limpio», sin errores: el que dibuja la línea de trayectoria.
  plan(match, inp, type, power, random = true) {
    const p = this.player, team = this.team;
    if (!p.throwIn && this.isShot(power)) return { ...this.planShot(match, inp, type, power, random), shot: true };
    let dir = this.aimDir(inp);
    if (power > KICK.assistMin) {
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
    if (p.throwIn) {
      // Saque de banda: con las manos, desde encima de la cabeza. No llega tan lejos como un golpeo;
      // con «alto» sale más bombeado.
      const v = THROW.min + (THROW.max - THROW.min) * power;
      const vz = (type === 'loft' ? THROW.loftVz : THROW.vz) + power * 1.5;
      return { vx: dir.x * v, vy: dir.y * v, vz, shot: false };
    }
    const [vx, vy, vz] = p.kickVelocity(dir.x, dir.y, power, type);
    return { vx, vy, vz, shot: false };
  }

  release(match, inp, type, power) {
    const p = this.player, ball = match.ball;
    // La línea de trayectoria se queda un momento tras el golpeo y se desvanece.
    const preview = this.trajectory(match, type, power, inp);
    if (preview) this.trail = { pts: preview, type, shot: this.isShot(power), t: KICK.trailTime, kicker: p };
    const k = this.plan(match, inp, type, power, true);
    ball.kick(k.vx, k.vy, Math.max(0, k.vz), 0);
    ball.lastTouch = p;
    p.hasBall = false; p.mustPass = false; p.throwIn = false; p.carrying = false;
    p.kickCD = PLAYER.kickCooldown; p.kickAnim = 0.25;
    const l = Math.hypot(k.vx, k.vy) || 1;
    p.fx = k.vx / l; p.fy = k.vy / l;
    match.onKick(p, k.shot ? 'shot' : type);
  }

  // Chut a puerta. Sale hacia donde apunta el cuerpo; si ese punto cae cerca de la portería,
  // la ayuda lo lleva hacia dentro de los palos. Luego se le suma un error que crece con lo mal
  // orientado que esté el cuerpo, lo rápido que corra, la distancia, el exceso de fuerza y la
  // dirección pulsada a última hora; esos dos últimos además lo levantan (se puede ir por encima).
  planShot(match, inp, type, power, random = true) {
    const ball = match.ball, p = this.player, team = this.team;
    const R = random ? Math.random : () => 0.5;
    const gx = team.oppGoalX, half = PITCH.goalWidth / 2;
    const bx = p.fx, by = p.fy;
    // Punto de la línea de gol al que apunta el cuerpo.
    let ty = null;
    if ((gx - p.x) * bx > 0.05) ty = p.y + by * (gx - p.x) / bx;
    let ang;
    if (ty !== null && Math.abs(ty - CY) < half + 5) {
      const inside = Math.max(CY - half + SHOT.inside, Math.min(CY + half - SHOT.inside, ty));
      ty += (inside - ty) * SHOT.assist;
      ang = Math.atan2(ty - p.y, gx - p.x);
    } else ang = Math.atan2(by, bx);                  // el cuerpo no mira a portería: va adonde mira

    // Errores.
    const dGoal = Math.hypot(gx - p.x, CY - p.y);
    const off = Math.acos(Math.max(-1, Math.min(1, (bx * (gx - p.x) + by * (CY - p.y)) / dGoal)));
    const sp = Math.hypot(p.vx, p.vy) / PLAYER.speed;
    const il = Math.hypot(inp.x, inp.y);
    let late = 0, lateSign = 0;
    if (il > 0.3) {
      const cross = bx * inp.y / il - by * inp.x / il, dot = bx * inp.x / il + by * inp.y / il;
      late = Math.atan2(Math.abs(cross), dot); lateSign = Math.sign(cross);
    }
    const over = Math.max(0, power - SHOT.overPower);
    const sigma = (SHOT.base + SHOT.offAngle * off + SHOT.speed * sp + SHOT.late * late + SHOT.overError * over +
      SHOT.distance * Math.max(0, dGoal - 12)) / p.skill;
    if (random) ang += (R() + R() - 1) * sigma * 1.6 + lateSign * late * 0.15;
    const dx = Math.cos(ang), dy = Math.sin(ang);

    // Velocidad y altura.
    const pc = Math.pow(power, KICK.curve);
    let v, vz;
    const lift = random ? SHOT.lateLift * late * R() + SHOT.overLift * over * R() : 0;
    if (type === 'loft') {
      // Chut alto: busca llegar a la portería bajo el larguero.
      v = KICK.loftMin + (KICK.loftMax - KICK.loftMin) * pc;
      // Distancia hasta la portería en la dirección del tiro. Si el tiro va casi paralelo a la
      // línea de gol, «hasta la línea» sería infinito (y colgaba el juego): se usa la distancia
      // a la portería, y el tiempo de vuelo se limita a algo razonable.
      const along = Math.abs(dx) > 0.15 ? Math.abs((gx - p.x) / dx) : Infinity;
      const D = Math.min(along, Math.hypot(gx - p.x, CY - p.y) + 2, 45);
      const t = Math.max(0.3, Math.min(2.5, D / (v * 0.96)));
      const [h0, h1] = SHOT.highHeight;
      const h = h0 + R() * (h1 - h0) + (random ? (R() - 0.5) * sigma * 6 : 0);
      vz = (h - ball.z + 0.5 * BALL.gravity * t * t) / t + lift;
    } else {
      // Chut raso: tenso y bajo; solo se levanta si es muy fuerte, te pasas o tuerces a última hora.
      v = KICK.groundMin + (KICK.groundMax - KICK.groundMin) * pc;
      vz = (power > 0.7 ? (power - 0.7) * 10 : 0) + lift;
    }
    return { vx: dx * v, vy: dy * v, vz: Math.max(0, Math.min(BALL.maxVz, vz)) };
  }

  // Compatibilidad: chut a puerta directo (lo usan las pruebas).
  shoot(match, inp, type, power) {
    const ball = match.ball, p = this.player;
    const k = this.planShot(match, inp, type, power, true);
    ball.kick(k.vx, k.vy, k.vz, 0);
    ball.lastTouch = p;
    p.hasBall = false; p.mustPass = false;
    p.kickCD = PLAYER.kickCooldown; p.kickAnim = 0.25;
    const l = Math.hypot(k.vx, k.vy) || 1;
    p.fx = k.vx / l; p.fy = k.vy / l;
    match.onKick(p, 'shot');
  }

  // Línea de trayectoria a dibujar: mientras pulsas, la del golpeo con la fuerza actual del medidor;
  // justo después de golpear, la última, desvaneciéndose. { pts, type, alpha } o null.
  previewLine(match) {
    const k = this.press;
    if (k && this.player?.hasBall) {
      const power = k.phase === 'manual' ? Math.max(0, this.manualMeter(k.u)) : k.auto;
      const pts = this.trajectory(match, k.type, power);
      return pts && { pts, type: k.type, shot: this.isShot(power), alpha: 1 };
    }
    if (this.trail) {
      // La línea que queda tras golpear sigue los pies de quien golpeó: lo que va quedando detrás
      // de él se borra (él sigue corriendo y la línea no puede quedarse a su espalda).
      const pts = clipBehind(this.trail.pts, this.trail.kicker);
      return pts && { ...this.trail, pts, alpha: Math.max(0, this.trail.t / KICK.trailTime) };
    }
    return null;
  }

  // Trayectoria que seguiría el balón con este golpeo (sin errores): lista de puntos [x, y, z].
  // Se simula con la misma física del balón (botes, postes, red) hasta que se para, sale o entra.
  trajectory(match, type, power, inp = this.lastInp || { x: 0, y: 0 }) {
    const p = this.player, ball = match.ball;
    if (!p || !p.hasBall) return null;
    const k = this.plan(match, inp, type, power, false);
    const b = SIM_BALL;
    // La línea sale siempre del jugador, delante del pie y en la dirección del golpeo
    // (el balón a veces está un poco a un lado o detrás mientras lo controla).
    const l = Math.hypot(k.vx, k.vy) || 1;
    const off = p.throwIn ? 0.1 : 0.45;
    b.reset(p.x + k.vx / l * off, p.y + k.vy / l * off);
    b.z = p.throwIn ? OUT.throwHeight : 0;
    b.kick(k.vx, k.vy, k.vz, 0);
    const pts = [[b.x, b.y, b.z]];
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 3; i++) {
      const ev = b.update(dt);
      if (i % 2 === 1) pts.push([b.x, b.y, b.z]);
      if (ev || b.inNet || (b.speed < 0.4 && b.z <= 0.01)) { pts.push([b.x, b.y, b.z]); break; }
    }
    return pts;
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
