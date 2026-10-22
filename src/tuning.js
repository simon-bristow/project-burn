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

// Hover and deadband rows follow the active source.
function rows(s) {
  const hover = {
    power: { key: 'hoverPct', min: 30, max: 100, step: 1, fmt: (v) => `${v}% · ${Math.round((s.ftp * v) / 100)} W` },
    cadence: { key: 'hoverCadence', min: 40, max: 120, step: 1, fmt: (v) => `${v} rpm` },
    speed: { key: 'hoverSpeed', min: 10, max: 50, step: 0.5, fmt: fixed(1, ' km/h') },
  }[s.source];
  const dead = {
    power: { key: 'deadPower', min: 0, max: 60, step: 1, fmt: (v) => `${v} W` },
    cadence: { key: 'deadCadence', min: 0, max: 60, step: 1, fmt: (v) => `${v} rpm` },
    speed: { key: 'deadSpeed', min: 0, max: 15, step: 0.5, fmt: fixed(1, ' km/h') },
  }[s.source];
  return [
    { key: 'scrollSpeed', label: 'Scroll speed', min: 0.1, max: 0.6, step: 0.02, fmt: fixed(2, ' /s') },
    { key: 'viewHeight', label: 'View height (zoom)', min: 1, max: 3, step: 0.1, fmt: fixed(1) },
    { key: 'ftp', label: 'FTP', min: 100, max: 450, step: 5, fmt: (v) => `${v} W` },
    { ...hover, label: 'Hover' },
    { key: 'gravity', label: 'Gravity', min: 0.1, max: 2, step: 0.05, fmt: fixed(2) },
    { key: 'drag', label: 'Drag', min: 0, max: 3, step: 0.05, fmt: fixed(2) },
    { key: 'smoothing', label: 'Smoothing', min: 0, max: 2, step: 0.05, fmt: fixed(2, ' s') },
    { key: 'curve', label: 'Response curve', min: 0.5, max: 2.5, step: 0.05, fmt: fixed(2) },
    { key: 'maxThrust', label: 'Max thrust', min: 1, max: 6, step: 0.1, fmt: fixed(1, ' g') },
    { ...dead, label: 'Deadband' },
    { key: 'simWatts', label: 'Sim watts', min: 50, max: 600, step: 10, fmt: (v) => `${v} W` },
  ];
}

export class TuningPanel {
  constructor(el, { onNewCavern, onFeedback }) {
    this.el = el;
    this.onNewCavern = onNewCavern;
    this.onFeedback = onFeedback;
    this.build();
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  toggle() {
    this.el.classList.toggle('hidden');
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
        ${Object.entries(SOURCES).map(([key, { label }], i) => `
          <button data-source="${key}" class="${key === settings.source ? 'active' : ''}"
            title="Key ${i + 1}">${label}</button>`).join('')}
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
