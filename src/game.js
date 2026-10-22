// World state for the cavern run: ship, weapons, colony missiles, collisions,
// scoring, crash and rewind.

import { Cavern, MINE_RADIUS, COLONY_WIDTH, COLONY_HEIGHT, mineY, pointInTriangle } from './cavern.js';
import { createShip, applyThrust } from './physics.js';

export const SHIP_SIZE = 0.018;
const START_X = 0.5;
const MISSILE_SPEED = 1.2; // world units/s faster than the ship
const MISSILE_RANGE = 4;
const BOMB_GRAVITY = 1.2;
const BOMB_TOSS = 0.12; // extra forward speed so bombs land a little ahead
const THREAT_SPEED = 1.35; // colony missiles fly at this multiple of scroll speed
const THREAT_LAUNCH_BEHIND = 0.25; // launch once the ship is this far past
const THREAT_MAX_VY = 0.3;
const THREAT_STEER = 2.5; // how quickly a colony missile turns toward you
const THREAT_HIT_RADIUS = 0.02;
const REWIND_S = 3;
const RESPAWN_DELAY_S = 1.5;
const INVULNERABLE_S = 1.0;
const SAFE_CLEARANCE = 0.4;

export const POINTS = { mine: 1, colony: 2, threat: 1 };

// Side-on chevron pointing right, in ship-local coords (y up).
const HULL = [[1.1, 0], [-0.8, 0.55], [-0.45, 0], [-0.8, -0.55]];

export function shipAngle(ship, settings) {
  return Math.max(-0.6, Math.min(0.6, Math.atan2(ship.v, settings.scrollSpeed) * 0.7));
}

export function hullPoints(x, y, angle, u = SHIP_SIZE) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return HULL.map(([hx, hy]) => [x + (hx * c - hy * s) * u, y + (hx * s + hy * c) * u]);
}

export class Game {
  constructor(settings) {
    this.settings = settings;
    this.reset(settings.seed);
  }

  reset(seed) {
    this.cavern = new Cavern(seed, this.settings);
    this.cavern.ensure(START_X + 10);
    const mid = (this.cavern.floorAt(START_X) + this.cavern.ceilAt(START_X)) / 2;
    this.ship = createShip(START_X, mid);
    this.missile = null;
    this.bomb = null;
    this.threats = [];
    this.time = 0;
    this.events = [{ type: 'reset' }];
    this.stats = { score: 0, crashes: 0, mines: 0, colonies: 0, aliveTime: 0, bestTime: 0 };
  }

  get distance() {
    return Math.max(0, this.ship.x - START_X);
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  fire() {
    const s = this.ship;
    if (this.missile || !s.alive) return;
    this.missile = { x: s.x + SHIP_SIZE, y: s.y, prevX: s.x + SHIP_SIZE };
  }

  dropBomb() {
    const s = this.ship;
    if (this.bomb || !s.alive) return;
    const y = s.y - SHIP_SIZE * 0.5;
    this.bomb = { x: s.x, y, prevX: s.x, prevY: y, vx: this.settings.scrollSpeed + BOMB_TOSS, vy: Math.min(0, s.v) };
  }

  step(n, dt, lookAhead) {
    const s = this.ship;
    s.prevX = s.x;
    s.prevY = s.y;
    this.cavern.ensure(s.x + lookAhead + 1);
    if (this.missile) this.missile.prevX = this.missile.x;
    if (this.bomb) Object.assign(this.bomb, { prevX: this.bomb.x, prevY: this.bomb.y });
    for (const m of this.threats) Object.assign(m, { prevX: m.x, prevY: m.y });

    if (!s.alive) {
      s.respawnIn -= dt;
      if (s.respawnIn <= 0) this.respawn();
      return;
    }

    this.time += dt;
    s.x += this.settings.scrollSpeed * dt;
    applyThrust(s, n, this.settings, dt);
    s.invulnerable = Math.max(0, s.invulnerable - dt);
    this.stats.aliveTime += dt;
    this.stats.bestTime = Math.max(this.stats.bestTime, this.stats.aliveTime);

    this.stepMissile(dt);
    this.stepBomb(dt);
    this.launchThreats();
    this.stepThreats(dt, lookAhead);
    if (s.invulnerable === 0 && this.collides()) this.crash();
  }

  score(type, x, y) {
    this.stats.score += POINTS[type];
    this.events.push({ type, x, y, points: POINTS[type] });
  }

  colonyHit(o, x, y, pad = 0) {
    const base = this.cavern.colonyBase(o);
    return Math.abs(x - o.x) < COLONY_WIDTH / 2 + pad && y < base + COLONY_HEIGHT + pad;
  }

  collides() {
    const s = this.ship;
    const cav = this.cavern;
    const hull = hullPoints(s.x, s.y, shipAngle(s, this.settings));
    for (const p of hull) {
      if (p[1] <= cav.floorAt(p[0]) || p[1] >= cav.ceilAt(p[0])) return true;
    }
    for (const o of cav.obstaclesIn(s.x - 0.2, s.x + 0.2)) {
      if (o.type === 'mine') {
        if (!o.dead && Math.hypot(o.x - s.x, mineY(o, this.time) - s.y) < MINE_RADIUS + SHIP_SIZE * 0.8) return true;
      } else if (o.type === 'colony') {
        if (!o.dead && hull.some(([px, py]) => this.colonyHit(o, px, py))) return true;
      } else {
        if (hull.some((p) => pointInTriangle(p, o.points))) return true;
        const tip = o.points[2];
        if (Math.hypot(tip[0] - s.x, tip[1] - s.y) < SHIP_SIZE * 0.6) return true;
      }
    }
    return this.threats.some((m) => Math.hypot(m.x - s.x, m.y - s.y) < THREAT_HIT_RADIUS + SHIP_SIZE * 0.6);
  }

  stepMissile(dt) {
    const m = this.missile;
    if (!m) return;
    const cav = this.cavern;
    m.x += (this.settings.scrollSpeed + MISSILE_SPEED) * dt;
    if (m.x > this.ship.x + MISSILE_RANGE) {
      this.missile = null;
      return;
    }
    if (m.y <= cav.floorAt(m.x) || m.y >= cav.ceilAt(m.x)) {
      this.events.push({ type: 'spark', x: m.x, y: m.y });
      this.missile = null;
      return;
    }
    const threat = this.threats.find((t) => Math.hypot(t.x - m.x, t.y - m.y) < THREAT_HIT_RADIUS + 0.01);
    if (threat) {
      this.threats = this.threats.filter((t) => t !== threat);
      this.score('threat', threat.x, threat.y);
      this.missile = null;
      return;
    }
    for (const o of cav.obstaclesIn(m.x - 0.1, m.x + 0.1)) {
      if (o.dead) continue;
      if (o.type === 'mine') {
        const y = mineY(o, this.time);
        if (Math.hypot(o.x - m.x, y - m.y) < MINE_RADIUS + 0.01) {
          o.dead = true;
          this.stats.mines += 1;
          this.score('mine', o.x, y);
          this.missile = null;
          return;
        }
      } else if (o.type === 'pillar' && pointInTriangle([m.x, m.y], o.points)) {
        this.events.push({ type: 'spark', x: m.x, y: m.y });
        this.missile = null;
        return;
      }
    }
  }

  // Bombs fall under gravity from the ship's speed and blow up whatever they
  // land on. Missing still makes a dust puff on the floor.
  stepBomb(dt) {
    const b = this.bomb;
    if (!b) return;
    const cav = this.cavern;
    b.vy -= BOMB_GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    for (const o of cav.obstaclesIn(b.x - 0.1, b.x + 0.1)) {
      if (o.dead) continue;
      if (o.type === 'colony' && this.colonyHit(o, b.x, b.y, 0.01)) {
        o.dead = true;
        this.stats.colonies += 1;
        this.score('colony', o.x, cav.colonyBase(o) + COLONY_HEIGHT / 2);
        this.bomb = null;
        return;
      }
      if (o.type === 'mine') {
        const y = mineY(o, this.time);
        if (Math.hypot(o.x - b.x, y - b.y) < MINE_RADIUS + 0.008) {
          o.dead = true;
          this.stats.mines += 1;
          this.score('mine', o.x, y);
          this.bomb = null;
          return;
        }
      }
      if (o.type === 'pillar' && pointInTriangle([b.x, b.y], o.points)) {
        this.events.push({ type: 'spark', x: b.x, y: b.y });
        this.bomb = null;
        return;
      }
    }
    if (b.y <= cav.floorAt(b.x)) {
      this.events.push({ type: 'dust', x: b.x, y: cav.floorAt(b.x) });
      this.bomb = null;
    }
  }

  // A colony you fly past without bombing launches a missile from behind.
  launchThreats() {
    const s = this.ship;
    for (const o of this.cavern.obstaclesIn(s.x - THREAT_LAUNCH_BEHIND - 0.3, s.x)) {
      if (o.type !== 'colony' || o.dead || o.launched || s.x - o.x < THREAT_LAUNCH_BEHIND) continue;
      o.launched = true;
      const y = this.cavern.colonyBase(o) + COLONY_HEIGHT;
      this.threats.push({ x: o.x, y, prevX: o.x, prevY: y, vy: THREAT_MAX_VY, steering: true });
      this.events.push({ type: 'launch', x: o.x, y });
    }
  }

  // Colony missiles steer loosely toward your height while they're behind
  // you, then fly straight once they've caught up, so dodging makes them miss.
  stepThreats(dt, lookAhead) {
    const s = this.ship;
    const cav = this.cavern;
    this.threats = this.threats.filter((m) => {
      m.x += this.settings.scrollSpeed * THREAT_SPEED * dt;
      if (m.steering && m.x >= s.x - SHIP_SIZE) m.steering = false;
      const desired = m.steering
        ? Math.max(-THREAT_MAX_VY, Math.min(THREAT_MAX_VY, 2 * (s.y - m.y)))
        : 0;
      m.vy += (desired - m.vy) * Math.min(1, (m.steering ? THREAT_STEER : 1) * dt);
      m.y += m.vy * dt;
      if (m.x > s.x + lookAhead) return false;
      if (m.y <= cav.floorAt(m.x) || m.y >= cav.ceilAt(m.x)) {
        this.events.push({ type: 'spark', x: m.x, y: m.y });
        return false;
      }
      return true;
    });
  }

  crash() {
    const s = this.ship;
    this.events.push({ type: 'crash', x: s.x, y: s.y, v: s.v });
    s.alive = false;
    s.respawnIn = RESPAWN_DELAY_S;
    s.thrustRatio = 0;
    s.v = 0;
    this.missile = null;
    this.bomb = null;
    this.threats = [];
    this.stats.crashes += 1;
  }

  // Rewind a few seconds, back off until clear of obstacles, and restart
  // level in the middle of the gap. Colonies you're rewound in front of get
  // their missile back.
  respawn() {
    const s = this.ship;
    const cav = this.cavern;
    let x = Math.max(START_X, s.x - REWIND_S * this.settings.scrollSpeed);
    const blocked = (px) => cav.obstaclesIn(px - SAFE_CLEARANCE, px + SAFE_CLEARANCE)
      .some((o) => !o.dead && Math.abs(o.x - px) < SAFE_CLEARANCE);
    for (let i = 0; i < 40 && x > START_X && blocked(x); i++) x -= 0.1;
    for (const o of cav.obstaclesIn(x - THREAT_LAUNCH_BEHIND, s.x)) {
      if (o.type === 'colony' && x - o.x < THREAT_LAUNCH_BEHIND) o.launched = false;
    }
    s.x = s.prevX = x;
    s.y = s.prevY = (cav.floorAt(x) + cav.ceilAt(x)) / 2;
    // Start moving with the terrain, so a respawn mid-climb isn't instantly lost.
    s.v = ((cav.floorAt(x + 0.05) - cav.floorAt(x - 0.05)) / 0.1) * this.settings.scrollSpeed;
    s.alive = true;
    s.invulnerable = INVULNERABLE_S;
    this.stats.aliveTime = 0;
    this.events.push({ type: 'respawn' });
  }
}
