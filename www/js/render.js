import { PITCH, PLAYER } from './config.js';
import { WEAR_CELL, WEAR_PAD, WEAR_W, WEAR_H } from './match.js';
import { drawPixelText, pixelTextWidth } from './pixelfont.js';
import { playerSprite, kitFor, pickDir, hasAnim, frameCount, SPRITE_H, ANIM_FPS } from './sprites.js';

// Tamaño del píxel del sprite en pantalla (px CSS por píxel del dibujo). ×2 = «pixel gordo».
const PIXEL = 2;
// Por debajo de esta velocidad (m/s) el jugador anda; por encima, corre.
const WALK_MAX = 3.4;
const STRIDE = { andar: 1.5, correr: 2.4 };

// Granitos del césped: posiciones fijas en el campo (y algo fuera), repartidas al azar con semilla.
// Números al azar repetibles (mulberry32). Con enteros de 32 bits: un generador
// que multiplique números grandes en coma flotante pierde precisión y se repite enseguida.
function seeded(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAIN = (() => {
  const rnd = seeded(12345);
  const out = [];
  // Misma densidad sea cual sea el tamaño del campo (~26 granitos por m²).
  // Tipos: 0 brizna oscura (2 px), 1 punto oscuro, 2 punto claro, 3 mata clara (2 px, punta más clara).
  const n = Math.round(26 * (PITCH.length + 12) * (PITCH.width + 12));
  for (let i = 0; i < n; i++) {
    const t = rnd();
    out.push([-6 + rnd() * (PITCH.length + 12), -6 + rnd() * (PITCH.width + 12),
      t < 0.35 ? 0 : t < 0.65 ? 1 : t < 0.85 ? 2 : 3, rnd()]);
  }
  // Agrupados por metro de x: así cada fotograma solo se miran los de la zona visible.
  const buckets = Array.from({ length: Math.ceil(PITCH.length + 12) + 1 }, () => []);
  for (const g of out) buckets[Math.floor(g[0] + 6)].push(g);
  return buckets;
})();


const L = PITCH.length, W = PITCH.width, CY = W / 2;
const HUMAN_COLORS = { 1: '#ffd23f', 2: '#4fd1ff' };
// Cansancio: colores de los puntos y combinación en cada nivel (0 fresco … 4 agotado).
const FATIGUE_COLORS = { g: '#3ddc84', o: '#ffa53f', r: '#ff4d4d' };
const FATIGUE_DOTS = ['ggg', 'ggo', 'ooo', 'oor', 'rrr'];
// Color del aro: verde (niveles 0-1), naranja (2-3) o rojo (4).
const RING_RGB = [[61, 220, 132], [255, 165, 63], [255, 77, 77]];
// Colores de las 8 rayitas del medidor de fuerza: de verde (flojo) a rojo (fuerte).
const METER_COLORS = ['#3ddc84', '#3ddc84', '#8fe05a', '#c8e04a', '#ffd23f', '#ffa53f', '#ff7043', '#ff4d4d'];
// Blanco de las líneas, algo apagado para que no destaque más que los jugadores.
// Desgaste de las líneas: ruido suave pegado al campo. En unos pocos tramos la cal está gastada:
// la línea se apaga y pierde píxeles sueltos.
const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
// Fuerza de la cal en un punto según lo pisado (wear 0..1 del partido).
// El ruido hace que el desgaste sea irregular y que se coma píxeles sueltos.
function lineStrength(wx, wy, wear) {
  const n = valueNoise(wx / 1.3, wy / 1.3);
  const worn = Math.min(1, Math.max(0, wear * (0.5 + 0.9 * n) - 0.08));
  if (worn <= 0) return 0.95;
  const grain = hash2(Math.floor(wx * 9), Math.floor(wy * 9));   // píxeles comidos dentro del tramo
  return Math.max(0.1, 0.95 - worn * (0.3 + 0.6 * grain));
}

const BALL_GREYS = ['#ffffff', '#ebebe8', '#cfd0cf', '#a9abab'];
// Parches grises del balón: centros repartidos por la esfera (vértices de un tetraedro).
const BALL_PATCH_GREYS = ['#b9bbba', '#a5a7a6', '#8f9291', '#7a7d7c'];
const BALL_PATCHES = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => v.map(c => c / Math.sqrt(3)));
const LINE_RGB = [214, 226, 206];
const MIN_DEPTH = 3;

// Cámara en perspectiva: elevada, desde la banda cercana, mirando hacia la banda lejana.
// Las líneas convergen, los jugadores lejanos se ven más pequeños
// y las porterías se ven de lado, con la red.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tilt = 0.6;        // inclinación hacia abajo (rad)
    this.dist = 55;         // distancia de la cámara al punto que mira (m)
    this.camX = L / 2;
    this.camY = CY;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.dpr = dpr;
    // Píxeles por metro en el punto que mira la cámara: los que hacen que el jugador
    // (SPRITE_H píxeles de dibujo = PLAYER.height metros) se vea a PIXEL px por píxel.
    // En un Mac de 1440 px caben unos 24 m de campo.
    this.s0 = PIXEL * SPRITE_H / PLAYER.height;
    this.focal = this.s0 * this.dist;
    this.cy = this.h * 0.56;
    this.setupCam();
  }

  setupCam() {
    this.ct = Math.cos(this.tilt); this.st = Math.sin(this.tilt);
    this.cyW = this.camY + this.dist * this.ct;   // posición de la cámara (y)
    this.czW = this.dist * this.st;               // altura de la cámara
  }

  depth(y, z = 0) { return (this.cyW - y) * this.ct + (this.czW - z) * this.st; }

  // Proyección de un punto del mundo a la pantalla: [x, y, escala].
  P(x, y, z = 0) {
    const dy = this.cyW - y, dz = this.czW - z;
    const d = Math.max(0.5, dy * this.ct + dz * this.st);
    const up = dy * this.st - dz * this.ct;
    const k = this.focal / d;
    return [this.w / 2 + (x - this.camX) * k, this.cy - up * k, k];
  }

  // Mayor y de suelo que queda delante de la cámara.
  get nearY() { return Math.min(W + 6, this.cyW + (this.czW * this.st - MIN_DEPTH) / this.ct); }

  updateCamera(match, dt) {
    const b = match.ball;
    const lead = b.owner ? b.owner.vx * 0.5 : b.vx * 0.3;
    const k = Math.min(1, dt * 3.5);
    this.camX += (b.x + lead - this.camX) * k;
    this.camY += (b.y - this.camY) * k * 0.8;
    // Si algo llegara a dar un valor inválido, la cámara vuelve al centro en vez de quedarse sin imagen.
    if (!Number.isFinite(this.camX)) this.camX = Number.isFinite(b.x) ? b.x : L / 2;
    if (!Number.isFinite(this.camY)) this.camY = Number.isFinite(b.y) ? b.y : CY;
    this.camX = Math.max(4, Math.min(L - 4, this.camX));
    this.camY = Math.max(14, Math.min(W - 10, this.camY));
    this.setupCam();
  }

  draw(match, humans) {
    // Ventana sin tamaño (minimizada, panel oculto…): no hay nada que dibujar.
    if (this.w < 1 || this.h < 1) return;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.setupCam();
    const near = this.nearY;
    const ref = match.referee;
    const b = match.ball;
    // Sombras: se pintan en la capa de píxeles del campo (ver pixelShadows).
    const shadows = [];
    for (const p of [...match.players, ref]) if (p.y < near) shadows.push([p.x, p.y, 0.42 * (1 - (p.z || 0) * 0.2), 0.30 - (p.z || 0) * 0.08]);
    // La del balón se hace más pequeña y tenue cuanto más alto va (a 4–5 m, menos de la mitad).
    if (b.y < near) shadows.push([b.x, b.y, 0.22 * Math.max(0.45, 1 - b.z * 0.12), Math.max(0.1, 0.30 - b.z * 0.04)]);
    this.wearMap = match.wear;
    this.drawPitch(shadows);

    // Objetos ordenados por profundidad (más lejos primero).
    const items = [];
    for (const g of [0, L]) {
      items.push({ y: CY - PITCH.goalWidth / 2 - 0.05, draw: () => this.goalBack(g) });
      items.push({ y: CY + PITCH.goalWidth / 2 + 0.05, draw: () => this.goalFront(g) });
    }
    for (const p of [...match.players, ref]) if (p.y < near) items.push({ y: p.y, draw: () => this.player(p) });
    if (b.y < near) items.push({ y: b.y + 0.01, draw: () => this.ball(b) });
    // El aro del jugador que manejas va en el suelo, por debajo de todos los dibujos.
    for (const h of humans) if (h.player && h.player.y < near) this.humanGround(h);
    items.sort((a, z) => a.y - z.y);
    for (const it of items) it.draw();

    for (const h of humans) if (h.player && h.player.y < near) this.humanMarker(h);
    this.edgeDots(match);
    this.hud(match, humans);
  }

  // ---------- Campo ----------

  poly(pts, fill) {
    const c = this.ctx;
    c.beginPath();
    pts.forEach(([x, y, z], i) => {
      const [sx, sy] = this.P(x, y, z || 0);
      if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy);
    });
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
  }

  // Línea en el suelo, recortada si pasa por detrás de la cámara.
  // No se traza aquí: se guarda y luego se pinta píxel a píxel (ver pixelLines).
  line(pts) {
    const near = this.nearY;
    for (let i = 0; i < pts.length - 1; i++) {
      let [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (y0 > near && y1 > near) continue;
      if (y0 > near) { const t = (near - y1) / (y0 - y1); x0 = x1 + (x0 - x1) * t; y0 = near; }
      if (y1 > near) { const t = (near - y0) / (y1 - y0); x1 = x0 + (x1 - x0) * t; y1 = near; }
      const a = this.P(x0, y0), b = this.P(x1, y1);
      // También se guardan los extremos en el campo: el desgaste va pegado al suelo, no a la pantalla.
      this.segs.push(a[0], a[1], b[0], b[1], (a[2] + b[2]) / 2, x0, y0, x1, y1);
    }
  }

  // Desgaste del partido en un punto del campo (interpolado entre celdas).
  wearAt(x, y) {
    const m = this.wearMap;
    if (!m) return 0;
    const fx = (x + WEAR_PAD) / WEAR_CELL - 0.5, fy = (y + WEAR_PAD) / WEAR_CELL - 0.5;
    const x0 = Math.max(0, Math.min(WEAR_W - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(WEAR_H - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0)), i = y0 * WEAR_W + x0;
    const a = m[i] + (m[i + 1] - m[i]) * tx, b = m[i + WEAR_W] + (m[i + WEAR_W + 1] - m[i + WEAR_W]) * tx;
    return a + (b - a) * ty;
  }

  // Pinta las líneas guardadas en la imagen de baja resolución, píxel a píxel (píxeles gordos),
  // con algunos tramos desgastados y un borde suave que las funde con el césped.
  pixelLines(img) {
    const d = img.data, w = img.width, h = img.height, [r, g, b] = LINE_RGB;
    const ink = new Float32Array(w * h);           // cuánta línea hay en cada píxel (0..1)
    const plot = (x, y, t, s) => {
      for (let yy = y; yy < y + t; yy++) for (let xx = x; xx < x + t; xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (s > ink[j]) ink[j] = s;
      }
    };
    const S = this.segs;
    for (let n = 0; n < S.length; n += 9) {
      // Grosor real de la línea (12 cm) en píxeles gordos: 1 o 2.
      const t = Math.max(1, Math.min(2, Math.round(0.12 * S[n + 4] / PIXEL)));
      let x0 = Math.round(S[n] / PIXEL - t / 2), y0 = Math.round(S[n + 1] / PIXEL - t / 2);
      const x1 = Math.round(S[n + 2] / PIXEL - t / 2), y1 = Math.round(S[n + 3] / PIXEL - t / 2);
      if (Math.max(x0, x1) < -t || Math.min(x0, x1) > w || Math.max(y0, y1) < -t || Math.min(y0, y1) > h) continue;
      const [wx0, wy0, wx1, wy1] = [S[n + 5], S[n + 6], S[n + 7], S[n + 8]];
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      const steps = Math.max(1, Math.max(dx, -dy));
      let err = dx + dy;
      for (let k = 0; k < 4000; k++) {
        const f = Math.min(1, k / steps), wx = wx0 + (wx1 - wx0) * f, wy = wy0 + (wy1 - wy0) * f;
        plot(x0, y0, t, lineStrength(wx, wy, this.wearAt(wx, wy)));
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    for (const [x, y, k] of this.dots) {
      const t = Math.max(2, Math.min(3, Math.round(0.3 * k / PIXEL)));
      plot(Math.round(x / PIXEL - t / 2), Math.round(y / PIXEL - t / 2), t, 0.95);
    }
    // Suavizado al estilo pixel art: solo en las esquinas de los escalones (el píxel de césped
    // que tiene línea a un lado Y arriba o abajo). Los tramos rectos quedan nítidos.
    const halo = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const j = y * w + x;
      if (ink[j] > 0) continue;
      const hor = Math.max(ink[j - 1], ink[j + 1]), ver = Math.max(ink[j - w], ink[j + w]);
      if (hor && ver) halo[j] = 0.42 * Math.min(hor, ver);
    }
    for (let j = 0; j < w * h; j++) {
      const a = Math.max(ink[j], halo[j]);
      if (a <= 0) continue;
      const i = j * 4;
      d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a;
    }
  }

  // Granitos del césped: puntos fijos en el campo (no en la pantalla), así no bailan con la cámara.
  grassGrain(img) {
    const d = img.data, w = img.width, h = img.height;
    const near = this.nearY, hit = new Uint8Array(w * h);
    // Franja de x visible: la más ancha es la del fondo del campo (allí cabe más campo en pantalla).
    const half = (this.w / 2) / this.P(this.camX, -6)[2] + 1;
    const b0 = Math.max(0, Math.floor(this.camX - half + 6)), b1 = Math.min(GRAIN.length - 1, Math.floor(this.camX + half + 6));
    for (let bi = b0; bi <= b1; bi++) for (const [gx, gy, kind, u] of GRAIN[bi]) {
      if (gy > near) continue;
      const [sx, sy, k] = this.P(gx, gy);
      // A lo lejos cada píxel cubre más césped: se descartan granitos para que la densidad
      // en pantalla sea la misma, y nunca caen dos en el mismo píxel.
      if (u > (k / this.s0) ** 2) continue;
      const x = Math.floor(sx / PIXEL), y = Math.floor(sy / PIXEL);
      if (x < 0 || y < 0 || x >= w || y >= h || hit[y * w + x]) continue;
      hit[y * w + x] = 1;
      const i = (y * w + x) * 4, f = kind === 0 ? 0.8 : kind === 1 ? 0.87 : kind === 2 ? 1.1 : 1.08;
      d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
      // Briznas de dos píxeles: la oscura se apaga hacia arriba; la mata clara tiene la punta más clara.
      if (y > 0 && (kind === 0 || kind === 3)) {
        const k = i - w * 4, g = kind === 0 ? 0.88 : 1.16;
        d[k] = Math.min(255, d[k] * g); d[k + 1] = Math.min(255, d[k + 1] * g); d[k + 2] = Math.min(255, d[k + 2] * g);
      }
    }
  }

  // Sombra en píxeles: elipse con tres escalones de intensidad, más oscura bajo los pies.
  pixelShadows(img, shadows) {
    const d = img.data, w = img.width, h = img.height;
    for (const [x, y, r, alpha] of shadows) {
      const [sx, sy, k] = this.P(x, y);
      const rx = r * k / PIXEL;
      const ry = Math.max(0.8, Math.abs(this.P(x, y + r)[1] - this.P(x, y - r)[1]) / 2 / PIXEL);
      const cx = sx / PIXEL, cy = sy / PIXEL;
      for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
        if (py < 0 || py >= h) continue;
        for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
          if (px < 0 || px >= w) continue;
          const e = ((px + 0.5 - cx) / rx) ** 2 + ((py + 0.5 - cy) / ry) ** 2;
          if (e > 1) continue;
          const a = alpha * (e < 0.3 ? 1 : e < 0.65 ? 0.62 : 0.3), i = (py * w + px) * 4, f = 1 - a;
          d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
        }
      }
    }
  }

  arc(cx, cy, r, a0, a1) {
    const pts = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    this.line(pts);
  }

  drawPitch(shadows = []) {
    // El césped y las líneas se pintan a la resolución del pixel art (1 píxel gordo = PIXEL px)
    // y luego se amplían sin suavizar, para que tengan el mismo estilo que los jugadores.
    const lw = Math.ceil(this.w / PIXEL), lh = Math.ceil(this.h / PIXEL);
    if (!this.low || this.low.width !== lw || this.low.height !== lh) {
      this.low = document.createElement('canvas');
      this.low.width = lw; this.low.height = lh;
      this.lowCtx = this.low.getContext('2d', { willReadFrequently: true });
    }
    const main = this.ctx, c = this.lowCtx;
    c.setTransform(1 / PIXEL, 0, 0, 1 / PIXEL, 0, 0);
    this.ctx = c;
    const near = this.nearY;
    c.fillStyle = '#2f7a35';
    c.fillRect(0, 0, this.w, this.h);

    // Franjas de césped.
    for (let i = -2; i < Math.ceil(L / 5.25) + 2; i++) {
      const x0 = i * 5.25, x1 = x0 + 5.25;
      this.poly([[x0, -4], [x1, -4], [x1, near], [x0, near]], i % 2 === 0 ? '#3a8f3f' : '#358539');
    }

    // Líneas: se recogen y se pintan píxel a píxel.
    this.segs = []; this.dots = [];
    this.line([[0, 0], [L, 0], [L, W], [0, W], [0, 0]]);
    this.line([[L / 2, 0], [L / 2, W]]);
    for (const [gx, d] of [[0, 1], [L, -1]]) {
      const bw = PITCH.boxWidth / 2, sw = PITCH.smallBoxWidth / 2;
      this.line([[gx, CY - bw], [gx + d * PITCH.boxDepth, CY - bw], [gx + d * PITCH.boxDepth, CY + bw], [gx, CY + bw]]);
      this.line([[gx, CY - sw], [gx + d * PITCH.smallBoxDepth, CY - sw], [gx + d * PITCH.smallBoxDepth, CY + sw], [gx, CY + sw]]);
      const px = gx + d * PITCH.penaltySpot;
      this.dot(px, CY);
      const th = Math.acos((PITCH.boxDepth - PITCH.penaltySpot) / PITCH.centerRadius);
      if (d > 0) this.arc(px, CY, PITCH.centerRadius, -th, th);
      else this.arc(px, CY, PITCH.centerRadius, Math.PI - th, Math.PI + th);
    }
    this.arc(L / 2, CY, PITCH.centerRadius, 0, Math.PI * 2);
    this.dot(L / 2, CY);
    for (const [x, y, a0] of [[0, 0, 0], [L, 0, Math.PI / 2], [L, W, Math.PI], [0, W, -Math.PI / 2]]) {
      this.arc(x, y, 1, a0, a0 + Math.PI / 2);
    }
    const img = c.getImageData(0, 0, lw, lh);
    this.grassGrain(img);
    this.pixelLines(img);
    this.pixelShadows(img, shadows);
    c.putImageData(img, 0, 0);

    this.ctx = main;
    main.imageSmoothingEnabled = false;
    main.drawImage(this.low, 0, 0, lw * PIXEL, lh * PIXEL);
    main.imageSmoothingEnabled = true;
  }

  dot(x, y) {
    if (y > this.nearY) return;
    this.dots.push(this.P(x, y));
  }

  groundEllipse(x, y, r, fill) {
    const c = this.ctx;
    const [sx, sy, k] = this.P(x, y);
    const ry = Math.abs(this.P(x, y + r)[1] - this.P(x, y - r)[1]) / 2;
    c.fillStyle = fill;
    c.beginPath();
    c.ellipse(sx, sy, r * k, Math.max(0.5, ry), 0, 0, Math.PI * 2);
    c.fill();
  }

  shadow(x, y, r, alpha) { this.groundEllipse(x, y, r, `rgba(0,0,0,${alpha})`); }

  // ---------- Porterías ----------

  goalPts(gx) {
    const o = gx === 0 ? -1 : 1;
    return {
      y1: CY - PITCH.goalWidth / 2, y2: CY + PITCH.goalWidth / 2,
      H: PITCH.goalHeight, bx: gx + o * PITCH.goalDepth,
      P: (x, y, z) => this.P(x, y, z).slice(0, 2),
    };
  }

  goalVisible(gx) {
    const [sx] = this.P(gx, CY);
    return sx > -this.w * 0.5 && sx < this.w * 1.5;
  }

  netQuad(a, b, d, e) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...d); c.lineTo(...e); c.closePath();
    c.fill(); c.stroke();
  }

  goalBack(gx) {
    if (!this.goalVisible(gx)) return;
    const c = this.ctx;
    const { y1, y2, H, P, bx } = this.goalPts(gx);
    const hb = H * 0.8;
    c.fillStyle = 'rgba(255,255,255,0.13)';
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 1;
    // Fondo, techo y lateral lejano de la red.
    this.netQuad(P(bx, y1, 0), P(bx, y2, 0), P(bx, y2, hb), P(bx, y1, hb));
    this.netQuad(P(gx, y1, H), P(gx, y2, H), P(bx, y2, hb), P(bx, y1, hb));
    this.netQuad(P(gx, y1, 0), P(bx, y1, 0), P(bx, y1, hb), P(gx, y1, H));
    // Malla.
    c.beginPath();
    for (let i = 1; i < 10; i++) {
      const y = y1 + (y2 - y1) * i / 10;
      c.moveTo(...P(bx, y, 0)); c.lineTo(...P(bx, y, hb)); c.lineTo(...P(gx, y, H));
    }
    for (let i = 1; i < 5; i++) {
      const z = hb * i / 5;
      c.moveTo(...P(gx, y1, z * H / hb)); c.lineTo(...P(bx, y1, z)); c.lineTo(...P(bx, y2, z));
    }
    for (let i = 1; i < 4; i++) {
      const x = gx + (bx - gx) * i / 4;
      const z = H + (hb - H) * i / 4;
      c.moveTo(...P(x, y1, 0)); c.lineTo(...P(x, y1, z)); c.lineTo(...P(x, y2, z));
    }
    c.stroke();
    this.post(gx, y1);
  }

  goalFront(gx) {
    if (!this.goalVisible(gx)) return;
    const c = this.ctx;
    const { y1, y2, H, P, bx } = this.goalPts(gx);
    const hb = H * 0.8;
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 1;
    this.netQuad(P(gx, y2, 0), P(bx, y2, 0), P(bx, y2, hb), P(gx, y2, H));
    c.beginPath();
    for (let i = 1; i < 4; i++) {
      const x = gx + (bx - gx) * i / 4;
      c.moveTo(...P(x, y2, 0)); c.lineTo(...P(x, y2, H + (hb - H) * i / 4));
    }
    c.stroke();
    this.post(gx, y2);
    // Larguero.
    const k = this.P(gx, CY)[2];
    c.strokeStyle = '#f4f4f4';
    c.lineWidth = Math.max(2, k * 0.12);
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(...P(gx, y1, H)); c.lineTo(...P(gx, y2, H)); c.stroke();
  }

  post(gx, y) {
    const c = this.ctx;
    const a = this.P(gx, y, 0), b = this.P(gx, y, PITCH.goalHeight);
    c.strokeStyle = '#f4f4f4';
    c.lineWidth = Math.max(2, a[2] * 0.12);
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }

  // ---------- Jugadores ----------

  player(p) {
    const c = this.ctx;
    const [x, y, u] = this.P(p.x, p.y);
    const m = SPRITE_H * PIXEL;
    if (x < -m || x > this.w + m || y < -m || y > this.h + m * 2) return;

    // Animación según la velocidad: quieto, andar (si existe el dibujo) o correr.
    // Los pasos avanzan con la distancia recorrida, así los pies no patinan:
    // STRIDE = metros que avanza el jugador en un ciclo completo de la animación (dos pasos).
    const speed = Math.hypot(p.vx, p.vy);
    const moving = p.state === 'normal' && speed > 0.6;
    let anim = 'quieto', bob = 0;
    if (moving && hasAnim('andar') && speed < WALK_MAX) anim = 'andar';
    else if (moving && hasAnim('correr')) anim = 'correr';
    else if (moving) bob = Math.floor(p.anim / 0.95) % 2;
    // Entrada, caída y estirada: aún sin dibujo propio, se gira el de lado.
    const tilted = p.state === 'slide' || p.state === 'fallen' || p.state === 'dive' || p.state === 'getup';
    const face = p.fx >= 0 ? 1 : -1;
    const { dir, mirror } = tilted ? pickDir(anim, face, 0) : pickDir(anim, p.fx, p.fy);
    const frame = anim === 'quieto'
      ? Math.floor(performance.now() / 1000 * (ANIM_FPS.quieto || 2) + (p.index || 0) * 0.37)
      : Math.floor(p.anim / 1.6 / STRIDE[anim] * frameCount(anim, dir));
    const spr = playerSprite(p.kit || kitFor(p.team, p.isGK), anim, dir, frame, p.number);

    c.save();
    // Pies en el punto del suelo, ajustados a píxel entero para que el pixel art no se emborrone.
    // Saltando, el dibujo sube (a la escala de los sprites) y la sombra se queda en el suelo.
    const lift = Math.round((p.z || 0) * this.s0 / PIXEL) * PIXEL;
    c.translate(Math.round(x), Math.round(y) - bob * PIXEL - lift);
    if (p.state === 'slide') c.rotate(-face * 1.2);
    else if (p.state === 'fallen') c.rotate(face * 1.45);
    else if (p.state === 'dive') { c.translate(0, -0.5 * u); c.rotate((p.vy > 0 ? 1 : -1) * face * 1.3); }
    else if (p.state === 'getup') {
      // Levantándose (aún sin dibujo propio): sigue tumbado un rato y luego se va incorporando.
      const base = p.getUpFrom === 'slide' ? -face * 1.2 : face * (p.getUpFrom === 'dive' ? 1.3 : 1.45);
      const t = 1 - Math.max(0, p.stateT) / (p.getUpTime || 1);
      c.rotate(base * (t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45));
    }
    if (mirror) c.scale(-1, 1);
    c.imageSmoothingEnabled = false;
    // Todos los jugadores con el mismo tamaño de píxel, estén cerca o lejos.
    c.drawImage(spr.canvas, -spr.ax * PIXEL, -spr.ay * PIXEL, spr.canvas.width * PIXEL, spr.canvas.height * PIXEL);
    c.restore();

    // Cansancio: tres puntos encima de la cabeza (el jugador que manejas lo lleva en el aro del suelo).
    if (p.stamina !== undefined && !p.human && p.state !== 'slide' && p.state !== 'fallen' && p.state !== 'dive') {
      const dots = FATIGUE_DOTS[p.fatigueLevel];
      const S = 2, G = 1, w = (3 * S + 2 * G) * PIXEL;
      const bx = snap(x - w / 2), by = snap(y - lift - (SPRITE_H + 3 + S) * PIXEL);
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(bx - PIXEL, by - PIXEL, w + 2 * PIXEL, (S + 2) * PIXEL);
      for (let i = 0; i < 3; i++) {
        c.fillStyle = FATIGUE_COLORS[dots[i]];
        c.fillRect(bx + i * (S + G) * PIXEL, by, S * PIXEL, S * PIXEL);
      }
    }
  }

  // Balón en píxeles: blanco, sin contorno, con volumen en grises (luz de arriba a la izquierda).
  ball(b) {
    const c = this.ctx;
    const [x, y, k] = this.P(b.x, b.y, b.z);
    const r = Math.max(2.2, k * 0.16 / PIXEL);            // radio en píxeles gordos (más grande que el real, estilo arcade)
    const cx = Math.round(x / PIXEL), cy = Math.round(y / PIXEL - r);
    const n = Math.ceil(r);
    // Dirección en la que rueda, vista en pantalla (se recuerda la última si se para).
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0.3) { const dx = b.vx, dy = b.vy * this.st, l = Math.hypot(dx, dy) || 1; this.ballDir = [dx / l, dy / l]; }
    const [ux, uy] = this.ballDir || [1, 0];
    const cr = Math.cos(b.rot), sr = Math.sin(b.rot);
    for (let py = -n; py <= n; py++) for (let px = -n; px <= n; px++) {
      const qx = px / r, qy = py / r;
      const e = qx * qx + qy * qy;
      if (e > 0.94) continue;                               // sin píxeles sueltos en los extremos
      // Luz: más clara arriba a la izquierda, más oscura abajo a la derecha y en el borde.
      const lit = -0.55 * qx - 0.75 * qy + 0.35 * (1 - e);
      const shade = lit > 0.35 ? 0 : lit > -0.05 ? 1 : lit > -0.45 ? 2 : 3;
      // Punto de la esfera bajo este píxel, girado hacia atrás lo que ha rodado el balón:
      // si cae cerca de un parche, el píxel es gris.
      const qz = Math.sqrt(Math.max(0, 1 - e));
      const a = qx * ux + qy * uy, w = -qx * uy + qy * ux;   // a lo largo del movimiento / de lado
      const a2 = a * cr - qz * sr, z2 = a * sr + qz * cr;
      let patch = false;
      for (const [pa, pw, pz] of BALL_PATCHES) if (a2 * pa + w * pw + z2 * pz > 0.86) { patch = true; break; }
      c.fillStyle = (patch ? BALL_PATCH_GREYS : BALL_GREYS)[shade];
      c.fillRect((cx + px) * PIXEL, (cy + py) * PIXEL, PIXEL, PIXEL);
    }
  }

  // Aro del jugador que manejas, en el suelo. Dentro, su cansancio: verde, naranja o rojo
  // translúcido, en degradado de oscuro a claro, girando hacia donde corre (más rápido cuanto más corre).
  humanGround(h) {
    const c = this.ctx, p = h.player;
    const [x, y, u] = this.P(p.x, p.y);
    const R = 0.45;                                       // radio del aro en metros
    const rx = R * u, ry = Math.max(PIXEL * 1.5, Math.abs(this.P(p.x, p.y + R)[1] - this.P(p.x, p.y - R)[1]) / 2);
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - (h.ringT ?? now)); h.ringT = now;
    const sp = Math.hypot(p.vx, p.vy);
    h.ringRot = (h.ringRot || 0) + (p.fx >= 0 ? 1 : -1) * (1 + sp * 0.5) * dt;
    const [r, g, b] = RING_RGB[Math.min(2, Math.floor((p.fatigueLevel + 1) / 2))];
    const RX = rx / PIXEL, RY = ry / PIXEL, ox = x / PIXEL, oy = y / PIXEL;
    for (let j = Math.floor(oy - RY); j <= Math.ceil(oy + RY); j++) {
      for (let i = Math.floor(ox - RX); i <= Math.ceil(ox + RX); i++) {
        const qx = (i + 0.5 - ox) / RX, qy = (j + 0.5 - oy) / RY;
        if (qx * qx + qy * qy > 1) continue;
        // Degradado por ángulo en 4 escalones (pixel art), del tono oscuro al claro.
        let t = (Math.atan2(qy, qx) - h.ringRot) / (Math.PI * 2);
        t -= Math.floor(t);
        const k = 0.5 + 0.5 * (Math.floor(t * 4) / 3);
        c.fillStyle = `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},0.5)`;
        c.fillRect(i * PIXEL, j * PIXEL, PIXEL, PIXEL);
      }
    }
    pixelEllipseRing(c, x, y, rx, ry, HUMAN_COLORS[h.id]);
  }

  // Encima de la cabeza del jugador que manejas: el medidor de fuerza.
  humanMarker(h) {
    const c = this.ctx, p = h.player;
    const [x, y] = this.P(p.x, p.y);

    // Medidor: 8 rayitas verticales que se encienden de izquierda a derecha (flojo → fuerte).
    // En automático va y viene solo; manteniendo el botón lo cargas tú y se subraya en blanco.
    const m = h.meter;
    const N = 8, TW = 1, GAP = 1, TH = 5;                 // en píxeles de dibujo
    const w = (N * TW + (N - 1) * GAP) * PIXEL;
    const lift = Math.round((p.z || 0) * this.s0 / PIXEL) * PIXEL;
    const bx = snap(x - w / 2), by = snap(y - lift - (SPRITE_H + 4 + TH) * PIXEL);
    let lit = Math.round(m.value * N);
    if (m.value > 0.02) lit = Math.max(1, lit);
    for (let i = 0; i < N; i++) {
      c.fillStyle = i < lit ? METER_COLORS[i] : 'rgba(0,0,0,0.35)';
      c.fillRect(bx + i * (TW + GAP) * PIXEL, by, TW * PIXEL, TH * PIXEL);
    }
    if (m.manual) {
      c.fillStyle = '#ffffff';
      c.fillRect(bx, by + (TH + 1) * PIXEL, w, PIXEL);
    }
  }

  // ---------- Indicadores en los bordes ----------

  // Jugadores fuera de cámara: un triángulo de píxeles gordos del color de la camiseta en el borde
  // de la pantalla por el que quedan fuera (izquierda, derecha, arriba o abajo), apuntando hacia
  // donde mira el jugador. En los laterales va a su altura en pantalla; arriba y abajo, a su x.
  // Cuanto más cerca está el jugador de entrar en pantalla, más se separa el triángulo del borde
  // (hacia dentro) y algo más grande se hace. Cuando el jugador empieza a asomar, el triángulo
  // se desliza hacia él y se desvanece hasta fundirse con el sprite.
  edgeDots(match) {
    const c = this.ctx;
    const APPROACH = 25;                          // metros fuera de pantalla a los que el triángulo empieza a acercarse
    const MIN_N = 6, MAX_N = 11;                  // tamaño en píxeles de dibujo: lejos / a punto de entrar
    const EDGE = 4 * PIXEL, INSET = 24 * PIXEL;   // separación del borde: lejos / a punto de entrar
    const dots = [];
    for (const p of match.players) {
      const [sx, sy, k] = this.P(p.x, Math.min(p.y, this.nearY), PLAYER.height / 2);
      const hw = 0.5 * k, hh = 0.5 * PLAYER.height * k;   // medio ancho y medio alto del sprite
      // Px que le faltan al sprite para empezar a asomar por cada borde (negativo: ya asoma),
      // y cuánto mide el sprite en esa dirección (para el desvanecido).
      const sides = [
        ['L', -(sx + hw), 2 * hw], ['R', sx - hw - this.w, 2 * hw],
        ['T', -(sy + hh), 2 * hh], ['B', sy - hh - this.h, 2 * hh],
      ];
      // El borde por el que más fuera está; si el sprite ya está entero dentro, no hay triángulo.
      let [side, off, span] = sides[0];
      for (const s of sides) if (s[1] / s[2] > off / span) [side, off, span] = s;
      if (off <= -span) continue;
      const t = off > 0 ? Math.max(0, Math.min(1, 1 - off / k / APPROACH)) : 1;   // 0 lejos, 1 a punto de entrar
      const fade = off > 0 ? 0 : Math.min(1, -off / span);                         // 0 → 1 mientras asoma
      dots.push({ p, side, sx, sy, t, fade });
    }
    dots.sort((a, z) => a.t - z.t);               // los cercanos (grandes) encima
    const hud = this.hudBox;
    for (const { p, side, sx, sy, t, fade } of dots) {
      const n = Math.round(MIN_N + (MAX_N - MIN_N) * t);
      const size = n * PIXEL, r = size / 2;
      const inset = EDGE + (INSET - EDGE) * t;
      const clampX = v => Math.max(EDGE + r, Math.min(this.w - EDGE - r, v));
      const clampY = v => Math.max(EDGE + r, Math.min(this.h - EDGE - r, v));
      // Centro junto al borde.
      let ex, ey;
      if (side === 'L') { ex = inset + r; ey = clampY(sy); }
      else if (side === 'R') { ex = this.w - inset - r; ey = clampY(sy); }
      else if (side === 'B') { ex = clampX(sx); ey = this.h - inset - r; }
      else {
        ex = clampX(sx);
        // Arriba, si cae bajo el marcador, se coloca por debajo de él.
        const top = hud && ex + r > hud.x0 && ex - r < hud.x1 ? hud.bottom : 0;
        ey = top + inset + r;
      }
      // Al asomar, se desliza hacia el jugador.
      const x = snap(ex + (sx - ex) * fade - r);
      const y = snap(ey + (sy - ey) * fade - r);
      c.globalAlpha = 1 - fade;
      // Dirección en pantalla hacia la que mira (la profundidad se ve acortada por la inclinación).
      const dx = p.fx, dy = p.fy * this.st;
      if (p.human) pixelTriangle(c, x, y, n, dx, dy, HUMAN_COLORS[p.human.id] || '#ffd23f', 2);
      pixelTriangle(c, x, y, n, dx, dy, 'rgb(22,62,26)', 1);
      pixelTriangle(c, x, y, n, dx, dy, p.team.color.shirt, 0);
    }
    c.globalAlpha = 1;
  }

  // ---------- Marcador ----------

  // Marcador y tácticas con letras de píxeles gordos sobre paneles de esquinas recortadas.
  hud(match, humans) {
    const c = this.ctx;
    const pad = 7 * PIXEL;
    const [h, a] = [match.home, match.away];
    const big = 3;                                              // tamaño de píxel de las letras del marcador
    const txt = `${h.name}  ${h.score} - ${a.score}  ${a.name}`;
    const min = match.training ? 'ENTRENO' : `${match.minute}'`;
    const tW = pixelTextWidth(txt) * big, mW = pixelTextWidth(min) * big;
    const sw = 5 * PIXEL, gap = 6 * PIXEL;                      // muestras de color de cada equipo
    const tw = snap(gap + sw + gap + tW + gap + sw + gap + mW + gap);
    const th = 17 * PIXEL;
    const x0 = snap(this.w / 2 - tw / 2), y0 = pad, mid = y0 + th / 2;
    pixelPanel(c, x0, y0, tw, th, 'rgba(10,14,20,0.78)');
    c.fillStyle = h.color.shirt; c.fillRect(x0 + gap, snap(mid - 4 * PIXEL), sw, 8 * PIXEL);
    drawPixelText(c, txt, x0 + 2 * gap + sw + tW / 2, mid, big, '#fff', false);
    const ax = x0 + 3 * gap + sw + tW;
    c.fillStyle = a.color.shirt; c.fillRect(ax, snap(mid - 4 * PIXEL), sw, 8 * PIXEL);
    drawPixelText(c, min, ax + sw + gap + mW / 2, mid, big, '#ffd23f', false);

    const tac = `${h.formation} · ${h.tactic.label}     ${a.formation} · ${a.tactic.label}`;
    const tw2 = snap(pixelTextWidth(tac) * PIXEL + 10 * PIXEL), th2 = 11 * PIXEL;
    const y2 = y0 + th + 2 * PIXEL;
    pixelPanel(c, snap(this.w / 2 - tw2 / 2), y2, tw2, th2, 'rgba(10,14,20,0.6)');
    drawPixelText(c, tac, this.w / 2, y2 + th2 / 2, PIXEL, 'rgba(255,255,255,0.9)', false);
    // Zona que ocupa el marcador: los triángulos de arriba se ponen por debajo (ver edgeDots).
    this.hudBox = { x0: Math.min(x0, this.w / 2 - tw2 / 2), x1: Math.max(x0 + tw, this.w / 2 + tw2 / 2), bottom: y2 + th2 };

    if (match.messageT > 0) {
      // Mensajes en letras de píxeles gordos, sin contorno. Se encogen si no caben.
      const goal = match.state === 'goal';
      const fit = px => Math.min(px, Math.floor(this.w * 0.92 / pixelTextWidth(match.message)));
      const px = fit(goal ? PIXEL * 6 : PIXEL * 3);
      drawPixelText(c, match.message, this.w / 2, this.h * 0.3, px, goal ? '#ffd23f' : '#f4f4ec');
      if (match.state === 'end') {
        const t = 'Pulsa Esc o toca para volver al menú';
        drawPixelText(c, t, this.w / 2, this.h * 0.3 + 9 * px, Math.min(PIXEL * 1.5, Math.floor(this.w * 0.92 / pixelTextWidth(t))), '#f4f4ec');
      }
    }
  }
}

// Ajusta una coordenada de pantalla a la rejilla de píxeles gordos.
const snap = v => Math.round(v / PIXEL) * PIXEL;

// Panel con las esquinas recortadas un píxel gordo (el «redondeado» del pixel art).
function pixelPanel(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x + PIXEL, y, w - 2 * PIXEL, PIXEL);
  c.fillRect(x, y + PIXEL, w, h - 2 * PIXEL);
  c.fillRect(x + PIXEL, y + h - PIXEL, w - 2 * PIXEL, PIXEL);
}

// Elipse hueca de un píxel gordo de grosor, centrada en (cx, cy) con radios rx, ry en px de pantalla.
function pixelEllipseRing(c, cx, cy, rx, ry, color) {
  const RX = rx / PIXEL, RY = ry / PIXEL, ox = cx / PIXEL, oy = cy / PIXEL;
  const inside = (i, j, a, b) => ((i + 0.5 - ox) / a) ** 2 + ((j + 0.5 - oy) / b) ** 2 <= 1;
  c.fillStyle = color;
  for (let j = Math.floor(oy - RY - 1); j <= Math.ceil(oy + RY + 1); j++)
    for (let i = Math.floor(ox - RX - 1); i <= Math.ceil(ox + RX + 1); i++)
      if (inside(i, j, RX + 0.5, RY + 0.5) && !inside(i, j, Math.max(0.1, RX - 0.5), Math.max(0.1, RY - 0.5)))
        c.fillRect(i * PIXEL, j * PIXEL, PIXEL, PIXEL);
}

// Triángulo de píxeles gordos dentro de un cuadrado de n píxeles de dibujo con esquina en (x, y),
// con la punta hacia (dx, dy). grow > 0 lo engorda esos píxeles (para contornos).
function pixelTriangle(c, x, y, n, dx, dy, color, grow) {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l, vx = -uy, vy = ux;
  const r = n / 2, cx = n / 2, cy = n / 2;
  // Vértices: punta y dos de la base (base algo más estrecha que el alto).
  const A = [cx + ux * r, cy + uy * r];
  const B = [cx - ux * r * 0.7 + vx * r * 0.85, cy - uy * r * 0.7 + vy * r * 0.85];
  const C = [cx - ux * r * 0.7 - vx * r * 0.85, cy - uy * r * 0.7 - vy * r * 0.85];
  const edge = (P, Q, px, py) => ((Q[0] - P[0]) * (py - P[1]) - (Q[1] - P[1]) * (px - P[0])) /
    Math.hypot(Q[0] - P[0], Q[1] - P[1]);
  const sgn = Math.sign(edge(A, B, C[0], C[1])) || 1;
  c.fillStyle = color;
  for (let j = -grow; j < n + grow; j++) for (let i = -grow; i < n + grow; i++) {
    const px = i + 0.5, py = j + 0.5;
    if (sgn * edge(A, B, px, py) >= -grow && sgn * edge(B, C, px, py) >= -grow && sgn * edge(C, A, px, py) >= -grow) {
      c.fillRect(x + i * PIXEL, y + j * PIXEL, PIXEL, PIXEL);
    }
  }
}
