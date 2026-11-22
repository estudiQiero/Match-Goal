// Entradas: teclado, mandos (Gamepad API) y controles táctiles.
// Todas devuelven { x, y, a, b } con x/y entre -1 y 1.
//  a = golpeo raso / entrada
//  b = golpeo alto / cambiar jugador

const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export const SCHEMES = {
  p1: { up: 'KeyQ', down: 'KeyA', left: 'KeyO', right: 'KeyP', a: 'Space', b: ['KeyZ', 'KeyM'],
        label: 'Q arriba · A abajo · O izquierda · P derecha · Espacio raso · Z o M alto' },
  p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
        a: 'Period', b: 'Slash', label: 'Flechas · . raso · - alto' },
  solo: { up: ['KeyQ', 'ArrowUp'], down: ['KeyA', 'ArrowDown'], left: ['KeyO', 'ArrowLeft'],
          right: ['KeyP', 'ArrowRight'], a: 'Space', b: ['KeyZ', 'KeyM'],
          label: 'Q arriba · A abajo · O izquierda · P derecha (o flechas) · Espacio raso · Z o M alto' },
};

const held = k => Array.isArray(k) ? k.some(c => keys.has(c)) : keys.has(k);

function keyboard(s) {
  return () => {
    let x = (held(s.right) ? 1 : 0) - (held(s.left) ? 1 : 0);
    let y = (held(s.down) ? 1 : 0) - (held(s.up) ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y, a: held(s.a), b: held(s.b) };
  };
}

function gamepad(index) {
  return () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const list = [...pads].filter(Boolean);
    const g = list[index];
    if (!g) return null;
    let x = g.axes[0] || 0, y = g.axes[1] || 0;
    if (g.buttons[14]?.pressed) x = -1;
    if (g.buttons[15]?.pressed) x = 1;
    if (g.buttons[12]?.pressed) y = -1;
    if (g.buttons[13]?.pressed) y = 1;
    const l = Math.hypot(x, y);
    if (l < 0.25) { x = 0; y = 0; } else if (l > 1) { x /= l; y /= l; }
    const btn = i => !!g.buttons[i]?.pressed;
    return { x, y, a: btn(0) || btn(7), b: btn(1) || btn(2) || btn(6) };
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
    if (s.type === 'keys') return keyboard(SCHEMES[s.scheme]);
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
