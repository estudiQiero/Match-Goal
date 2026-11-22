// Efectos de sonido sintetizados con Web Audio (sin archivos).

let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(dur) {
  const c = ac();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(node, t0, a, peak, dur) {
  const c = ac();
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g).connect(c.destination);
  return g;
}

export const sfx = {
  setEnabled(v) { enabled = v; },
  unlock() { ac(); },

  kick(strength = 0.6) {
    if (!enabled || !ac()) return;
    const c = ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    env(o, t, 0.005, 0.5 * strength, 0.15);
    o.start(t); o.stop(t + 0.16);
    const n = noise(0.05);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    n.connect(f);
    env(f, t, 0.002, 0.25 * strength, 0.05);
    n.start(t);
  },

  post() {
    if (!enabled || !ac()) return;
    const c = ctx, t = c.currentTime;
    for (const fr of [620, 1240, 1860]) {
      const o = c.createOscillator();
      o.frequency.value = fr;
      env(o, t, 0.002, 0.15, 0.5);
      o.start(t); o.stop(t + 0.5);
    }
  },

  catch() {
    if (!enabled || !ac()) return;
    const c = ctx, t = c.currentTime;
    const n = noise(0.08);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600;
    n.connect(f);
    env(f, t, 0.003, 0.4, 0.08);
    n.start(t);
  },

  whistle(dur = 0.4) {
    if (!enabled || !ac()) return;
    const c = ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.value = 2400;
    const lfo = c.createOscillator();
    lfo.frequency.value = 28;
    const lg = c.createGain(); lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    env(o, t, 0.02, 0.12, dur);
    o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
  },

  goal() {
    if (!enabled || !ac()) return;
    const c = ctx, t = c.currentTime;
    const n = noise(3);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    n.connect(f);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    f.connect(g).connect(c.destination);
    n.start(t);
  },
};
