// Holds the latest trainer/sim values, tracks update rate and data age, and
// turns power into a smoothed, deadbanded value. Cadence and speed are kept
// for the HUD only.

const STALE_AFTER_MS = 3000;

export class Input {
  constructor() {
    this.reset();
  }

  reset() {
    this.latest = { power: 0, cadence: 0, speed: 0 };
    this.lastAt = 0;
    this.rateHz = 0;
    this.smoothed = 0;
    this.value = 0;
  }

  push(sample) {
    for (const key of ['power', 'cadence', 'speed']) {
      if (sample[key] !== undefined) this.latest[key] = Math.max(0, sample[key]);
    }
    const now = performance.now();
    if (this.lastAt) {
      const hz = 1000 / Math.max(1, now - this.lastAt);
      this.rateHz = this.rateHz ? this.rateHz + (hz - this.rateHz) * 0.2 : hz;
    }
    this.lastAt = now;
  }

  get ageMs() {
    return this.lastAt ? performance.now() - this.lastAt : Infinity;
  }

  update(dt, settings) {
    // A silent trainer means no pedalling, not "keep the last value forever".
    if (this.ageMs > STALE_AFTER_MS) this.latest = { power: 0, cadence: 0, speed: 0 };

    const alpha = settings.smoothing > 0 ? 1 - Math.exp(-dt / settings.smoothing) : 1;
    this.smoothed += (this.latest.power - this.smoothed) * alpha;
    this.value = this.smoothed < settings.deadPower ? 0 : this.smoothed;
    return this.value;
  }
}
