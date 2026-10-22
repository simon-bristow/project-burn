// Holds the latest trainer/sim values, tracks update rate and data age, and
// turns the active source into a smoothed, deadbanded value.

import { deadband } from './tuning.js';

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
    this.source = null;
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
    // A silent source means no pedalling, not "keep the last value forever".
    if (this.ageMs > STALE_AFTER_MS) this.latest = { power: 0, cadence: 0, speed: 0 };

    const raw = this.latest[settings.source];
    if (this.source !== settings.source) {
      // Units change with the source, so don't smooth across the switch.
      this.source = settings.source;
      this.smoothed = raw;
    }
    const alpha = settings.smoothing > 0 ? 1 - Math.exp(-dt / settings.smoothing) : 1;
    this.smoothed += (raw - this.smoothed) * alpha;
    this.value = this.smoothed < deadband(settings) ? 0 : this.smoothed;
    return this.value;
  }
}
