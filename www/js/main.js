import { COLORS } from './config.js';
import { FORMATIONS, MENTALITIES, PASSING } from './tactics.js';
import { Match } from './match.js';
import { Human } from './human.js';
import { Renderer } from './render.js';
import { makeInput, setupTouch, schemeLabel, KEY_ACTIONS, getKeys, setKeys, resetKeys, keyLabel, rememberLabel, getPadMap, setPadMap, resetPadMap, connectedPads, padPressed } from './input.js';
import { sfx } from './sound.js';

const $ = s => document.querySelector(s);
const canvas = $('#game');
const renderer = new Renderer(canvas);
const hasTouch = setupTouch($('#touch'));

let match = null;
let paused = true;
let last = performance.now();

// ---------- Menú ----------

const DEFAULTS = {
  mode: '1p',
  halfMinutes: 3,
  difficulty: 'normal',
  sound: true,
  home: { name: 'Rojos', color: 0, formation: '4-4-2', mentality: 'equilibrada', passing: 'mixto' },
  away: { name: 'Azules', color: 1, formation: '4-3-3', mentality: 'equilibrada', passing: 'mixto' },
};

function loadPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('matchgoal-prefs') || '{}') }; }
  catch { return structuredClone(DEFAULTS); }
}
function savePrefs(p) {
  try { localStorage.setItem('matchgoal-prefs', JSON.stringify(p)); } catch { /* sin almacenamiento */ }
}

const prefs = loadPrefs();

function options(sel, entries, value) {
  sel.innerHTML = entries.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  sel.value = value;
}

function fillTeamForm(side) {
  const f = document.querySelector(`[data-team="${side}"]`);
  const t = prefs[side];
  f.querySelector('[name=name]').value = t.name;
  options(f.querySelector('[name=color]'), COLORS.map((c, i) => [i, c.name]), t.color);
  options(f.querySelector('[name=formation]'), Object.keys(FORMATIONS).map(k => [k, k]), t.formation);
  options(f.querySelector('[name=mentality]'), Object.entries(MENTALITIES).map(([k, v]) => [k, v.label]), t.mentality);
  options(f.querySelector('[name=passing]'), Object.entries(PASSING).map(([k, v]) => [k, v.label]), t.passing);
}

function readTeamForm(side) {
  const f = document.querySelector(`[data-team="${side}"]`);
  return {
    name: f.querySelector('[name=name]').value.trim().slice(0, 14) || (side === 'home' ? 'Local' : 'Visitante'),
    color: +f.querySelector('[name=color]').value,
    formation: f.querySelector('[name=formation]').value,
    mentality: f.querySelector('[name=mentality]').value,
    passing: f.querySelector('[name=passing]').value,
  };
}

fillTeamForm('home');
fillTeamForm('away');
$('#mode').value = prefs.mode;
$('#training').value = prefs.training || '0-0';
$('#half').value = prefs.halfMinutes;
$('#difficulty').value = prefs.difficulty;
$('#sound').checked = prefs.sound;

function updateHelp() {
  const mode = $('#mode').value;
  const lines = [];
  if (mode === '1p' || mode === 'training') lines.push(`<b>Tú</b>: ${schemeLabel('solo')}`);
  if (mode === 'training') lines.push('Entrenamiento sin tiempo, siempre con los dos porteros. <b>Esc</b> para salir.');
  if (mode === '2p') {
    lines.push(`<b>Jugador 1</b>: ${schemeLabel('p1')}`);
    lines.push(`<b>Jugador 2</b>: ${schemeLabel('p2')}`);
  }
  if (mode !== 'cpu') {
    lines.push('Con el balón: <b>pulsación seca</b> = golpeo con la fuerza que marca el medidor de encima de la cabeza · <b>mantener</b> = cargas tú la fuerza en 2 s y golpeas al soltar (si te pasas, baja y acabas dando un toque corto).');
    lines.push('El balón no va pegado al pie: lo conduces a toques. Si giras de golpe se te puede quedar atrás.');
    lines.push('Sin balón: <b>raso</b> = entrada si tienes un rival cerca, o acelerón si no · <b>cambiar</b> = otro jugador. Con un balón alto cerca, raso o alto: salto y cabezazo.');
    lines.push('<b>Esc</b> = pausa y tácticas.');
  }
  $('#help').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
}
// El modo entrenamiento elige con quién entrenas y no tiene duración.
function updateModeBoxes() {
  const training = $('#mode').value === 'training';
  $('#training-box').hidden = !training;
  $('#half-box').hidden = training;
}
$('#mode').addEventListener('change', () => { updateHelp(); updateModeBoxes(); });
updateHelp();
updateModeBoxes();

// ---------- Teclado: redefinir teclas ----------

let keyAssign = null;       // { player, step, map }

function keysStatus() {
  $('#keys-status').innerHTML =
    `<b>Jugador 1</b>: ${schemeLabel('p1')}<br><b>Jugador 2</b>: ${schemeLabel('p2')}<br>` +
    'En el modo de 1 jugador valen las teclas de los dos.';
}

function keyPrompt(extra = '') {
  const [, name] = KEY_ACTIONS[keyAssign.step];
  $('#keys-prompt').textContent = `${extra}Jugador ${keyAssign.player === 'p1' ? 1 : 2}: pulsa la tecla para ${name} (Esc cancela)`;
}

function startKeyAssign(player) {
  keyAssign = { player, step: 0, map: {} };
  $('#keys-prompt').hidden = false;
  keyPrompt();
}

// Recoge la tecla antes que el juego y que el menú (fase de captura), para que no haga nada más.
window.addEventListener('keydown', e => {
  if (!keyAssign) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  if (e.code === 'Escape') {
    keyAssign = null;
    $('#keys-prompt').textContent = 'Cancelado: se quedan las teclas que había.';
    return;
  }
  // No se puede repetir una tecla en el mismo jugador.
  const used = Object.values(keyAssign.map).flat();
  if (used.includes(e.code)) { keyPrompt(`«${keyLabel(e.code)}» ya está usada. `); return; }
  rememberLabel(e);
  keyAssign.map[KEY_ACTIONS[keyAssign.step][0]] = [e.code];
  keyAssign.step++;
  if (keyAssign.step < KEY_ACTIONS.length) { keyPrompt(); return; }
  const p = keyAssign.player;
  setKeys(p, keyAssign.map);
  keyAssign = null;
  $('#keys-prompt').textContent = `Teclas del jugador ${p === 'p1' ? 1 : 2} guardadas.`;
  // Si el otro jugador tenía alguna de estas teclas, se le quitan (las demás se quedan).
  const other = p === 'p1' ? 'p2' : 'p1', mine = Object.values(getKeys(p)).flat();
  const o = getKeys(other), fixed = {};
  for (const [k] of KEY_ACTIONS) fixed[k] = o[k].filter(c => !mine.includes(c));
  setKeys(other, fixed);
  keysStatus(); updateHelp();
}, true);

$('#keys-p1').addEventListener('click', e => { e.currentTarget.blur(); startKeyAssign('p1'); });
$('#keys-p2').addEventListener('click', e => { e.currentTarget.blur(); startKeyAssign('p2'); });
$('#keys-reset').addEventListener('click', () => {
  resetKeys(); keyAssign = null;
  $('#keys-prompt').hidden = false; $('#keys-prompt').textContent = 'Teclas por defecto.';
  keysStatus(); updateHelp();
});
keysStatus();

// ---------- Mando: estado y asignación de botones ----------

const PAD_STEPS = [
  ['raso', 'RASO (pase o chut raso, entrada)'],
  ['alto', 'ALTO (pase o chut alto, cabezazo)'],
  ['cambiar', 'CAMBIAR DE JUGADOR'],
  ['pausa', 'PAUSA'],
];
let assign = null;          // { step, map, wasDown }

function padStatus() {
  const pads = connectedPads();
  const m = getPadMap();
  const names = pads.map((g, i) => `<b>${i === 0 ? 'Jugador 1' : 'Jugador 2'}</b>: ${g.id.replace(/\(.*?\)/g, '').trim() || 'mando'}`);
  $('#pad-status').innerHTML = pads.length
    ? `${names.join(' · ')}<br>Botones: raso ${m.raso.join('/')} · alto ${m.alto.join('/')} · cambiar ${m.cambiar.join('/')} · pausa ${m.pausa.join('/')}`
    : 'Mando: no detectado (conéctalo y pulsa cualquier botón)';
}

$('#pad-assign').addEventListener('click', () => {
  if (!connectedPads().length) { padStatus(); $('#pad-prompt').hidden = false; $('#pad-prompt').textContent = 'Conecta el mando y pulsa un botón para que el navegador lo vea.'; return; }
  assign = { step: 0, map: {}, wasDown: true };
  $('#pad-prompt').hidden = false;
  $('#pad-prompt').textContent = `Pulsa en el mando el botón para ${PAD_STEPS[0][1]}`;
});
$('#pad-reset').addEventListener('click', () => { resetPadMap(); assign = null; $('#pad-prompt').hidden = true; padStatus(); });

// Se llama en cada fotograma mientras está el menú: detecta el mando y recoge los botones.
function pollPadMenu() {
  if ($('#menu').hidden) return;
  padStatus();
  if (!assign) return;
  const g = connectedPads()[0];
  if (!g) return;
  const down = g.buttons.findIndex(b => b.pressed);
  if (down < 0) { assign.wasDown = false; return; }
  if (assign.wasDown) return;           // hay que soltar antes de pulsar el siguiente
  assign.wasDown = true;
  const [key] = PAD_STEPS[assign.step];
  assign.map[key] = [down];
  assign.step++;
  if (assign.step < PAD_STEPS.length) {
    $('#pad-prompt').textContent = `Pulsa en el mando el botón para ${PAD_STEPS[assign.step][1]}`;
  } else {
    setPadMap(assign.map);
    assign = null;
    $('#pad-prompt').textContent = 'Botones guardados.';
  }
}

const SKILL = { facil: 0.82, normal: 0.95, dificil: 1.06 };

function startMatch() {
  sfx.unlock();
  const home = readTeamForm('home'), away = readTeamForm('away');
  if (home.color === away.color) away.color = (away.color + 1) % COLORS.length;
  Object.assign(prefs, {
    mode: $('#mode').value, halfMinutes: +$('#half').value,
    difficulty: $('#difficulty').value, sound: $('#sound').checked, home, away,
    training: $('#training').value,
  });
  savePrefs(prefs);
  sfx.setEnabled(prefs.sound);

  const cpuSkill = SKILL[prefs.difficulty];
  const mode = prefs.mode;
  const mk = (t, cpu) => ({
    ...t, color: COLORS[t.color], cpu, skill: cpu ? cpuSkill : 1,
    gkColor: t.color === 3 ? '#2f6fe0' : '#f2c230',
  });
  match = new Match({
    halfMinutes: prefs.halfMinutes,
    home: mk(home, mode === 'cpu'),
    away: mk(away, mode !== '2p'),
    training: mode === 'training'
      ? (([mates, rivals]) => ({ mates, rivals }))($('#training').value.split('-').map(Number))
      : null,
  });

  if (mode === '1p' || mode === 'training') {
    const src = [{ type: 'keys', scheme: 'solo' }, { type: 'pad', index: 0 }];
    if (hasTouch) src.push({ type: 'touch' });
    match.addHuman(new Human(match.home, makeInput(src), 1));
  } else if (mode === '2p') {
    const s1 = [{ type: 'keys', scheme: 'p1' }, { type: 'pad', index: 0 }];
    if (hasTouch) s1.push({ type: 'touch' });
    match.addHuman(new Human(match.home, makeInput(s1), 1));
    match.addHuman(new Human(match.away, makeInput([{ type: 'keys', scheme: 'p2' }, { type: 'pad', index: 1 }]), 2));
  }

  $('#menu').hidden = true;
  $('#pause').hidden = true;
  // Intro es una tecla de juego: si el botón «Jugar» siguiera con el foco, la pulsación lo activaría.
  document.activeElement?.blur();
  document.body.classList.toggle('playing', true);
  document.body.classList.toggle('has-human', mode !== 'cpu');
  paused = false;
}

$('#play').addEventListener('click', startMatch);

// ---------- Pausa y cambios tácticos ----------

function openPause() {
  if (!match || match.state === 'end') return;
  paused = true;
  const box = $('#pause-teams');
  box.innerHTML = '';
  for (const t of match.teams) {
    const div = document.createElement('div');
    div.className = 'team-tactic';
    div.innerHTML = `
      <h3><span class="chip" style="background:${t.color.shirt}"></span>${t.name}</h3>
      <label>Formación <select data-k="formation"></select></label>
      <label>Mentalidad <select data-k="mentality"></select></label>
      <label>Pases <select data-k="passing"></select></label>`;
    options(div.querySelector('[data-k=formation]'), Object.keys(FORMATIONS).map(k => [k, k]), t.formation);
    options(div.querySelector('[data-k=mentality]'), Object.entries(MENTALITIES).map(([k, v]) => [k, v.label]), t.mentality);
    options(div.querySelector('[data-k=passing]'), Object.entries(PASSING).map(([k, v]) => [k, v.label]), t.passing);
    div.querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
      if (s.dataset.k === 'formation') t.setFormation(s.value);
      else t[s.dataset.k] = s.value;
    }));
    box.appendChild(div);
  }
  const [h, a] = match.stats.possession;
  const pos = h + a > 0 ? Math.round(h / (h + a) * 100) : 50;
  $('#pause-stats').textContent =
    `Posesión ${pos}% - ${100 - pos}% · Tiros ${match.stats.shots[0]} - ${match.stats.shots[1]}`;
  $('#pause').hidden = false;
}

function closePause() { $('#pause').hidden = true; paused = false; last = performance.now(); document.activeElement?.blur(); }

function toMenu() {
  match = null;
  paused = true;
  $('#pause').hidden = true;
  $('#menu').hidden = false;
  document.body.classList.remove('playing', 'has-human');
}

$('#resume').addEventListener('click', closePause);
$('#quit').addEventListener('click', toMenu);
$('#pause-btn').addEventListener('click', () => (paused ? closePause() : openPause()));

window.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (!match) return;
    if (match.state === 'end') return toMenu();
    if (paused) closePause(); else openPause();
  }
  if (!match && e.code === 'Enter' && !$('#menu').hidden) startMatch();
});
canvas.addEventListener('pointerdown', () => { if (match?.state === 'end') toMenu(); });

// Botón Start del mando = pausa.
let startWas = false;
function pollPadStart() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const now = !assign && pads.some(g => padPressed(g, getPadMap().pausa));
  if (now && !startWas && match) (paused ? closePause() : openPause());
  startWas = now;
}

// ---------- Bucle ----------

function frame(t) {
  // Se pide el siguiente fotograma lo primero: si algo falla en este, el juego no se queda congelado.
  requestAnimationFrame(frame);
  // Nunca negativo: el primer fotograma puede llevar una marca de tiempo anterior a 'last'.
  const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));
  last = t;
  pollPadStart();
  pollPadMenu();
  if (match) {
    if (!paused) {
      // Pasos fijos para que la física sea estable.
      const steps = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < steps; i++) match.update(dt / steps);
      renderer.updateCamera(match, dt);
    }
    renderer.draw(match, match.humans);
  } else {
    drawAttract(dt);
  }
}

// Fondo del menú: un partido CPU contra CPU.
let demo = null;
function drawAttract(dt) {
  if (!demo) {
    demo = new Match({
      halfMinutes: 30,
      home: { ...DEFAULTS.home, color: COLORS[0], cpu: true, skill: 1 },
      away: { ...DEFAULTS.away, color: COLORS[1], cpu: true, skill: 1 },
    });
  }
  sfx.setEnabled(false);
  const steps = Math.ceil(dt / (1 / 120));
  for (let i = 0; i < steps; i++) demo.update(dt / steps);
  sfx.setEnabled(prefs.sound);
  renderer.updateCamera(demo, dt);
  renderer.draw(demo, []);
}

requestAnimationFrame(frame);

// Exponer para depuración.
window.matchGoal = { renderer, get match() { return match || demo; } };
