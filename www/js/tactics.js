// Formaciones: cada jugador tiene una posición base.
//  d = profundidad (0 = propia portería, 1 = portería rival)
//  w = anchura (0 = banda izquierda mirando al ataque, 1 = banda derecha)
// El primero siempre es el portero.

const GK = { d: 0, w: 0.5, role: 'GK' };

export const FORMATIONS = {
  '4-4-2': [
    GK,
    { d: 0.22, w: 0.12, role: 'DF' }, { d: 0.18, w: 0.37, role: 'DF' },
    { d: 0.18, w: 0.63, role: 'DF' }, { d: 0.22, w: 0.88, role: 'DF' },
    { d: 0.50, w: 0.12, role: 'MF' }, { d: 0.46, w: 0.38, role: 'MF' },
    { d: 0.46, w: 0.62, role: 'MF' }, { d: 0.50, w: 0.88, role: 'MF' },
    { d: 0.80, w: 0.38, role: 'FW' }, { d: 0.80, w: 0.62, role: 'FW' },
  ],
  '4-3-3': [
    GK,
    { d: 0.22, w: 0.12, role: 'DF' }, { d: 0.18, w: 0.37, role: 'DF' },
    { d: 0.18, w: 0.63, role: 'DF' }, { d: 0.22, w: 0.88, role: 'DF' },
    { d: 0.42, w: 0.5, role: 'MF' }, { d: 0.52, w: 0.28, role: 'MF' },
    { d: 0.52, w: 0.72, role: 'MF' },
    { d: 0.80, w: 0.15, role: 'FW' }, { d: 0.85, w: 0.5, role: 'FW' },
    { d: 0.80, w: 0.85, role: 'FW' },
  ],
  '3-5-2': [
    GK,
    { d: 0.18, w: 0.25, role: 'DF' }, { d: 0.16, w: 0.5, role: 'DF' },
    { d: 0.18, w: 0.75, role: 'DF' },
    { d: 0.52, w: 0.08, role: 'MF' }, { d: 0.42, w: 0.36, role: 'MF' },
    { d: 0.40, w: 0.5, role: 'MF' }, { d: 0.42, w: 0.64, role: 'MF' },
    { d: 0.52, w: 0.92, role: 'MF' },
    { d: 0.80, w: 0.4, role: 'FW' }, { d: 0.80, w: 0.6, role: 'FW' },
  ],
  '5-3-2': [
    GK,
    { d: 0.26, w: 0.08, role: 'DF' }, { d: 0.17, w: 0.3, role: 'DF' },
    { d: 0.15, w: 0.5, role: 'DF' }, { d: 0.17, w: 0.7, role: 'DF' },
    { d: 0.26, w: 0.92, role: 'DF' },
    { d: 0.44, w: 0.3, role: 'MF' }, { d: 0.42, w: 0.5, role: 'MF' },
    { d: 0.44, w: 0.7, role: 'MF' },
    { d: 0.76, w: 0.4, role: 'FW' }, { d: 0.76, w: 0.6, role: 'FW' },
  ],
  '4-2-3-1': [
    GK,
    { d: 0.22, w: 0.12, role: 'DF' }, { d: 0.18, w: 0.37, role: 'DF' },
    { d: 0.18, w: 0.63, role: 'DF' }, { d: 0.22, w: 0.88, role: 'DF' },
    { d: 0.38, w: 0.4, role: 'MF' }, { d: 0.38, w: 0.6, role: 'MF' },
    { d: 0.62, w: 0.15, role: 'MF' }, { d: 0.62, w: 0.5, role: 'MF' },
    { d: 0.62, w: 0.85, role: 'MF' },
    { d: 0.85, w: 0.5, role: 'FW' },
  ],
};

// Mentalidad: cuánto adelanta la línea y cuánto presiona el equipo.
export const MENTALITIES = {
  defensiva:  { label: 'Defensiva',  push: -0.08, press: 1, risk: 0.25 },
  equilibrada:{ label: 'Equilibrada',push: 0,     press: 2, risk: 0.5 },
  ofensiva:   { label: 'Ofensiva',   push: 0.08,  press: 3, risk: 0.8 },
};

export const PASSING = {
  corto: { label: 'Toque corto', maxDist: 22, longBias: -0.3 },
  mixto: { label: 'Mixto',       maxDist: 35, longBias: 0 },
  largo: { label: 'Balón largo', maxDist: 50, longBias: 0.4 },
};
