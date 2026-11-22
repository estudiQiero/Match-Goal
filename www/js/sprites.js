// Sprites del jugador: fotogramas de sprite-data.js pintados con los colores de cada equipo.
// Cada color del dibujo es fijo (piel, pelo, botas…) o de una zona del uniforme con un tono:
// el tono (k) dice cuánto más claro u oscuro es ese píxel que el color base de la zona.
import { PLAYER_ART } from './sprite-data.js';

const ART = PLAYER_ART;
export const SPRITE_H = ART.height;                 // altura del jugador quieto, en píxeles de dibujo
export const DIRS = ART.dirs;                       // S, SE, E, NE, N, NO, O, SO
export const ANIM_FPS = Object.fromEntries(Object.entries(ART.anims).map(([k, a]) => [k, a.fps]));
export const hasAnim = name => !!ART.anims[name];
export const frameCount = (anim, dir) => ART.anims[anim].frames[dir].length;

const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// Aplica un tono a un color de equipo: k < 1 oscurece, k > 1 aclara hacia blanco.
// En colores muy oscuros (pantalón negro) la sombra no se vería: se aclaran un poco las luces.
function shade([r, g, b], k) {
  if (k <= 1) {
    const dark = (r + g + b) / 3 < 50;
    const kk = dark ? 0.55 + 0.45 * k : k;
    const lift = dark ? (1 - k) * -10 : 0;
    return [r * kk + lift, g * kk + lift, b * kk + lift].map(v => Math.max(0, Math.min(255, Math.round(v))));
  }
  const t = Math.min(1, (k - 1) * 2.5);
  return [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t].map(Math.round);
}

// Colores de equipación a partir de los del equipo.
export function kitFor(team, isGK) {
  const shirt = isGK ? team.gkColor : team.color.shirt;
  const shorts = team.color.shorts;
  const light = c => { const [r, g, b] = hex2(c); return (r + g + b) / 3 > 200; };
  return {
    shirt, shorts,
    socks: team.color.socks || shirt,
    trim: team.color.trim || (light(shirt) ? shorts : '#ffffff'),
    badge: team.color.badge || (light(shirt) ? shorts : '#f2c230'),
    // Dorsal: blanco, salvo en camisetas claras (entonces el pantalón si es oscuro, o casi negro).
    number: team.color.number || (light(shirt) ? (light(shorts) ? '#22262e' : shorts) : '#ffffff'),
  };
}

// Fotograma ya decodificado (índices de paleta) para no hacerlo en cada dibujo.
const decoded = new Map();
function frameData(anim, dir, i) {
  const key = `${anim}|${dir}|${i}`;
  let f = decoded.get(key);
  if (!f) {
    const src = ART.anims[anim].frames[dir][i];
    const bin = atob(src.data), idx = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) idx[j] = bin.charCodeAt(j);
    f = { ...src, idx };
    decoded.set(key, f);
  }
  return f;
}

// Cifras del dorsal en píxeles, 4×8 (como el 8 del dibujo original).
const DIGITS = {
  0: ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  1: ['.#', '##', '.#', '.#', '.#', '.#', '.#', '.#'],
  2: ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '#...', '####'],
  3: ['.##.', '#..#', '...#', '.##.', '...#', '...#', '#..#', '.##.'],
  4: ['..#.', '.##.', '#.#.', '#.#.', '####', '..#.', '..#.', '..#.'],
  5: ['####', '#...', '#...', '###.', '...#', '...#', '#..#', '.##.'],
  6: ['.##.', '#...', '#...', '###.', '#..#', '#..#', '#..#', '.##.'],
  7: ['####', '...#', '...#', '..#.', '..#.', '.#..', '.#..', '.#..'],
  8: ['.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '#..#', '.##.'],
  9: ['.##.', '#..#', '#..#', '#..#', '.###', '...#', '...#', '.##.'],
};
function numberRows(n) {
  const ds = String(n).split('').map(d => DIGITS[d]);
  return Array.from({ length: 8 }, (_, r) => ds.map(d => d[r]).join('.'));
}

// Pinta el dorsal en el recuadro que marcó el importador. Solo sobre la camiseta,
// así un brazo por delante lo sigue tapando. En vistas en diagonal se estrecha.
function paintNumber(d, f, n, rgb) {
  const [bx, by, bw, bh] = f.num;
  const rows = numberRows(n), tw = rows[0].length;
  const full = bh >= 7, gh = full ? bh : 8;
  const sx = full ? Math.min(1, Math.max(3, bw) / 4) : 1;
  const ow = Math.max(1, Math.round(tw * sx)), ox = Math.round(bx + bw / 2 - ow / 2);
  for (let y = 0; y < gh; y++) for (let x = 0; x < ow; x++) {
    const r = rows[Math.min(7, Math.floor(y * 8 / gh))];
    if (r[Math.min(tw - 1, Math.floor((x + 0.5) * tw / ow))] !== '#') continue;
    const px = ox + x, py = by + y;
    if (px < 0 || py < 0 || px >= f.w || py >= f.h) continue;
    const j = py * f.w + px, p = ART.palette[f.idx[j]];
    if (!p || p.zone !== 'shirt') continue;
    d[j * 4] = rgb[0]; d[j * 4 + 1] = rgb[1]; d[j * 4 + 2] = rgb[2]; d[j * 4 + 3] = 255;
  }
}

const cache = new Map();

// Fotograma pintado con los colores del equipo y su dorsal: { canvas, ax, ay } con los pies en (ax, ay).
export function playerSprite(kit, anim, dir, frame, number) {
  const list = ART.anims[anim].frames[dir];
  const i = ((frame % list.length) + list.length) % list.length;
  const key = `${anim}|${dir}|${i}|${kit.shirt}|${kit.shorts}|${kit.socks}|${kit.trim}|${kit.badge}|${number}|${kit.number}`;
  let out = cache.get(key);
  if (out) return out;
  const f = frameData(anim, dir, i);
  const zone = { shirt: hex2(kit.shirt), shorts: hex2(kit.shorts), socks: hex2(kit.socks), trim: hex2(kit.trim), badge: hex2(kit.badge) };
  const colours = ART.palette.map(p => !p ? null : p.zone ? shade(zone[p.zone], p.k) : hex2(p.rgb));
  const cv = document.createElement('canvas');
  cv.width = f.w; cv.height = f.h;
  const g = cv.getContext('2d');
  const img = g.createImageData(f.w, f.h), d = img.data;
  for (let j = 0; j < f.idx.length; j++) {
    const c = colours[f.idx[j]];
    if (!c) continue;
    d[j * 4] = c[0]; d[j * 4 + 1] = c[1]; d[j * 4 + 2] = c[2]; d[j * 4 + 3] = 255;
  }
  if (f.num && number) paintNumber(d, f, number, hex2(kit.number || '#ffffff'));
  g.putImageData(img, 0, 0);
  out = { canvas: cv, ax: ART.anchor[0] - f.x, ay: ART.anchor[1] - f.y };
  cache.set(key, out);
  return out;
}

// Dirección del dibujo (0 = S, hacia la cámara; 2 = E, derecha) según hacia dónde mira el jugador.
// Si una animación no tiene alguna dirección, se usa la simétrica en espejo.
const MIRROR = { O: 'E', SO: 'SE', NO: 'NE', E: 'O', SE: 'SO', NE: 'NO' };
export function pickDir(anim, fx, fy) {
  const n = DIRS.length;
  const i = ((Math.round(Math.atan2(fx, fy) / (Math.PI * 2 / n)) % n) + n) % n;
  const dir = DIRS[i], frames = ART.anims[anim].frames;
  if (frames[dir]) return { dir, mirror: false };
  if (frames[MIRROR[dir]]) return { dir: MIRROR[dir], mirror: true };
  return { dir: Object.keys(frames)[0], mirror: false };
}
