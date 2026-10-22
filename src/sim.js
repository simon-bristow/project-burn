// Keyboard stand-in for the trainer. Emits the same { power, cadence, speed }
// samples, optionally at a trainer-like 4 Hz so desk testing has the same steps.

const RAMP_SECONDS = 0.5;
const PEDAL_CADENCE = 90;
const FLYWHEEL_DECAY_KMH_PER_S = 1.2;
const TRAINER_INTERVAL_S = 0.25;

export class Sim {
  constructor(onSample) {
    this.onSample = onSample;
    this.pressed = false;
    this.power = 0;
    this.cadence = 0;
    this.speed = 0;
    this.emitTimer = 0;
  }

  update(dt, settings) {
    const target = this.pressed ? settings.simWatts : 0;
    const maxStep = (Math.max(settings.simWatts, 100) / RAMP_SECONDS) * dt;
    this.power += Math.max(-maxStep, Math.min(maxStep, target - this.power));
    this.cadence = this.pressed ? PEDAL_CADENCE : 0;

    if (this.pressed) {
      const targetSpeed = 32 * Math.cbrt(this.power / 200);
      this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt / 1.0));
    } else {
      this.speed = Math.max(0, this.speed - FLYWHEEL_DECAY_KMH_PER_S * dt);
    }

    if (!settings.simMimicRate) {
      this.emit();
      return;
    }
    this.emitTimer -= dt;
    if (this.emitTimer <= 0) {
      this.emitTimer += TRAINER_INTERVAL_S;
      if (this.emitTimer <= 0) this.emitTimer = TRAINER_INTERVAL_S;
      this.emit();
    }
  }

  emit() {
    this.onSample({ power: Math.round(this.power), cadence: this.cadence, speed: this.speed });
  }

  reset() {
    this.pressed = false;
    this.power = this.cadence = this.speed = 0;
  }
}
