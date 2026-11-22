import { COLORS } from './config.js';
import { FORMATIONS, MENTALITIES, PASSING } from './tactics.js';
import { Match } from './match.js';
import { Human } from './human.js';
import { Renderer } from './render.js';
import { makeInput, setupTouch, SCHEMES } from './input.js';
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
$('#half').value = prefs.halfMinutes;
$('#difficulty').value = prefs.difficulty;
$('#sound').checked = prefs.sound;

function updateHelp() {
  const mode = $('#mode').value;
  const lines = [];
  if (mode === '1p') lines.push(`<b>Tú</b>: ${SCHEMES.solo.label}`);
  if (mode === '2p') {
    lines.push(`<b>Jugador 1</b>: ${SCHEMES.p1.label}`);
    lines.push(`<b>Jugador 2</b>: ${SCHEMES.p2.label}`);
  }
  if (mode !== 'cpu') {
    lines.push('Mantén pulsado el botón de golpeo: el medidor sube y baja, suelta en el punto que quieras.');
    lines.push('Sin balón: <b>raso</b> = entrada · <b>alto</b> = cambiar de jugador. Con el balón en el aire cerca: cabezazo o volea.');
    lines.push('Mandos compatibles: A raso · B alto. <b>Esc</b> = pausa y tácticas.');
  }
  $('#help').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
}
$('#mode').addEventListener('change', updateHelp);
updateHelp();

const SKILL = { facil: 0.82, normal: 0.95, dificil: 1.06 };

function startMatch() {
  sfx.unlock();
  const home = readTeamForm('home'), away = readTeamForm('away');
  if (home.color === away.color) away.color = (away.color + 1) % COLORS.length;
  Object.assign(prefs, {
    mode: $('#mode').value, halfMinutes: +$('#half').value,
    difficulty: $('#difficulty').value, sound: $('#sound').checked, home, away,
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
  });

  if (mode === '1p') {
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

function closePause() { $('#pause').hidden = true; paused = false; last = performance.now(); }

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
  const now = pads.some(g => g.buttons[9]?.pressed);
  if (now && !startWas && match) (paused ? closePause() : openPause());
  startWas = now;
}

// ---------- Bucle ----------

function frame(t) {
  // Nunca negativo: el primer fotograma puede llevar una marca de tiempo anterior a 'last'.
  const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));
  last = t;
  pollPadStart();
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
  requestAnimationFrame(frame);
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
