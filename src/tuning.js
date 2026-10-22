// Settings, persistence, and the tuning panel.

const STORAGE_KEY = 'projectburn.settings.v1';

export const DEFAULTS = Object.freeze({
  source: 'power',
  ftp: 250,
  hoverPct: 60,
  hoverCadence: 80,
  hoverSpeed: 25,
  gravity: 0.6,
  drag: 0.8,
  smoothing: 0.3,
  curve: 1.0,
  maxThrust: 3.0,
  deadPower: 15,
  deadCadence: 20,
  deadSpeed: 3,
  simWatts: 200,
  simMimicRate: true,
  scrollSpeed: 0.45,
  viewHeight: 2.0,
  seed: 1,
});

export const SOURCES = {
  power: { label: 'Power', unit: 'W' },
  cadence: { label: 'Cadence', unit: 'rpm' },
  speed: { label: 'Speed', unit: 'km/h' },
};

export const settings = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    console.warn('Could not load settings', err);
  }
  return { ...DEFAULTS };
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Could not save settings', err);
  }
}

export function hoverPoint(s) {
  if (s.source === 'power') return (s.ftp * s.hoverPct) / 100;
  if (s.source === 'cadence') return s.hoverCadence;
  return s.hoverSpeed;
}

export function deadband(s) {
  return { power: s.deadPower, cadence: s.deadCadence, speed: s.deadSpeed }[s.source];
}

const fixed = (digits, suffix = '') => (v) => `${v.toFixed(digits)}${suffix}`;

// Hover and deadband rows follow the active source. `help` is the tooltip:
// what moving the slider does to how the game plays.
function rows(s) {
  const hover = {
    power: {
      key: 'hoverPct', min: 30, max: 100, step: 1, fmt: (v) => `${v}% · ${Math.round((s.ftp * v) / 100)} W`,
      help: 'The power, as a share of your FTP, that holds the ship level. Ride above it to climb, below it to sink. Higher: the whole game takes harder work, climbs included. Lower: an easier ride.',
    },
    cadence: {
      key: 'hoverCadence', min: 40, max: 120, step: 1, fmt: (v) => `${v} rpm`,
      help: 'The cadence that holds the ship level. Spin faster to climb, slower to sink. Higher: you need to spin faster all the time. Lower: an easier spin.',
    },
    speed: {
      key: 'hoverSpeed', min: 10, max: 50, step: 0.5, fmt: fixed(1, ' km/h'),
      help: 'The wheel speed that holds the ship level. Go faster to climb, slower to sink. Higher: you need to hold more speed all the time. Lower: an easier ride.',
    },
  }[s.source];
  const unit = SOURCES[s.source].unit;
  const dead = {
    power: { key: 'deadPower', min: 0, max: 60, step: 1, fmt: (v) => `${v} W` },
    cadence: { key: 'deadCadence', min: 0, max: 60, step: 1, fmt: (v) => `${v} rpm` },
    speed: { key: 'deadSpeed', min: 0, max: 15, step: 0.5, fmt: fixed(1, ' km/h') },
  }[s.source];
  return [
    {
      key: 'scrollSpeed', label: 'Scroll speed', min: 0.1, max: 0.6, step: 0.02, fmt: fixed(2, ' /s'),
      help: 'How fast the cavern moves past. Higher: less time to react, and every climb needs more effort because you rise faster to keep up. Lower: more relaxed, and climbs get easier.',
    },
    {
      key: 'viewHeight', label: 'View height (zoom)', min: 1, max: 3, step: 0.1, fmt: fixed(1),
      help: 'How much cavern fits on screen. Higher zooms out: you see further ahead, but the ship and obstacles get smaller. Lower zooms in: a bigger ship, but less warning of what\'s coming.',
    },
    {
      key: 'ftp', label: 'FTP', min: 100, max: 450, step: 5, fmt: (v) => `${v} W`,
      help: 'Your functional threshold power. Hover is a share of it, so setting your real FTP makes every effort, climbs included, scale to you. Only matters when steering by power.',
    },
    { ...hover, label: 'Hover' },
    {
      key: 'gravity', label: 'Gravity', min: 0.1, max: 2, step: 0.05, fmt: fixed(2),
      help: 'How hard the ship is pulled down. Higher: it climbs and falls faster for the same change in effort, so it\'s sharper and twitchier. Lower: floaty and forgiving, but slow to get going.',
    },
    {
      key: 'drag', label: 'Drag', min: 0, max: 3, step: 0.05, fmt: fixed(2),
      help: 'Air resistance. Higher: the ship settles quickly and drifts less, so it feels stable, but climbs need more effort. Lower: it keeps its momentum and overshoots, more like ice.',
    },
    {
      key: 'smoothing', label: 'Smoothing', min: 0, max: 2, step: 0.05, fmt: fixed(2, ' s'),
      help: 'Evens out jumpy trainer readings. Higher: a steadier ship, but it reacts later when you change effort. 0: raw trainer data, instant but jerky.',
    },
    {
      key: 'curve', label: 'Response curve', min: 0.5, max: 2.5, step: 0.05, fmt: fixed(2),
      help: 'How strongly thrust follows your effort around hover. 1: in proportion. Above 1: small changes in effort have a big effect, so it\'s twitchy and sprints hit hard. Below 1: calmer, finer control.',
    },
    {
      key: 'maxThrust', label: 'Max thrust', min: 1, max: 6, step: 0.1, fmt: fixed(1, ' g'),
      help: 'Caps how hard a big effort can push you up. Lower: a sprint can\'t rocket you into the ceiling. Higher: sprints climb steeply, which is handy for recovering, but easy to overdo.',
    },
    {
      ...dead, label: 'Deadband',
      help: `Anything under this many ${unit} counts as freewheeling, so you get no thrust. Raise it if soft pedalling or trainer noise keeps the flame flickering when you mean to coast.`,
    },
    {
      key: 'simWatts', label: 'Sim watts', min: 50, max: 600, step: 10, fmt: (v) => `${v} W`,
      help: 'Keyboard simulator only: the power you put out while holding Z. Also adjustable with the ↑ and ↓ keys.',
    },
  ];
}

const SOURCE_HELP = {
  power: 'Steer by power (key 1). Reacts fastest when you change effort, and is the most precise.',
  cadence: 'Steer by cadence (key 2). Gear-independent, but the trainer averages it, so expect about a second of lag.',
  speed: 'Steer by wheel speed (key 3). Follows the trainer\'s flywheel, which keeps spinning when you stop pedalling, so it feels floaty and slow to drop.',
};

const ACTION_HELP = {
  'new-cavern': 'Generates a different cavern and returns to the Ready screen. Your score and distance start again.',
  feedback: 'Opens a GitHub issue pre-filled with your settings and setup, so you can say how it felt.',
  copy: 'Copies your current settings as text, so you can save or share a combination that works.',
  reset: 'Puts every setting back to its default. Your current cavern carries on.',
};

const MIMIC_HELP = 'Keyboard simulator only: sends readings 4 times a second like a real trainer, so desk testing feels like riding. Untick for perfectly smooth input.';

export class TuningPanel {
  constructor(el, { onNewCavern, onFeedback }) {
    this.el = el;
    this.onNewCavern = onNewCavern;
    this.onFeedback = onFeedback;
    this.initTip();
    this.build();
  }

  // One shared tooltip, shown beside the panel (over the game) for whichever
  // control is hovered or focused. It lives outside the panel because the
  // panel scrolls and would clip it.
  initTip() {
    this.tip = document.createElement('div');
    this.tip.id = 'tip';
    this.tip.setAttribute('role', 'tooltip');
    this.tip.hidden = true;
    document.body.appendChild(this.tip);
    const show = (e) => {
      const target = e.target.closest?.('[data-help]');
      if (target && this.el.contains(target)) this.showTip(target);
    };
    const hide = (e) => {
      const from = e.target.closest?.('[data-help]');
      const to = e.relatedTarget?.closest?.('[data-help]');
      if (from && from !== to) this.hideTip();
    };
    this.el.addEventListener('pointerover', show);
    this.el.addEventListener('pointerout', hide);
    this.el.addEventListener('focusin', show);
    this.el.addEventListener('focusout', hide);
    this.el.addEventListener('scroll', () => this.hideTip());
  }

  showTip(target) {
    this.tip.textContent = target.dataset.help;
    this.tip.hidden = false;
    const panel = this.el.getBoundingClientRect();
    const anchor = target.getBoundingClientRect();
    const tip = this.tip.getBoundingClientRect();
    const top = Math.max(8, Math.min(innerHeight - tip.height - 8, anchor.top + anchor.height / 2 - tip.height / 2));
    this.tip.style.left = `${Math.max(8, panel.left - tip.width - 12)}px`;
    this.tip.style.top = `${top}px`;
  }

  hideTip() {
    this.tip.hidden = true;
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  toggle() {
    this.el.classList.toggle('hidden');
    this.hideTip();
  }

  setSource(source) {
    settings.source = source;
    save();
    this.build();
  }

  // Called when settings change from outside the panel (e.g. arrow keys).
  refresh() {
    for (const input of this.el.querySelectorAll('input[type=range]')) {
      const value = settings[input.dataset.key];
      if (Number(input.value) !== value) {
        input.value = value;
        this.paint(input);
      }
    }
    this.updateLabels();
  }

  build() {
    const list = rows(settings);
    this.el.innerHTML = `
      <div class="panel-head"><h2>Tuning</h2><kbd>T</kbd></div>
      <div class="segmented" role="group" aria-label="Input source">
        ${Object.entries(SOURCES).map(([key, { label }]) => `
          <button data-source="${key}" class="${key === settings.source ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      ${list.map((r) => `
        <label class="row">
          <span class="row-head"><span>${r.label}</span><output data-for="${r.key}"></output></span>
          <input type="range" data-key="${r.key}" min="${r.min}" max="${r.max}" step="${r.step}" value="${settings[r.key]}">
        </label>`).join('')}
      <label class="check"><input type="checkbox" data-key="simMimicRate" ${settings.simMimicRate ? 'checked' : ''}>
        Sim mimics trainer rate (4 Hz)</label>
      <div class="buttons">
        <button data-action="new-cavern">New cavern</button>
        <button data-action="feedback">Send feedback</button>
      </div>
      <div class="buttons">
        <button data-action="copy">Copy settings</button>
        <button data-action="reset">Reset</button>
      </div>
      <p class="note" aria-live="polite"></p>`;

    this.rows = list;
    this.hideTip();
    this.el.querySelectorAll('.row').forEach((row, i) => { row.dataset.help = list[i].help; });
    this.el.querySelector('.check').dataset.help = MIMIC_HELP;
    for (const btn of this.el.querySelectorAll('[data-source]')) btn.dataset.help = SOURCE_HELP[btn.dataset.source];
    for (const btn of this.el.querySelectorAll('[data-action]')) btn.dataset.help = ACTION_HELP[btn.dataset.action];
    for (const input of this.el.querySelectorAll('input[type=range]')) {
      this.paint(input);
      input.addEventListener('input', () => {
        settings[input.dataset.key] = Number(input.value);
        save();
        this.paint(input);
        this.updateLabels();
      });
    }
    this.el.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
      settings.simMimicRate = e.target.checked;
      save();
    });
    for (const btn of this.el.querySelectorAll('[data-source]')) {
      btn.addEventListener('click', () => this.setSource(btn.dataset.source));
    }
    this.el.querySelector('[data-action=copy]').addEventListener('click', () => this.copy());
    this.el.querySelector('[data-action=feedback]').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.onFeedback();
    });
    this.el.querySelector('[data-action=new-cavern]').addEventListener('click', (e) => {
      settings.seed = Math.floor(Math.random() * 1e9);
      save();
      this.onNewCavern();
      e.currentTarget.blur(); // so Space fires missiles, not this button
      this.note(`Cavern ${settings.seed}`);
    });
    this.el.querySelector('[data-action=reset]').addEventListener('click', () => {
      Object.assign(settings, DEFAULTS, { seed: settings.seed });
      save();
      this.build();
      this.note('Settings reset');
    });
    this.updateLabels();
  }

  paint(input) {
    const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  }

  updateLabels() {
    for (const r of this.rows) {
      this.el.querySelector(`output[data-for="${r.key}"]`).textContent = r.fmt(settings[r.key]);
    }
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      this.note('Copied to clipboard');
    } catch (err) {
      console.warn('Clipboard write failed', err);
      this.note("Couldn't copy. Settings are in the console.");
      console.log(JSON.stringify(settings, null, 2));
    }
  }

  note(text) {
    const el = this.el.querySelector('.note');
    el.textContent = text;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => { el.textContent = ''; }, 2500);
  }
}
