// Entradas: teclado, mandos (Gamepad API) y controles táctiles.
// Todas devuelven { x, y, a, b } con x/y entre -1 y 1.
//  a = golpeo raso / entrada
//  b = golpeo alto / cambiar jugador

const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.code);
  const t = e.target && e.target.tagName;
  if ((e.code.startsWith('Arrow') || e.code === 'Space') && t !== 'INPUT' && t !== 'SELECT') e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ---------- Teclado ----------
// Teclas de cada jugador, redefinibles desde el menú («Redefinir teclas»). Se guardan en el navegador.
// En el modo de 1 jugador valen las teclas de los dos juegos (por defecto, Q A O P o las flechas).
export const KEY_ACTIONS = [
  ['up', 'ARRIBA'], ['down', 'ABAJO'], ['left', 'IZQUIERDA'], ['right', 'DERECHA'],
  ['a', 'RASO (pase o chut raso, entrada)'], ['b', 'ALTO (pase o chut alto, cambiar de jugador)'],
];
const KEYS_DEFAULT = {
  p1: { up: ['KeyQ'], down: ['KeyA'], left: ['KeyO'], right: ['KeyP'], a: ['Space'], b: ['KeyZ', 'KeyM'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Period'], b: ['Slash'] },
};
// Nombre que se ve de cada tecla. Las que se asignan en el menú guardan el carácter real
// de tu teclado (en uno español, la tecla «Slash» es el «-»).
const LABELS_DEFAULT = {
  Space: 'Espacio', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Period: '.', Slash: '-', Comma: ',', Enter: 'Intro', ShiftLeft: 'Mayús', ShiftRight: 'Mayús dcha.',
  ControlLeft: 'Ctrl', AltLeft: 'Alt', MetaLeft: 'Cmd', Tab: 'Tab', Backspace: 'Borrar',
};
let keyMaps = loadKeys();
let keyLabels = loadLabels();

function loadKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem('matchgoal-keys') || '{}');
    return { p1: { ...KEYS_DEFAULT.p1, ...saved.p1 }, p2: { ...KEYS_DEFAULT.p2, ...saved.p2 } };
  } catch { return structuredClone(KEYS_DEFAULT); }
}
function loadLabels() {
  try { return { ...LABELS_DEFAULT, ...JSON.parse(localStorage.getItem('matchgoal-keylabels') || '{}') }; }
  catch { return { ...LABELS_DEFAULT }; }
}
function saveKeys() {
  try {
    localStorage.setItem('matchgoal-keys', JSON.stringify(keyMaps));
    localStorage.setItem('matchgoal-keylabels', JSON.stringify(keyLabels));
  } catch { /* sin almacenamiento */ }
}

export function keyLabel(code) {
  if (keyLabels[code]) return keyLabels[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
// Nombre visible a partir de un evento de teclado (lo que pone en la tecla).
export function rememberLabel(e) {
  if (LABELS_DEFAULT[e.code]) return;
  const k = e.key && e.key.length === 1 ? e.key.toUpperCase() : null;
  if (k && k !== ' ') keyLabels[e.code] = k;
}
export function getKeys(player) { return keyMaps[player]; }
export function setKeys(player, map) { keyMaps[player] = { ...map }; saveKeys(); }
export function resetKeys() { keyMaps = structuredClone(KEYS_DEFAULT); saveKeys(); }

// Teclas que usa cada esquema: p1, p2, o solo (las de los dos).
function scheme(name) {
  if (name !== 'solo') return keyMaps[name];
  const out = {};
  for (const [k] of KEY_ACTIONS) out[k] = [...keyMaps.p1[k], ...keyMaps.p2[k]];
  return out;
}

// Texto de ayuda: «Q arriba · A abajo · … · Espacio raso · Z o M alto».
export function schemeLabel(name) {
  const m = scheme(name), names = c => c.length ? c.map(keyLabel).join(' o ') : '(sin tecla)';
  return `${names(m.up)} arriba · ${names(m.down)} abajo · ${names(m.left)} izquierda · ${names(m.right)} derecha · ${names(m.a)} raso · ${names(m.b)} alto`;
}

const held = list => list.some(c => keys.has(c));

function keyboard(name) {
  return () => {
    const s = scheme(name);
    let x = (held(s.right) ? 1 : 0) - (held(s.left) ? 1 : 0);
    let y = (held(s.down) ? 1 : 0) - (held(s.up) ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y, a: held(s.a), b: held(s.b) };
  };
}

// ---------- Mandos ----------
// Botones asignados por el jugador (pantalla «Asignar botones» del menú). Se guardan en el navegador.
// Por defecto, el mapa estándar (Xbox / PlayStation): A o Cruz = raso, B o Círculo = alto, Start = pausa.
const PAD_DEFAULT = { raso: [0], alto: [1], pausa: [9] };
let padMap = loadPadMap();

function loadPadMap() {
  try { return { ...PAD_DEFAULT, ...JSON.parse(localStorage.getItem('matchgoal-pad') || '{}') }; }
  catch { return { ...PAD_DEFAULT }; }
}
export function getPadMap() { return padMap; }
export function setPadMap(m) {
  padMap = { ...PAD_DEFAULT, ...m };
  try { localStorage.setItem('matchgoal-pad', JSON.stringify(padMap)); } catch { /* sin almacenamiento */ }
}
export function resetPadMap() { setPadMap({}); }

export function connectedPads() {
  return navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
}
export const padPressed = (g, list) => list.some(i => g.buttons[i]?.pressed);

// Muchos mandos genéricos dan la cruceta como un solo eje («hat», normalmente el 9):
// -1 arriba y luego en sentido horario hasta 1; en reposo, un valor fuera de rango.
function hat(v) {
  if (v === undefined || v < -1.05 || v > 1.05) return null;
  const i = Math.round((v + 1) / (2 / 7));
  return [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]][i] || null;
}

function gamepad(index) {
  return () => {
    const g = connectedPads()[index];
    if (!g) return null;
    let x = g.axes[0] || 0, y = g.axes[1] || 0;
    const h = g.mapping === 'standard' ? null : hat(g.axes[9]);
    if (h) [x, y] = h;
    // Cruceta como botones: solo en mandos con mapa estándar (en otros, esos números son otros botones).
    if (g.mapping === 'standard') {
      if (g.buttons[14]?.pressed) x = -1;
      if (g.buttons[15]?.pressed) x = 1;
      if (g.buttons[12]?.pressed) y = -1;
      if (g.buttons[13]?.pressed) y = 1;
    }
    const l = Math.hypot(x, y);
    if (l < 0.25) { x = 0; y = 0; } else if (l > 1) { x /= l; y /= l; }
    return { x, y, a: padPressed(g, padMap.raso), b: padPressed(g, padMap.alto) };
  };
}

// ---------- Táctil ----------

const touch = { x: 0, y: 0, a: false, b: false, active: false };

export function setupTouch(root) {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouch) return false;
  root.classList.add('touch');
  const stick = root.querySelector('.stick');
  const knob = root.querySelector('.knob');
  const btnA = root.querySelector('.btn-a');
  const btnB = root.querySelector('.btn-b');
  let stickId = null, cx = 0, cy = 0;
  const R = 50;

  stick.addEventListener('pointerdown', e => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e);
  });
  const move = e => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.x = Math.abs(dx) > 8 ? dx / R : 0;
    touch.y = Math.abs(dy) > 8 ? dy / R : 0;
  };
  stick.addEventListener('pointermove', move);
  const end = e => {
    if (e.pointerId !== stickId) return;
    stickId = null; touch.x = touch.y = 0;
    knob.style.transform = '';
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  for (const [el, k] of [[btnA, 'a'], [btnB, 'b']]) {
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); touch[k] = true; el.classList.add('on'); });
    const up = () => { touch[k] = false; el.classList.remove('on'); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  touch.active = true;
  return true;
}

// Combina varias fuentes: la primera que tenga algo pulsado manda.
export function makeInput(sources) {
  const fns = sources.map(s => {
    if (s.type === 'keys') return keyboard(s.scheme);
    if (s.type === 'pad') return gamepad(s.index);
    if (s.type === 'touch') return () => (touch.active ? touch : null);
    return () => null;
  });
  return {
    poll() {
      const out = { x: 0, y: 0, a: false, b: false };
      for (const f of fns) {
        const v = f();
        if (!v) continue;
        if (Math.abs(v.x) > Math.abs(out.x)) out.x = v.x;
        if (Math.abs(v.y) > Math.abs(out.y)) out.y = v.y;
        out.a = out.a || v.a;
        out.b = out.b || v.b;
      }
      return out;
    },
  };
}

export function anyKeyDown(...codes) {
  return codes.some(c => keys.has(c));
}
