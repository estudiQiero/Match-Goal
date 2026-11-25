import { PITCH, PLAYER, BALL, FATIGUE, OUT, WALLS } from './config.js';
import { Ball } from './ball.js';
import { Team } from './team.js';
import { sfx } from './sound.js';
import { Referee, Linesman } from './referee.js';

const L = PITCH.length, W = PITCH.width, CY = W / 2;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const OFFSIDE_TOL = 0.3;   // margen (m): «en línea» no es fuera de juego
const OFFSIDE_FLAG = 3;    // segundos con el banderín en alto

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
    // Entrenamiento: sin tiempo, solo los porteros, tu jugador y quien hayas elegido.
    this.training = opts.training || null;
    if (this.training) {
      const keep = (team, idx) => { team.players = team.players.filter(p => p.isGK || idx.includes(p.index)); };
      keep(this.home, [6, 9].slice(0, 1 + this.training.mates));      // un medio (tú) y, si acaso, un delantero
      keep(this.away, [2, 3, 1].slice(0, this.training.rivals));        // defensas centrales primero
    }
    this.referee = new Referee();
    // Linieres: uno arriba (mitad derecha) y otro abajo (mitad izquierda).
    this.linesmen = [new Linesman(-1, 1, 5), new Linesman(1, 0, 6)];
    this.offside = null;     // pase en curso con compañeros en fuera de juego: { team, kicker, flagged, last }
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
    // En el entrenamiento el saque siempre es tuyo.
    if (this.training) team = this.home;
    const field = team.players.filter(p => !p.isGK);
    const fws = field.filter(p => p.role === 'FW');
    const taker = fws[0] || field[field.length - 1];
    taker.place(L / 2 - team.dir * 0.4, CY);
    const mate = fws[1] || field.find(p => p !== taker);
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
    this.restartName = 'Saque inicial';
  }

  // ---------- Fuera de juego ----------

  // En cada golpeo: se apuntan los compañeros que están en fuera de juego en ese instante (campo
  // rival, por delante del balón y del penúltimo defensor). Si uno de ellos es el siguiente en tocar
  // el balón, es fuera de juego. Saques de banda, de esquina y de puerta no cuentan.
  offsideOnKick(p) {
    const o = this.offside;
    // Golpea (de cabeza, de volea…) uno que estaba en fuera de juego del pase anterior.
    if (o && p !== o.kicker && o.team === p.team && o.flagged.has(p)) { this.callOffside(p, o.flagged.get(p)); return; }
    this.offside = null;
    if (p.restartKick) { p.restartKick = false; return; }
    const team = p.team, opp = team.opponent;
    const ballProg = team.progress(this.ball.x);
    const deep = opp.players.map(q => team.progress(q.x)).sort((a, b) => b - a);
    const line = Math.max(ballProg, deep[1] ?? 1);          // el penúltimo defensor (o el balón)
    const flagged = new Map();
    for (const q of team.players) {
      if (q === p || q.isGK) continue;
      const pr = team.progress(q.x);
      if (pr > 0.5 && pr > line + OFFSIDE_TOL / L) flagged.set(q, { x: q.x, y: q.y });
    }
    if (flagged.size) this.offside = { team, kicker: p, flagged, last: p };
  }

  // Tras cada paso de juego: ¿quién ha tocado el balón ahora?
  checkOffside() {
    const o = this.offside, lt = this.ball.lastTouch;
    if (!o || !lt || lt === o.last) return;
    o.last = lt;
    if (lt.team === o.team && o.flagged.has(lt)) this.callOffside(lt, o.flagged.get(lt));
    else if (lt !== o.kicker) this.offside = null;        // lo ha tocado otro: el pase ya no cuenta
  }

  // Fuera de juego: el linier de esa mitad levanta el banderín, el árbitro pita y se para el juego.
  // Falta para el rival desde donde estaba el jugador en fuera de juego.
  callOffside(p, pos) {
    this.offside = null;
    const team = p.team.opponent;
    const x = Math.max(1, Math.min(L - 1, pos.x)), y = Math.max(1, Math.min(W - 1, pos.y));
    const lm = this.linesmen.find(l => (x >= L / 2) === (l.half === 1));
    if (lm) lm.flagT = OFFSIDE_FLAG;
    const ball = this.ball;
    if (ball.owner) ball.owner.hasBall = false;
    ball.owner = null;
    ball.dead = true;
    for (const q of this.players) { q.mustPass = false; q.carrying = false; q.throwIn = false; }
    this.out = { kind: 'freekick', team, taker: null, fetcher: null, x, y, phase: 'settle', t: 0, crowdT: 0, fetchT: 0 };
    this.outActors = new Set();
    this.state = 'out';
    this.restartTaker = null;
    this.restartWait = 99;
    this.show('Fuera de juego', 2);
    this.restartName = 'Falta';
    sfx.whistle(0.6);
  }

  // Quién saca y desde dónde (con los casos del entrenamiento sin jugadores de campo).
  chooseRestart(kind, team, x, y) {
    let taker;
    if (kind === 'goalkick') taker = team.gk;
    else taker = team.nearestTo(x, y, p => !p.isGK);
    if (!taker) {
      team = team.opponent;
      if (kind === 'corner') { kind = 'goalkick'; taker = team.gk; x = team.ownGoalX + team.dir * 5.5; y = CY; }
      else taker = team.nearestTo(x, y, p => !p.isGK);
    }
    return { kind, team, taker, x, y };
  }

  // El balón ha salido: pausa. Sigue rodando (o rebota en la valla, o se va a la grada), el que va
  // a sacar va a por él, lo coge con las manos, lo lleva al punto del saque y desde ahí saca.
  beginOut(kind, team, x, y) {
    const r = this.chooseRestart(kind, team, x, y);
    const ball = this.ball;
    if (ball.owner) ball.owner.hasBall = false;
    ball.owner = null;
    ball.dead = true;
    for (const p of this.players) { p.mustPass = false; p.carrying = false; p.throwIn = false; }
    this.out = { ...r, fetcher: r.taker, phase: 'settle', t: 0, crowdT: 0, fetchT: 0 };
    this.outActors = new Set([r.taker]);
    this.state = 'out';
    this.restartTaker = r.taker;
    this.restartWait = 99;
    const names = { throw: 'Saque de banda', corner: 'Córner', goalkick: 'Saque de puerta' };
    this.show(names[r.kind], 1.5);
    this.restartName = names[r.kind];
    sfx.whistle(0.2);
  }

  // Durante la pausa: el que saca camina hacia el balón o, con él en las manos, hacia el punto del saque.
  outMove() {
    const o = this.out, ball = this.ball;
    if (!o) return;
    if (o.kind === 'freekick') {
      if (o.phase === 'fetch' && o.taker?.state === 'normal') o.taker.moveTo(ball.x - (o.team.dir * 0.5), ball.y, OUT.fetchSpeed, 0.05);
      return;
    }
    const f = o.fetcher || o.taker, p = o.taker;
    // En un saque de puerta que recoge un defensa, el portero espera en el punto del saque.
    if (f !== p && p.state === 'normal') p.moveTo(o.x, o.y, OUT.carrySpeed, 0.05);
    if (f.state !== 'normal') return;
    if (o.phase === 'fetch') f.moveTo(ball.x, ball.y, OUT.fetchSpeed, 0.05);
    else if (o.phase === 'walk') {
      // Lo lleva al punto del saque (o, si no es él quien saca, al portero que espera).
      const tx = f === p ? o.x : p.x, ty = f === p ? o.y : p.y;
      f.moveTo(tx, ty, OUT.carrySpeed, 0.05);
    } else { f.mx = f.my = 0; }
  }

  // Quién va a por el balón, cuando ya se ha parado: el jugador del equipo que saca más cercano a él.
  // En un saque de puerta, el portero si es quien está más cerca; si no, el defensa más cercano,
  // que se lo lleva al portero para que saque.
  pickFetcher() {
    const o = this.out, ball = this.ball;
    const near = o.team.nearestTo(ball.x, ball.y, p => !p.isGK && p.state === 'normal');
    if (o.kind !== 'goalkick') {
      if (near) { o.taker = near; o.fetcher = near; }
      return;
    }
    const gk = o.team.gk;
    const dGK = dist(gk.x, gk.y, ball.x, ball.y), dN = near ? dist(near.x, near.y, ball.x, ball.y) : Infinity;
    o.taker = gk;
    o.fetcher = dN + 3 < dGK ? near : gk;
  }

  outProgress(dt) {
    const o = this.out, p = o.taker, ball = this.ball;
    o.t += dt;
    if (o.kind === 'freekick') return this.freekickProgress(dt);
    if (o.phase === 'settle') {
      if (ball.inCrowd) {
        // El público lo devuelve: aparece fuera, junto al punto del saque.
        if ((o.crowdT += dt) > OUT.crowdReturn) {
          const ox = o.x < L / 2 ? -1.2 : 1.2, oy = o.y < CY ? -1.2 : 1.2;
          ball.reset(o.kind === 'throw' ? o.x : o.x + ox, o.kind === 'throw' ? o.y + oy : o.y);
          ball.dead = true;
          o.phase = 'fetch';
        }
      } else if ((o.t > OUT.settleMin && ball.speed < 0.6 && ball.z < 0.05) || o.t > OUT.settleMax) {
        o.phase = 'fetch'; o.fetchT = 0;
        this.pickFetcher();
        this.restartTaker = o.taker;
        this.outActors = new Set([o.taker, o.fetcher]);
      }
    } else if (o.phase === 'fetch' || o.phase === 'walk') {
      const f = o.fetcher || p;
      // Red de seguridad: si por lo que sea no llega en un rato, se saca igualmente.
      if ((o.fetchT += dt) > OUT.giveUp) { this.finishRestart(o); return; }
      if (o.phase === 'fetch') {
        // Lo recoge cuando lo tiene a mano (y no va disparado).
        if (dist(f.x, f.y, ball.x, ball.y) < 0.8 && ball.z < 1.3 && ball.speed < 4) {
          ball.vx = ball.vy = ball.vz = 0;
          this.giveBall(f, false);
          f.carrying = true;
          o.phase = 'walk';
        }
      } else if (f !== p) {
        // El defensa llega al portero y se lo da.
        if (dist(f.x, f.y, p.x, p.y) < 1.3) {
          f.carrying = false; f.hasBall = false;
          this.giveBall(p, false);
          p.carrying = true;
          o.fetcher = p;
        }
      } else if (dist(p.x, p.y, o.x, o.y) < 0.3) this.finishRestart(o);
    }
  }

  // Tras un fuera de juego: pausa, el árbitro va a por el balón, lo lleva en las manos y lo planta
  // donde estaba el jugador en fuera de juego; luego el jugador más cercano del equipo que saca va al
  // balón y saca la falta con el pie.
  freekickProgress(dt) {
    const o = this.out, ball = this.ball, ref = this.referee;
    if (o.t > OUT.giveUp * 2.5) { this.placeFreekickBall(); o.taker ??= this.freekickTaker(); ref.goTo = null; return this.finishRestart(o); }
    if (o.phase === 'settle') {
      if ((o.t > OUT.settleMin && ball.speed < 1 && ball.z < 0.05) || o.t > OUT.settleMax) o.phase = 'ref';
    } else if (o.phase === 'ref') {
      ref.goTo = { x: ball.x, y: ball.y };
      if (dist(ref.x, ref.y, ball.x, ball.y) < 0.8) {
        ball.held = ref;
        ref.goTo = { x: o.x, y: o.y };
        o.phase = 'refwalk';
      }
    } else if (o.phase === 'refwalk') {
      if (dist(ref.x, ref.y, o.x, o.y) < 0.4) {
        this.placeFreekickBall();
        ref.goTo = { x: o.x + (L / 2 - o.x) * 0.15, y: o.y + (o.y < CY ? 6 : -6) };   // se aparta un poco
        o.taker = this.freekickTaker();
        o.fetcher = o.taker;
        this.restartTaker = o.taker;
        this.outActors = new Set([o.taker]);
        o.phase = 'fetch'; o.fetchT = 0;
      }
    } else if (o.phase === 'fetch') {
      const p = o.taker;
      if (dist(p.x, p.y, ball.x, ball.y) < 0.7 || (o.fetchT += dt) > OUT.giveUp) {
        ref.goTo = null;
        this.finishRestart(o);
      }
    }
  }

  placeFreekickBall() {
    const o = this.out, ball = this.ball;
    ball.held = null;
    ball.reset(o.x, o.y);
    ball.dead = true;
  }

  freekickTaker() {
    const o = this.out;
    return o.team.nearestTo(o.x, o.y, p => p.state === 'normal' && !p.isGK) || o.team.gk;
  }

  // Ya en el punto: saque de banda con el balón por encima de la cabeza; córner y saque de puerta,
  // con el balón en el suelo. A partir de aquí, como siempre: hay que golpear (o saca solo).
  finishRestart(r) {
    const { kind, team, taker, x, y } = r;
    const ball = this.ball;
    if (r.fetcher && r.fetcher !== taker) { r.fetcher.carrying = false; r.fetcher.hasBall = false; }
    this.outActors = null;
    taker.place(x, y);
    taker.carrying = false;
    taker.throwIn = kind === 'throw';
    taker.faceTo(kind === 'corner' ? team.oppGoalX - team.dir * 11 : kind === 'freekick' ? team.oppGoalX : L / 2, CY);
    // Saques de banda, de esquina y de puerta: no hay fuera de juego en ese golpeo.
    taker.restartKick = kind === 'throw' || kind === 'corner' || kind === 'goalkick';
    if (kind === 'freekick') {
      // En la falta, los rivales a 9,15 m del balón.
      for (const o2 of team.opponent.players) {
        const d = dist(o2.x, o2.y, x, y);
        if (d < PITCH.centerRadius && !o2.isGK) {
          const k = PITCH.centerRadius / (d || 1);
          o2.place(x + (o2.x - x) * k, y + (o2.y - y) * k + (d === 0 ? PITCH.centerRadius : 0));
        }
      }
    }
    ball.dead = false; ball.inCrowd = false;
    this.giveBall(taker, true);
    // El balón, ya en su sitio: encima de la cabeza (banda) o en el suelo delante del pie.
    ball.z = taker.throwIn ? OUT.throwHeight : 0;
    ball.x = taker.x + taker.fx * (taker.throwIn ? 0.05 : 0.55);
    ball.y = taker.y + taker.fy * (taker.throwIn ? 0.05 : 0.55);
    ball.vx = ball.vy = ball.vz = 0;
    this.out = null;
    this.state = 'restart';
    this.restartWait = 0.6;
    this.restartTaker = taker;
  }

  setupRestart(kind, team, x, y) {
    const ball = this.ball;
    let taker;
    if (kind === 'goalkick') taker = team.gk;
    else taker = team.nearestTo(x, y, p => !p.isGK);
    // Entrenamiento: si el saque es para un equipo sin jugadores de campo, es para el tuyo
    // (un córner a tu favor no tiene sentido en tu propia portería: saque de puerta).
    if (!taker) {
      team = team.opponent;
      if (kind === 'corner') { kind = 'goalkick'; taker = team.gk; x = team.ownGoalX + team.dir * 5.5; y = CY; }
      else taker = team.nearestTo(x, y, p => !p.isGK);
    }
    ball.reset(x, y);
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
    this.restartName = names[kind];
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
    p.touchCD = 0;
    // Primer control: durante un instante atrae el balón al pie, delante y hacia donde quiere ir.
    p.trapT = PLAYER.trapTime;
    if (p.isGK || mustPass) { ball.vx = ball.vy = 0; }
    ball.vz = 0;
  }

  onKick(p, type) {
    this.offsideOnKick(p);
    if (this.state !== 'play' && this.state !== 'restart' && this.state !== 'kickoff') return;
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
      for (const l of this.linesmen) l.update(dt, this.ball);
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
    if (this.state === 'out') this.outMove();
    for (const p of this.players) p.update(dt);
    this.referee.update(dt, this.ball);
    for (const l of this.linesmen) l.update(dt, this.ball);

    this.dribble(dt);
    const ev = this.ball.update(dt);
    if (this.state === 'out') this.outProgress(dt);

    if (this.state === 'play') {
      this.clock += dt;
      this.trample(dt);
      // Cansancio, en minutos de partido (45 por parte, dure lo que dure la parte de verdad).
      const gameMin = dt * 45 / this.halfDuration;
      for (const p of this.players) p.tire(gameMin);
      const owner = this.ball.owner || this.ball.lastTouch;
      if (owner) this.stats.possession[owner.team === this.home ? 0 : 1] += dt;
      this.contacts(dt);
      if (this.ball.onPost) { sfx.post(); this.ball.onPost = false; }
      if (this.state === 'play') this.checkOffside();
      if (this.state !== 'play') return;
      if (ev) this.handleEvent(ev);
      else if (this.clock >= this.halfDuration && !this.training) this.endHalf();
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

  // Conducción. El balón solo va pegado en las manos del portero y en los saques;
  // el resto del tiempo rueda libre y el jugador lo va empujando con toques cortos.
  dribble(dt) {
    const ball = this.ball;
    const p = ball.owner;
    ball.attached = false;
    if (ball.held) {
      // En las manos del árbitro (tras un fuera de juego), a media altura.
      const h = ball.held;
      ball.x = h.x + h.fx * 0.3; ball.y = h.y + h.fy * 0.3; ball.z = OUT.carryHeight;
      ball.vx = ball.vy = ball.vz = 0;
      ball.attached = true;
      return;
    }
    if (!p) return;
    // El portero no suelta el balón al levantarse de una estirada.
    const holding = p.state === 'dive' || p.state === 'jump' || (p.isGK && p.state === 'getup');
    if (p.state !== 'normal' && !holding) { ball.owner = null; p.hasBall = false; return; }
    if (p.isGK || p.mustPass || p.carrying) {
      // En las manos del portero, en los brazos (llevándolo al saque), encima de la cabeza (saque
      // de banda) o en el suelo delante del pie (córner, saque de puerta, saque de centro).
      const off = p.throwIn ? 0.05 : p.carrying ? 0.35 : p.isGK ? 0.35 : 0.55;
      const tx = p.x + p.fx * off, ty = p.y + p.fy * off;
      const k = Math.min(1, dt * 16);
      ball.x += (tx - ball.x) * k;
      ball.y += (ty - ball.y) * k;
      ball.z = p.throwIn ? OUT.throwHeight : p.carrying ? OUT.carryHeight : p.isGK && !p.mustPass ? 1.1 + p.z : 0;
      ball.vx = p.vx; ball.vy = p.vy; ball.vz = 0;
      ball.spin = 0;
      ball.attached = true;
      return;
    }

    const dx = ball.x - p.x, dy = ball.y - p.y, d = Math.hypot(dx, dy);
    // Se le ha escapado: el balón queda suelto y se lo lleva quien llegue antes (él también).
    if (d > PLAYER.loseDist) { ball.owner = null; p.hasBall = false; return; }
    p.touchCD = Math.max(0, (p.touchCD || 0) - dt);
    if (ball.z > 0.3 || p.state !== 'normal') return;

    const sp = Math.hypot(p.vx, p.vy);
    // Hacia dónde quiere ir: lo que pide el mando (o la IA); si no pide nada, hacia donde corre o mira.
    let mx = p.mx, my = p.my;
    const ml = Math.hypot(mx, my);
    if (ml >= 0.2) { mx /= ml; my /= ml; }
    else if (sp > 0.8) { mx = p.vx / sp; my = p.vy / sp; }
    else { mx = p.fx; my = p.fy; }
    const fwd = dx * mx + dy * my, side = -dx * my + dy * mx;

    // Control: si el balón está dentro de su radio pero no delante, en la línea por la que quiere
    // correr (le llega de lado, por detrás, o acaba de hacerse con él), lo atrae con el pie y lo deja
    // delante, orientado hacia donde quiere ir. Parado, lo mismo: lo deja delante del pie.
    const ahead = fwd > 0.15 && Math.abs(side) < PLAYER.touchSide * 0.7;
    if (d < PLAYER.controlDist && (p.trapT > 0 || sp < 0.8 || !ahead)) {
      p.trapT = Math.max(0, (p.trapT || 0) - dt);
      const tx = p.x + mx * 0.45, ty = p.y + my * 0.45;
      const k = 1 - Math.exp(-PLAYER.trapPull * dt);
      ball.vx += (p.vx + (tx - ball.x) * 8 - ball.vx) * k;
      ball.vy += (p.vy + (ty - ball.y) * 8 - ball.vy) * k;
      ball.vz = 0; ball.spin = 0;
      ball.lastTouch = p;
      return;
    }
    if (sp < 0.8) return;

    // Corriendo: toca el balón cuando lo tiene delante y a su alcance.
    if (p.touchCD > 0 || d > PLAYER.touchReach || fwd < -0.15 || Math.abs(side) > PLAYER.touchSide) return;
    // El toque sale hacia donde quiere ir (y no exactamente hacia donde mira): así se gira con el balón.
    // Cuanto menos hábil, más largo y más torcido el toque.
    const clumsy = Math.max(0, 1.1 - p.skill);
    // Se toca según la velocidad a la que quiere ir (al arrancar aún va despacio, pero acelera enseguida).
    const want = (sp + Math.max(sp, Math.min(1, ml) * p.maxSpeed * p.skill * PLAYER.dribbleSpeed)) / 2;
    const push = want * (PLAYER.touchPush + Math.random() * 0.12 + clumsy * 0.8);
    const ang = (Math.random() - 0.5) * (0.05 + clumsy * 0.9);
    const c = Math.cos(ang), s = Math.sin(ang);
    ball.vx = (mx * c - my * s) * push;
    ball.vy = (mx * s + my * c) * push;
    ball.vz = 0;
    ball.spin = 0;
    ball.lastTouch = p;
    p.touchCD = PLAYER.touchCooldown;
  }

  contacts(dt) {
    const ball = this.ball;
    const owner = ball.owner;
    const players = this.players;

    // Balón que se le ha alejado al que lo conduce: lo coge quien esté más cerca y a su alcance.
    if (owner && !ball.attached && ball.z < 0.6) {
      const dOwn = dist(owner.x, owner.y, ball.x, ball.y);
      if (dOwn > 0.9) {
        for (const o of players) {
          if (o === owner || o.state !== 'normal' || o.kickCD > 0) continue;
          const d = dist(o.x, o.y, ball.x, ball.y);
          const rel = Math.hypot(ball.vx - o.vx, ball.vy - o.vy);
          if (d < PLAYER.controlDist && d < dOwn - 0.3 && rel < PLAYER.controlMaxSpeed) {
            this.giveBall(o);
            if (o.team !== owner.team) sfx.kick(0.3);
            return;
          }
        }
      }
    }

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
      // El portero alcanza según su postura (de pie, estirándose en el aire o ya tumbado).
      const reach = gkHands ? p.keeperReach.reach : PLAYER.controlDist;
      const maxZ = gkHands ? p.keeperReach.maxZ : 0.6;
      if (p.state === 'fallen' || p.state === 'slide' || p.state === 'getup') continue;
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
      const reach = best.keeperReach.reach;
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
      this.beginOut('throw', team, x, y);
      return;
    }
    // Línea de fondo.
    const gx = ev.side === 'left' ? 0 : L;
    const defending = this.teams.find(t => t.ownGoalX === gx);
    if (last === defending) {
      const att = defending.opponent;
      this.beginOut('corner', att, gx === 0 ? 0.5 : L - 0.5, ball.y < CY ? 0.5 : W - 0.5);
    } else {
      this.beginOut('goalkick', defending, gx + defending.dir * 5.5, CY + (ball.y < CY ? -4 : 4));
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
      // En el descanso se recupera un poco.
      for (const p of this.players) p.stamina = Math.min(1, p.stamina + FATIGUE.halfTime);
      for (const t of this.teams) t.dir *= -1;
      this.setupKickoff(this.away);
    }
  }
}
