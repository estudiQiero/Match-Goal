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
  accel: 22,
  controlDist: 0.75,
  controlMaxSpeed: 15,   // por encima de esto el balón rebota en vez de controlarse
  kickCooldown: 0.35,
  slideTime: 0.55,
  slideSpeed: 10,
  fallTime: 1.0,
  jumpSpeed: 4.0,
  // Conducción a toques: el balón nunca va pegado al pie.
  touchReach: 0.6,       // distancia a la que puede tocar el balón al correr
  touchSide: 0.55,       // cuánto puede estar el balón a un lado y aún tocarlo
  touchCooldown: 0.26,   // tiempo mínimo entre toques
  touchPush: 1.18,       // el balón sale a esta proporción de su velocidad (algo más rápido que él)
  loseDist: 2.4,         // si el balón se aleja más que esto, deja de tenerlo
  kickReach: 1.0,        // distancia a la que puede golpear el balón        // velocidad de despegue del salto (≈ 0,8 m de altura)
  headReach: 0.9,        // distancia horizontal a la que llega de cabeza
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
  doubleTap: 0.2,        // tiempo para la segunda pulsación de un doble toque
  tapPower: 0.12,        // fuerza del pase corto de la doble pulsación
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
