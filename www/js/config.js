// Constantes del juego. Unidades: metros, segundos.

export const PITCH = {
  // Medidas reales de un campo reglamentario.
  length: 105,
  width: 68,
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
  dribbleSpeed: 0.83,    // con el balón se corre algo más despacio (83 %): obliga a ir a toques
  accel: 22,
  turnRate: 12,          // velocidad de giro (rad/s): media vuelta en ~0,26 s
  controlDist: 0.8,      // radio de control: dentro de él, el jugador se hace con el balón y lo atrae al pie
  controlMaxSpeed: 15,   // por encima de esto el balón rebota en vez de controlarse
  kickCooldown: 0.35,
  slideTime: 0.55,
  tackleRange: 3.5,      // solo hay entrada si un rival que disputa el balón está a menos de esto
  burstTime: 0.6,        // acelerón: duración (s)
  burstSpeed: 1.18,      // acelerón: cuánto más rápido
  burstCooldown: 1.2,    // tiempo mínimo entre acelerones
  slideSpeed: 10,
  fallTime: 1.0,
  // Levantarse del suelo (segundos, al azar entre los dos valores): tirarse a por el balón
  // o caer tiene un precio, aunque recuperes la pelota pierdes tiempo.
  getUp: { slide: [0.8, 1.3], fallen: [0.5, 0.9], dive: [0.5, 0.8] },
  jumpSpeed: 4.0,
  // Conducción a toques: el balón nunca va pegado al pie.
  trapTime: 0.25,        // al hacerse con el balón, tiempo que tarda en colocárselo delante
  trapPull: 14,          // fuerza con la que lo atrae (más = más rápido)
  touchReach: 0.6,       // distancia a la que puede tocar el balón al correr
  touchSide: 0.55,       // cuánto puede estar el balón a un lado y aún tocarlo
  touchCooldown: 0.26,   // tiempo mínimo entre toques
  touchPush: 1.18,       // el balón sale a esta proporción de su velocidad (algo más rápido que él)
  loseDist: 2.4,         // si el balón se aleja más que esto, deja de tenerlo
  kickReach: 1.0,        // distancia a la que puede golpear el balón        // velocidad de despegue del salto (≈ 0,8 m de altura)
  headReach: 0.9,        // distancia horizontal a la que llega de cabeza
};

// Cansancio. Cada jugador tiene una energía de 1 (fresco) a 0 (agotado), medida en minutos de
// partido (así cansa igual un partido de 2 minutos por parte que uno de 8).
// 5 niveles: verde, verde-naranja, naranja, naranja-rojo y rojo. Cada uno rinde menos.
export const FATIGUE = {
  levels: [0.8, 0.6, 0.4, 0.2],       // energía mínima de los niveles 0..3 (por debajo de 0.2, nivel 4)
  speed: [1, 0.97, 0.93, 0.85, 0.55], // velocidad máxima en cada nivel (en rojo, apenas corre)
  accel: [1, 0.97, 0.92, 0.82, 0.6],  // y aceleración
  drain: 0.020,                       // gasto por minuto de partido corriendo a tope
  ballDrain: 1.3,                     // conducir el balón cansa algo más
  burstDrain: 3,                      // y el acelerón, mucho más
  recover: 0.012,                     // recuperación por minuto de partido parado
  walk: 2.2,                          // por debajo de esta velocidad (m/s) ya se recupera algo
  halfTime: 0.15,                     // lo que se recupera en el descanso
};

export const KICK = {
  // Con fuerza 0 el balón apenas avanza un par de metros (toque); con fuerza 1, un chut.
  // La curva (potencia > 1) da más precisión en los pases flojos.
  groundMin: 3, groundMax: 31,
  loftMin: 5, loftMax: 25,
  loftVzMin: 3, loftVzMax: 11,
  curve: 1.3,
  // Medidor de fuerza (segundos).
  autoUp: 1.0,           // automático: de flojo a fuerte
  autoDown: 0.5,         // automático: de vuelta a flojo
  manualUp: 2.0,         // manteniendo el botón: de flojo a fuerte (y lo mismo de vuelta)
  holdTime: 0.2,         // a partir de aquí la pulsación cuenta como «mantener»
  assistMin: 0.13,       // por debajo de esta fuerza no hay ayuda al pase (es un toque)
  touchPower: 0.02,      // toque cortito si te pasas de fuerza y el medidor vuelve a cero
  queueTime: 0.4,        // si el balón no está al alcance, el golpeo espera hasta esto
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
