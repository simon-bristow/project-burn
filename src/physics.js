// Vertical thrust-vs-gravity model. Units are world units (y up). n is
// input / hover point, so n = 1 exactly cancels gravity.

export function createShip(x, y) {
  return {
    x, y,
    prevX: x,
    prevY: y,
    v: 0,
    thrustRatio: 0, // thrust as a multiple of gravity
    alive: true,
    respawnIn: 0,
    invulnerable: 0,
  };
}

export function thrustRatio(n, settings) {
  return n > 0 ? Math.min(Math.pow(n, settings.curve), settings.maxThrust) : 0;
}

export function applyThrust(ship, n, settings, dt) {
  const g = settings.gravity;
  ship.thrustRatio = thrustRatio(n, settings);
  const accel = g * ship.thrustRatio - g - settings.drag * ship.v;
  ship.v += accel * dt;
  ship.y += ship.v * dt;
}

// Steady climb rate for a thrust ratio, and the thrust ratio a climb rate
// needs. Drag is floored so a zero-drag setting doesn't make slopes infinite.
export function climbRate(ratio, settings) {
  return (settings.gravity * (ratio - 1)) / Math.max(settings.drag, 0.3);
}

export function ratioForClimb(vy, settings) {
  return 1 + (vy * Math.max(settings.drag, 0.3)) / settings.gravity;
}

export function terminalFall(settings) {
  return settings.gravity / Math.max(settings.drag, 0.3);
}
