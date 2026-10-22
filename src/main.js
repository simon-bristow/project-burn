import { settings, save, hoverPoint, TuningPanel } from './tuning.js';
import { Input } from './input.js';
import { Sim } from './sim.js';
import { Trainer } from './trainer.js';
import { Game } from './game.js';
import { thrustRatio } from './physics.js';
import { Renderer, computeLayout, lookAhead, COLORS } from './render.js';
import { drawHud, drawTrace, FeelTrace, formatDistance } from './hud.js';

const FEEDBACK_URL = 'https://github.com/simon-bristow/project-burn/issues/new';
const PHYSICS_STEP = 1 / 120;
const SIM_WATTS_STEP = 10;
const RESUME_COUNTDOWN_S = 3;
const START_COUNTDOWN_S = 5;

const renderer = new Renderer(document.getElementById('game'));
const game = new Game(settings);
const panel = new TuningPanel(document.getElementById('panel'), {
  onNewCavern: () => game.reset(settings.seed),
  onFeedback: openFeedback,
});

// Opens a GitHub issue pre-filled with this rider's tuning and setup, so
// feedback arrives with the numbers that produced it.
function openFeedback() {
  if (!paused && !ready) togglePause();
  const { stats } = game;
  const body = [
    '## How did it feel?',
    '',
    '<!-- Too hard / too easy? Which settings did you change and why? Anything confusing? -->',
    '',
    '## Setup',
    '',
    `- Input: ${trainer.state === 'connected' ? `${trainer.name} via ${trainer.protocol}` : simActive ? 'keyboard simulator' : 'none'}`,
    `- Update rate: ${input.rateHz ? input.rateHz.toFixed(1) : '?'} Hz`,
    `- Browser: ${navigator.userAgent}`,
    '',
    '## This run',
    '',
    `- Distance: ${(game.distance * 50 / 1000).toFixed(2)} km, score ${stats.score}, crashes ${stats.crashes}`,
    '',
    '## Settings',
    '',
    '```json',
    JSON.stringify(settings, null, 2),
    '```',
  ].join('\n');
  const url = `${FEEDBACK_URL}?${new URLSearchParams({ title: 'Ride feedback', body, labels: 'feedback' })}`;
  window.open(url, '_blank', 'noopener');
}
const statusEl = document.getElementById('status');
const input = new Input();
const trace = new FeelTrace();

let simActive = true;
// Before the first start the world waits while the rider connects and tests
// the trainer; input, readouts, flame and trace all run live.
let ready = true;
let paused = false;
let countdown = 0; // seconds left of the countdown before play (re)starts
const startButton = document.getElementById('start');
startButton.addEventListener('click', startGame);

function playing() {
  return !ready && !paused && countdown === 0;
}

// Q ends the run and goes back to Ready on a fresh start of the same cavern,
// keeping a summary of the run to show there.
let lastRun = null;

function quitRun() {
  if (ready) return;
  const { stats } = game;
  lastRun = `${formatDistance(game.distance)} · score ${stats.score} · ${stats.crashes} crash${stats.crashes === 1 ? '' : 'es'}`;
  game.reset(settings.seed);
}

function startGame() {
  if (!ready) return;
  ready = false;
  countdown = START_COUNTDOWN_S;
  startButton.hidden = true;
  startButton.blur(); // so Space fires missiles, not this button
}
const sim = new Sim((sample) => { if (simActive) input.push(sample); });
const trainer = new Trainer((sample) => input.push(sample), onTrainerState);

function onTrainerState(state) {
  if (state === 'connected') {
    setSim(false);
    input.reset();
  } else if (state === 'lost') {
    input.reset(); // falls to zero, so the ship drops
  }
  renderStatus();
}

function setSim(on) {
  simActive = on;
  sim.reset();
  input.reset();
  renderStatus();
}

async function connectTrainer() {
  try {
    await trainer.connect();
  } catch (err) {
    if (err.name === 'NotFoundError') return; // picker cancelled
    console.error(err);
    renderStatus(err.message);
  }
}

// One-line banner above the box for anything that needs attention.
function renderStatus(error) {
  let text = '';
  let button = null;
  if (error) {
    text = error;
  } else if (!Trainer.supported && trainer.state === 'idle') {
    text = simActive
      ? "Simulator · hold Z to pedal · Web Bluetooth isn't available in this browser"
      : "Web Bluetooth isn't available. Use Chrome or Edge on localhost.";
  } else if (trainer.state === 'connecting') {
    text = 'Connecting…';
  } else if (trainer.state === 'lost') {
    text = 'Trainer connection lost';
    button = 'Reconnect';
  } else if (trainer.state === 'idle') {
    text = simActive ? 'Simulator · hold Z to pedal' : 'No input · press K for the simulator';
    button = 'Connect trainer';
  }
  statusEl.hidden = !text;
  statusEl.innerHTML = `<span></span>${button ? '<button type="button"></button>' : ''}`;
  statusEl.querySelector('span').textContent = text;
  if (button) {
    const btn = statusEl.querySelector('button');
    btn.textContent = button;
    btn.addEventListener('click', connectTrainer);
  }
}

function connection() {
  if (trainer.state === 'connected') return { label: `${trainer.name} · ${trainer.protocol}`, color: COLORS.accent };
  if (trainer.state === 'connecting') return { label: 'Connecting…', color: COLORS.amber };
  if (trainer.state === 'lost') return { label: 'Connection lost', color: COLORS.red };
  if (simActive) return { label: 'Keyboard simulator', color: COLORS.amber };
  return { label: 'Not connected', color: COLORS.line };
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const onSlider = document.activeElement?.type === 'range';
  if (e.code === 'Space') {
    e.preventDefault(); // don't scroll or press a focused button
    if (!e.repeat && playing()) game.fire();
    return;
  }
  if (e.code === 'KeyB') {
    if (!e.repeat && playing()) game.dropBomb();
    return;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    startGame();
    return;
  }
  if (e.code === 'KeyZ') {
    if (simActive) sim.pressed = true;
    return;
  }
  if (e.repeat) return;
  if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && !onSlider && simActive) {
    e.preventDefault();
    const delta = e.code === 'ArrowUp' ? SIM_WATTS_STEP : -SIM_WATTS_STEP;
    settings.simWatts = Math.max(50, Math.min(600, settings.simWatts + delta));
    save();
    panel.refresh();
    return;
  }
  if (e.key === 'p' || e.key === 'P') togglePause();
  else if (e.key === 't' || e.key === 'T') { panel.toggle(); placeStatus(); }
  else if (e.key === 'k' || e.key === 'K') { if (trainer.state !== 'connected') setSim(!simActive); }
  else if (e.key === 'c' || e.key === 'C') connectTrainer();
  else if (e.key === 'q' || e.key === 'Q') quitRun();
});

// Resuming runs a countdown first; P during the countdown pauses again.
function togglePause() {
  if (ready) return;
  if (paused) {
    paused = false;
    countdown = RESUME_COUNTDOWN_S;
  } else {
    paused = true;
    countdown = 0;
  }
}

addEventListener('keyup', (e) => {
  if (e.code === 'KeyZ') sim.pressed = false;
});

addEventListener('blur', () => { sim.pressed = false; });

let layout;
function placeStatus() {
  layout = computeLayout(innerWidth, innerHeight, panel.open);
  const { view } = layout;
  Object.assign(statusEl.style, { left: `${view.x}px`, width: `${view.w}px`, top: `${view.y + 12}px` });
  // Sits under the overlay subtitle, see Renderer.drawOverlay.
  const titleSize = Math.max(28, view.h * 0.06);
  Object.assign(startButton.style, { left: `${view.x + view.w / 2}px`, top: `${view.y + view.h / 2 + titleSize * 1.5}px` });
}
addEventListener('resize', placeStatus);
placeStatus();
renderStatus();

let last = performance.now();
let acc = 0;
let t = 0;

function frame(now) {
  // Paused freezes everything that moves: sim, smoothing, physics, trace, debris.
  // While ready and during the countdown the input runs live, so you can test
  // the trainer or spin up before play starts, but the world stays frozen.
  const realDt = paused ? 0 : Math.min((now - last) / 1000, 0.1);
  last = now;
  if (countdown > 0) countdown = Math.max(0, countdown - realDt);
  const dt = ready || countdown > 0 ? 0 : realDt;
  t += dt;

  if (simActive) sim.update(realDt, settings);
  input.update(realDt, settings);
  const n = input.value / hoverPoint(settings);
  if (ready) game.ship.thrustRatio = thrustRatio(n, settings);

  const ahead = lookAhead(layout.view, settings);
  acc += dt;
  while (acc >= PHYSICS_STEP) {
    game.step(n, PHYSICS_STEP, ahead);
    acc -= PHYSICS_STEP;
  }
  const events = game.drainEvents();
  if (events.some((e) => e.type === 'respawn')) countdown = RESUME_COUNTDOWN_S;
  if (events.some((e) => e.type === 'reset')) {
    ready = true;
    paused = false;
    countdown = 0;
    startButton.hidden = false;
  }
  renderer.handle(events);

  const { ship, cavern, stats } = game;
  const floor = cavern.floorAt(ship.x);
  trace.update(ready ? realDt : dt, n, (ship.y - floor) / (cavern.ceilAt(ship.x) - floor));

  const ctx = renderer.ctx;
  renderer.clear();
  renderer.drawWorld({ view: layout.view, game, settings, alpha: acc / PHYSICS_STEP, t, dt });
  drawHud(ctx, layout.hud, {
    H: innerHeight,
    latest: input.latest,
    thrustRatio: ship.thrustRatio,
    v: ship.v,
    alive: ship.alive,
    aliveTime: stats.aliveTime,
    bestTime: stats.bestTime,
    score: stats.score,
    crashes: stats.crashes,
    mines: stats.mines,
    colonies: stats.colonies,
    distance: game.distance,
    conn: connection(),
    rateHz: input.rateHz,
    ageMs: input.ageMs,
    simActive,
    simWatts: settings.simWatts,
  });
  drawTrace(ctx, layout.trace, trace);
  if (ready) {
    renderer.drawOverlay(layout.view, 'Ready', lastRun
      ? `Last run: ${lastRun}. Press Enter or Start to go again`
      : 'Connect and test your trainer, then press Enter or Start');
  } else if (paused) renderer.drawOverlay(layout.view, 'Paused', 'Press P to resume or Q to quit');
  else if (countdown > 0) renderer.drawOverlay(layout.view, String(Math.ceil(countdown)), 'Start pedalling');

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
