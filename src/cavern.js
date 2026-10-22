// Endless cavern built from section types. Climb slopes are generated from the
// effort they need at the current tuning, so a ramp is a real sustained effort.

import { climbRate, terminalFall } from './physics.js';

const DX = 0.02; // sample spacing in world units
const X0 = -10; // world x of sample 0
// Wide enough that the start of a climb eases in over about a second, which
// is roughly how long the ship takes to build vertical speed.
const SMOOTH_HALF_WIDTH = 0.4;
const SMOOTH_TAPS = 11;
const ROUGHNESS = 0.015;
const ROUGHNESS_KNOT = 4; // samples between jitter knots
const OBSTACLE_SPACING = 0.8;
export const MINE_RADIUS = 0.022;
const MINE_BOB = 0.02;
export const COLONY_WIDTH = 0.14;
export const COLONY_HEIGHT = 0.035;
const COLONY_CHANCE = 0.5; // share of random cruise sections with a colony

// Every cavern opens the same way, stepping the rider up one skill at a time:
//   1. ~40 s of straight, empty cavern that gently narrows and widens (feel)
//   2. ~24 s of flat cavern with mines and colonies at hover height (shooting)
//   3. a gentle climb, a gentle coast, a short flat with targets (effort)
//   4. a moderate climb, a moderate coast, a flat with a pillar
//   5. the first big climb
// After that, sections are picked at random by SECTION_WEIGHTS.
const WARM_UP = [
  { kind: 'practice', stepSeconds: 6, gaps: [0.9, 0.85, 0.8, 0.9, 0.75, 0.85, 0.85] },
  {
    kind: 'cruise', steps: 12, wobble: 0.01, gap: 0.85, clearSeconds: 3, mineBand: [0.42, 0.58],
    obstacles: ['mine', 'colony', 'mine', 'colony', 'mine'], count: 5,
    note: 'targets · Space shoots mines, B bombs colonies',
  },
  { kind: 'ramp', effort: [1.08, 1.12], seconds: [6, 8], gap: 0.75, count: 0 },
  { kind: 'drop', fall: [0.25, 0.3], seconds: [4, 5], count: 0 },
  { kind: 'cruise', steps: 3, wobble: 0.01, gap: 0.8, obstacles: ['mine', 'colony'], count: 2 },
  { kind: 'ramp', effort: [1.18, 1.25], seconds: [8, 10], gap: 0.65, count: 0 },
  { kind: 'drop', fall: [0.35, 0.4], seconds: [4, 6], count: 0 },
  { kind: 'cruise', steps: 3, wobble: 0.03, gap: 0.8, obstacles: ['mine', 'pillar'], count: 2 },
  { kind: 'ramp', effort: [1.4, 1.5], seconds: [12, 15], gap: 0.6, count: 0 },
];

const SECTION_WEIGHTS = [['cruise', 3], ['ramp', 2], ['mountain', 2], ['squeeze', 1], ['drop', 1]];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(i, seed) {
  let h = Math.imul(i ^ seed, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296 - 0.5;
}

// Deterministic jitter so the rock edge looks hand-cut: random knots every
// few samples, joined by straight lines, rather than per-sample noise.
function roughness(i, seed) {
  const k = Math.floor(i / ROUGHNESS_KNOT);
  const t = (i % ROUGHNESS_KNOT) / ROUGHNESS_KNOT;
  return (hash(k, seed) * (1 - t) + hash(k + 1, seed) * t) * 2 * ROUGHNESS;
}

export class Cavern {
  constructor(seed, settings) {
    this.seed = seed;
    this.settings = settings;
    this.rng = mulberry32(seed);
    this.keys = [{ x: X0 - 1, floor: 0, gap: 0.8 }, { x: 0, floor: 0, gap: 0.8 }];
    this.floor = [];
    this.ceil = [];
    this.obstacles = []; // sorted by x
    this.sections = []; // labelled efforts: { kind, x0, len, slope }
    this.sectionCount = 0;
  }

  get lastKey() {
    return this.keys[this.keys.length - 1];
  }

  // Make sure terrain exists up to world x.
  ensure(x) {
    while (this.lastKey.x < x + SMOOTH_HALF_WIDTH + 1) this.addSection();
    const until = Math.min(x + 1, this.lastKey.x - SMOOTH_HALF_WIDTH);
    for (let i = this.floor.length; X0 + i * DX <= until; i++) {
      const sx = X0 + i * DX;
      let floor = 0;
      let gap = 0;
      for (let k = 0; k < SMOOTH_TAPS; k++) {
        const b = this.base(sx + SMOOTH_HALF_WIDTH * ((2 * k) / (SMOOTH_TAPS - 1) - 1));
        floor += b.floor;
        gap += b.gap;
      }
      floor /= SMOOTH_TAPS;
      gap /= SMOOTH_TAPS;
      this.floor.push(floor + roughness(i, this.seed));
      this.ceil.push(floor + gap + roughness(i + 1e6, this.seed));
    }
  }

  floorAt(x) {
    return this.sample(this.floor, x);
  }

  ceilAt(x) {
    return this.sample(this.ceil, x);
  }

  sample(arr, x) {
    const f = (x - X0) / DX;
    const i = Math.max(0, Math.min(arr.length - 2, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - i));
    return arr[i] + (arr[i + 1] - arr[i]) * t;
  }

  // Sample indices covering [x0, x1], for drawing.
  indexRange(x0, x1) {
    const last = this.floor.length - 1;
    return [
      Math.max(0, Math.floor((x0 - X0) / DX)),
      Math.min(last, Math.ceil((x1 - X0) / DX)),
    ];
  }

  xOf(i) {
    return X0 + i * DX;
  }

  obstaclesIn(x0, x1) {
    const list = this.obstacles;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].x < x0 - 0.2) lo = mid + 1;
      else hi = mid;
    }
    const out = [];
    for (let i = lo; i < list.length && list[i].x <= x1 + 0.2; i++) out.push(list[i]);
    return out;
  }

  // Unsmoothed piecewise-linear terrain from the keypoints.
  base(x) {
    const keys = this.keys;
    let lo = 0;
    let hi = keys.length - 1;
    if (x <= keys[0].x) return keys[0];
    if (x >= keys[hi].x) return keys[hi];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (keys[mid].x <= x) lo = mid;
      else hi = mid;
    }
    const a = keys[lo];
    const b = keys[hi];
    const t = (x - a.x) / (b.x - a.x);
    return { floor: a.floor + (b.floor - a.floor) * t, gap: a.gap + (b.gap - a.gap) * t };
  }

  rand(a, b) {
    return a + (b - a) * this.rng();
  }

  pickSection() {
    const total = SECTION_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
    let r = this.rng() * total;
    for (const [kind, w] of SECTION_WEIGHTS) {
      if ((r -= w) < 0) return kind;
    }
    return 'cruise';
  }

  // Append a keypoint `seconds` of scrolling after the last one.
  push(seconds, floor, gap) {
    const x = this.lastKey.x + seconds * this.settings.scrollSpeed;
    this.keys.push({ x, floor, gap });
    return x;
  }

  addSection() {
    const s = this.settings;
    const spec = WARM_UP[this.sectionCount] ?? { kind: this.pickSection() };
    const { kind } = spec;
    this.sectionCount += 1;
    const start = this.lastKey;
    let { floor, gap } = start;

    if (kind === 'practice') {
      // Straight centre line; only the gap breathes in and out.
      const mid = floor + gap / 2;
      for (const g of spec.gaps) this.push(spec.stepSeconds, mid - g / 2, g);
      this.sections.push({ kind: 'practice', x0: start.x + 0.3, len: this.lastKey.x - start.x, slope: 0 });
    } else if (kind === 'cruise') {
      const steps = spec.steps ?? Math.round(this.rand(3, 5));
      const wobble = spec.wobble ?? 0.08;
      for (let i = 0; i < steps; i++) {
        floor += this.rand(-wobble, wobble);
        gap = spec.gap ?? this.rand(0.6, 0.9);
        this.push(2, floor, gap);
      }
      const clear = (spec.clearSeconds ?? 0) * s.scrollSpeed;
      if (spec.note) this.sections.push({ kind: 'note', text: spec.note, x0: start.x + clear * 0.5, len: this.lastKey.x - start.x, slope: 0 });
      const kinds = spec.obstacles
        ?? (this.rng() < COLONY_CHANCE ? ['mine', 'colony', 'pillar', 'mine'] : ['mine', 'mine', 'pillar']);
      this.placeObstacles(start.x + clear, this.lastKey.x, kinds, spec.count, spec.mineBand);
    } else if (kind === 'ramp') {
      gap = spec.gap ?? this.rand(0.55, 0.7);
      const x0 = this.push(1, floor, gap);
      const seconds = this.rand(...(spec.seconds ?? [8, 15]));
      floor += climbRate(this.rand(...(spec.effort ?? [1.15, 1.5])), s) * seconds;
      const x1 = this.push(seconds, floor, gap);
      this.label('climb', x0, x1, start.floor, floor);
      this.push(1, floor, gap);
      this.placeObstacles(x0, x1, ['mine'], spec.count);
    } else if (kind === 'mountain') {
      gap = this.rand(0.55, 0.65);
      const x0 = this.push(1, floor, gap);
      const base = floor;
      const climbSeconds = this.rand(4, 7);
      floor += climbRate(this.rand(1.3, 1.6), s) * climbSeconds;
      const x1 = this.push(climbSeconds, floor, gap);
      this.label('climb', x0, x1, base, floor);
      const x2 = this.push(1.5, floor, gap);
      const down = terminalFall(s) * this.rand(0.35, 0.5);
      const x3 = this.push((floor - base) / down, base, gap);
      this.label('coast', x2, x3, floor, base);
      floor = base;
      this.push(1, floor, gap);
      this.placeObstacles(x1, x2 + 0.2, ['pillar-ceiling']);
    } else if (kind === 'squeeze') {
      const narrow = this.rand(0.2, 0.26);
      const wide = 0.65;
      const x0 = this.push(1.5, floor + (gap - narrow) / 2, narrow);
      floor += (gap - narrow) / 2;
      const x1 = this.push(this.rand(3, 5), floor, narrow);
      this.sections.push({ kind: 'squeeze', x0, len: x1 - x0, slope: 0 });
      this.push(1.5, floor - (wide - narrow) / 2, wide);
    } else {
      // Drop: a descent you follow by easing off. `fall` is the descent rate
      // as a share of the ship's terminal fall speed.
      gap = spec.gap ?? 0.65;
      const x0 = this.push(1, floor, gap);
      const top = floor;
      const seconds = this.rand(...(spec.seconds ?? [3, 6]));
      floor -= terminalFall(s) * this.rand(...(spec.fall ?? [0.3, 0.5])) * seconds;
      const x1 = this.push(seconds, floor, gap);
      this.label('coast', x0, x1, top, floor);
      this.push(1, floor, gap);
      this.placeObstacles(x0, x1, ['pillar'], spec.count);
    }
  }

  label(kind, x0, x1, fromFloor, toFloor) {
    this.sections.push({ kind, x0, len: x1 - x0, slope: (toFloor - fromFloor) / (x1 - x0) });
  }

  // Spread obstacles evenly over [x0, x1], cycling through the given kinds.
  // Mines float within mineBand, as fractions of the gap above the floor.
  placeObstacles(x0, x1, kinds, count = Math.floor((x1 - x0) / OBSTACLE_SPACING), mineBand = [0.3, 0.7]) {
    const slot = (x1 - x0) / Math.max(count, 1);
    for (let i = 0; i < count; i++) {
      const x = x0 + (i + 0.5 + this.rand(-0.25, 0.25)) * slot;
      const kind = kinds[i % kinds.length];
      const { floor, gap } = this.base(x);
      if (kind === 'mine') {
        this.obstacles.push({
          type: 'mine', x, baseY: floor + gap * this.rand(...mineBand),
          phase: this.rand(0, Math.PI * 2), dead: false,
        });
      } else if (kind === 'colony') {
        this.obstacles.push(this.colony(x));
      } else {
        const fromCeiling = kind === 'pillar-ceiling' || (kind === 'pillar' && this.rng() < 0.5);
        this.obstacles.push(this.pillar(x, fromCeiling, gap * this.rand(0.3, 0.45), this.rand(0.08, 0.14)));
      }
    }
    this.obstacles.sort((a, b) => a.x - b.x);
  }

  // A cluster of domes and towers on the floor. Shapes are in local units
  // (x from -0.5 to 0.5 of the width, y up from the base as a share of height).
  colony(x) {
    const domeCount = 2 + Math.floor(this.rng() * 2);
    const domes = Array.from({ length: domeCount }, (_, i) => ({
      x: -0.35 + (0.7 * (i + 0.5)) / domeCount + this.rand(-0.05, 0.05),
      r: this.rand(0.12, 0.2),
    }));
    const towers = Array.from({ length: 1 + Math.floor(this.rng() * 2) }, () => ({
      x: this.rand(-0.4, 0.4),
      h: this.rand(0.8, 1),
    }));
    return { type: 'colony', x, dead: false, launched: false, baseY: null, domes, towers };
  }

  // Where a colony sits: just below the lowest floor sample under it, so it
  // never floats. Needs the terrain sampled there, so it's resolved lazily.
  colonyBase(o) {
    if (o.baseY === null) {
      let y = Infinity;
      for (let k = -2; k <= 2; k++) y = Math.min(y, this.floorAt(o.x + (k / 4) * COLONY_WIDTH));
      o.baseY = y - 0.004;
    }
    return o.baseY;
  }

  // Triangle growing out of the rock; the base is buried so it meets the edge.
  pillar(x, fromCeiling, length, width) {
    const dir = fromCeiling ? -1 : 1;
    const wall = (wx) => (fromCeiling ? this.base(wx).floor + this.base(wx).gap : this.base(wx).floor);
    return {
      type: 'pillar', x,
      points: [
        [x - width / 2, wall(x - width / 2) - dir * 0.06],
        [x + width / 2, wall(x + width / 2) - dir * 0.06],
        [x + this.rand(-0.02, 0.02), wall(x) + dir * length],
      ],
    };
  }
}

export function mineY(mine, time) {
  return mine.baseY + MINE_BOB * Math.sin(mine.phase + time * 1.5);
}

export function pointInTriangle([px, py], [a, b, c]) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
