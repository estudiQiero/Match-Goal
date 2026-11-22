// Constantes del juego. Unidades: metros, segundos.

export const PITCH = {
  // Más pequeño que uno real (105 × 68): con la cámara cerca, se corre menos y hay más juego.
  // Porterías, áreas y círculo central mantienen su medida real.
  length: 84,
  width: 54,
  goalWidth: 7.32,
  goalHeight: 2.44,
  goalDepth: 2,
  boxDepth: 16.5,
  boxWidth: 40.32,
  smallBoxDepth: 5.5,
  smallBoxWidth: 18.32,
  penaltySpot: 11,
  centerRadius: 9.15,
};

export const BALL = {
  radius: 0.11,
  gravity: 9.81,
  groundDecel: 3.2,      // frenado al rodar (m/s²)
  airDrag: 0.12,         // resistencia del aire (proporcional)
  bounce: 0.55,          // rebote vertical contra el suelo
  bounceFriction: 0.82,  // pérdida horizontal en cada bote
  postRadius: 0.06,
  postBounce: 0.7,
};

export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  speed: 6.8,
  sprint: 8.2,
  accel: 22,
  controlDist: 0.75,
  controlMaxSpeed: 15,   // por encima de esto el balón rebota en vez de controlarse
  kickCooldown: 0.35,
  slideTime: 0.55,
  slideSpeed: 10,
  fallTime: 1.0,
};

export const KICK = {
  chargeTime: 0.75,      // tiempo en llenar el medidor
  groundMin: 9, groundMax: 31,
  loftMin: 9, loftMax: 25,
  loftVzMin: 5, loftVzMax: 11,
  headerSpeed: 14,
  volleySpeed: 22,
};

export const COLORS = [
  { name: 'Rojo', shirt: '#d63a3a', shorts: '#ffffff' },
  { name: 'Azul', shirt: '#2f6fe0', shorts: '#16285a' },
  { name: 'Verde', shirt: '#1f9d55', shorts: '#ffffff' },
  { name: 'Amarillo', shirt: '#f2c230', shorts: '#1b1b1b' },
  { name: 'Blanco', shirt: '#f4f4f4', shorts: '#1b1b1b' },
  { name: 'Negro', shirt: '#262626', shorts: '#e8e8e8' },
  { name: 'Naranja', shirt: '#f07b22', shorts: '#1b1b1b' },
  { name: 'Morado', shirt: '#7b4bd1', shorts: '#ffffff' },
];
