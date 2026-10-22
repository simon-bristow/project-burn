// Canvas drawing: layout, scrolling camera, cavern, obstacles, ship, missile,
// debris and shake.

import { SHIP_SIZE, hullPoints, shipAngle } from './game.js';
import { MINE_RADIUS, COLONY_WIDTH, COLONY_HEIGHT, mineY } from './cavern.js';
import { ratioForClimb } from './physics.js';
import { hoverPoint } from './tuning.js';

export const COLORS = {
  bg: '#0b0b0b',
  rock: '#161615',
  line: '#5F5E5A',
  dim: '#2C2C2A',
  muted: '#888780',
  soft: '#B4B2A9',
  light: '#D3D1C7',
  text: '#F1EFE8',
  accent: '#1D9E75',
  accentText: '#5DCAA5',
  amber: '#EF9F27',
  amberLight: '#FAC775',
  red: '#E24B4A',
  colony: '#AFA9EC',
  threat: '#F0997B',
};

const FONT = 'system-ui, -apple-system, sans-serif';
const MARGIN = 20;
const PANEL_WIDTH = 320; // panel plus its right margin, see index.html
const SHIP_SCREEN_X = 0.15; // ship sits this far in from the left of the view
const CAMERA_LEAD = 0.4; // fraction of the view ahead used to aim the camera
const CAMERA_SMOOTH_S = 0.5;
const SHAKE_S = 0.4;
const POPUP_S = 1.0;

export function computeLayout(W, H, panelOpen) {
  const hudW = Math.max(200, Math.min(280, W * 0.2));
  const traceH = Math.max(90, Math.min(150, H * 0.16));
  const right = W - (panelOpen ? PANEL_WIDTH : 0) - MARGIN;
  const viewX = MARGIN + hudW + MARGIN;
  const viewH = H - traceH - MARGIN * 3;
  return {
    W, H,
    hud: { x: MARGIN, y: MARGIN, w: hudW, h: viewH },
    view: { x: viewX, y: MARGIN, w: Math.max(160, right - viewX), h: viewH },
    trace: { x: MARGIN, y: H - MARGIN - traceH, w: right - MARGIN, h: traceH },
  };
}

// How far ahead of the ship the view reaches, in world units.
export function lookAhead(view, settings) {
  return (view.w / view.h) * settings.viewHeight * (1 - SHIP_SCREEN_X);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.debris = [];
    this.popups = []; // "+2" score text rising from where points were won
    this.shake = 0;
    this.camY = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = devicePixelRatio || 1;
    this.W = innerWidth;
    this.H = innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.ctx.fillStyle = COLORS.bg;
    this.ctx.fillRect(0, 0, this.W, this.H);
  }

  handle(events) {
    for (const e of events) {
      if (e.type === 'crash') {
        this.burst(e.x, e.y, 6, SHIP_SIZE * 1.2, 1.5, COLORS.text);
        this.shake = SHAKE_S;
      } else if (e.type === 'mine') {
        this.burst(e.x, e.y, 10, MINE_RADIUS * 0.8, 1.0, COLORS.red);
      } else if (e.type === 'colony') {
        this.burst(e.x, e.y, 14, COLONY_HEIGHT * 0.8, 1.2, COLORS.colony);
        this.shake = SHAKE_S * 0.5;
      } else if (e.type === 'threat') {
        this.burst(e.x, e.y, 8, 0.012, 0.8, COLORS.threat);
      } else if (e.type === 'dust') {
        this.burst(e.x, e.y, 5, 0.01, 0.5, COLORS.muted);
      } else if (e.type === 'spark') {
        this.burst(e.x, e.y, 4, 0.006, 0.4, COLORS.amberLight);
      } else if (e.type === 'respawn' || e.type === 'reset') {
        this.camY = null; // snap the camera
      }
      if (e.points) this.popups.push({ x: e.x, y: e.y, text: `+${e.points}`, life: POPUP_S });
    }
  }

  // Line fragments flying out from a point, in world units.
  burst(x, y, count, size, life, color) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = size * (4 + Math.random() * 6);
      this.debris.push({
        x, y, len: size * (0.6 + Math.random() * 0.8),
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
        life, maxLife: life, color,
      });
    }
  }

  drawWorld({ view, game, settings, alpha, t, dt }) {
    const { ctx } = this;
    const ship = game.ship;
    const cav = game.cavern;
    const scale = view.h / settings.viewHeight;
    const viewW = view.w / scale;
    const shipX = ship.prevX + (ship.x - ship.prevX) * alpha;
    const shipY = ship.prevY + (ship.y - ship.prevY) * alpha;
    const camX = shipX - SHIP_SCREEN_X * viewW;
    this.updateCamera(cav, shipX, shipY, viewW, settings.viewHeight, dt);
    const camY = this.camY;
    const sx = (x) => view.x + (x - camX) * scale;
    const sy = (y) => view.y + view.h - (y - camY) * scale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.w, view.h);
    ctx.clip();
    if (this.shake > 0 && dt > 0) {
      const k = (this.shake / SHAKE_S) * 6;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      this.shake = Math.max(0, this.shake - dt);
    }

    this.drawRock(cav, camX, camX + viewW, sx, sy, view);
    this.drawLabels(cav, camX, camX + viewW, sx, sy, settings);

    for (const o of cav.obstaclesIn(camX, camX + viewW)) {
      if (o.type === 'pillar') this.drawPillar(o, sx, sy);
      else if (o.type === 'colony') this.drawColony(o, cav.colonyBase(o), sx, sy, scale, t);
      else if (!o.dead) this.drawMine(o.x, mineY(o, game.time), sx, sy, scale, t);
    }

    const lerp = (a, b) => a + (b - a) * alpha;
    const m = game.missile;
    if (m) {
      const mx = lerp(m.prevX, m.x);
      this.glowStroke(COLORS.accentText, 2, () => {
        ctx.moveTo(sx(mx - SHIP_SIZE * 1.6), sy(m.y));
        ctx.lineTo(sx(mx), sy(m.y));
      });
    }
    const b = game.bomb;
    if (b) {
      ctx.save();
      ctx.fillStyle = COLORS.amberLight;
      ctx.shadowColor = COLORS.amberLight;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx(lerp(b.prevX, b.x)), sy(lerp(b.prevY, b.y)), Math.max(2, SHIP_SIZE * 0.25 * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const threat of game.threats) this.drawThreat(lerp(threat.prevX, threat.x), lerp(threat.prevY, threat.y), threat.vy, sx, sy, settings);

    const blinking = ship.invulnerable > 0 && Math.floor(t * 10) % 2 === 0;
    if (ship.alive && !blinking) {
      this.drawShip(shipX, shipY, shipAngle(ship, settings), ship.thrustRatio, sx, sy, scale);
    }
    this.drawDebris(sx, sy, scale, dt);
    this.drawPopups(sx, sy, dt);
    ctx.restore();

    ctx.strokeStyle = COLORS.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(view.x + 0.5, view.y + 0.5, view.w, view.h);
  }

  // Aim at the cavern just ahead of the ship, but never let the ship leave
  // the middle 60% of the view.
  updateCamera(cav, shipX, shipY, viewW, viewH, dt) {
    let mid = 0;
    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const x = shipX + (i / (samples - 1)) * viewW * CAMERA_LEAD;
      mid += (cav.floorAt(x) + cav.ceilAt(x)) / 2;
    }
    let target = mid / samples - viewH / 2;
    target = Math.min(shipY - viewH * 0.2, Math.max(shipY - viewH * 0.8, target));
    if (this.camY === null) this.camY = target;
    else this.camY += (target - this.camY) * (1 - Math.exp(-dt / CAMERA_SMOOTH_S));
  }

  drawRock(cav, x0, x1, sx, sy, view) {
    const { ctx } = this;
    const [i0, i1] = cav.indexRange(x0, x1);
    const top = view.y - 10;
    const bottom = view.y + view.h + 10;
    for (const [arr, edgeY] of [[cav.floor, bottom], [cav.ceil, top]]) {
      ctx.beginPath();
      ctx.moveTo(sx(cav.xOf(i0)), edgeY);
      for (let i = i0; i <= i1; i++) ctx.lineTo(sx(cav.xOf(i)), sy(arr[i]));
      ctx.lineTo(sx(cav.xOf(i1)), edgeY);
      ctx.closePath();
      ctx.fillStyle = COLORS.rock;
      ctx.fill();
      ctx.strokeStyle = COLORS.muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) ctx.lineTo(sx(cav.xOf(i)), sy(arr[i]));
      ctx.stroke();
    }
  }

  // "climb · 190 W · 12 s" at the foot of each effort section, recomputed
  // from current tuning.
  drawLabels(cav, x0, x1, sx, sy, settings) {
    const { ctx } = this;
    ctx.save();
    ctx.font = `500 13px ${FONT}`;
    for (const sec of cav.sections) {
      if (sec.x0 > x1 || sec.x0 + sec.len < x0) continue;
      const seconds = Math.round(sec.len / settings.scrollSpeed);
      let text;
      if (sec.kind === 'climb') {
        const vy = sec.slope * settings.scrollSpeed;
        const n = Math.pow(ratioForClimb(vy, settings), 1 / settings.curve);
        text = `▲ climb · ${formatEffort(n * hoverPoint(settings), settings.source)} · ${seconds} s`;
        ctx.fillStyle = COLORS.amber;
      } else if (sec.kind === 'coast') {
        text = `▼ coast · ${seconds} s`;
        ctx.fillStyle = COLORS.accentText;
      } else {
        text = `squeeze · ${seconds} s`;
        ctx.fillStyle = COLORS.soft;
      }
      ctx.fillText(text, sx(sec.x0), sy(cav.floorAt(sec.x0)) - 10);
    }
    ctx.restore();
  }

  drawPillar(o, sx, sy) {
    const { ctx } = this;
    ctx.beginPath();
    o.points.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
    ctx.closePath();
    ctx.fillStyle = COLORS.rock;
    ctx.fill();
    ctx.strokeStyle = COLORS.soft;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Domes and antenna towers with blinking lights; rubble once bombed.
  drawColony(o, baseY, sx, sy, scale, t) {
    const { ctx } = this;
    const w = COLONY_WIDTH;
    const h = COLONY_HEIGHT;
    ctx.save();
    if (o.dead) {
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const lx = o.x - w / 2 + (w * (i + 0.2)) / 5;
        ctx.moveTo(sx(lx), sy(baseY + h * 0.05));
        ctx.lineTo(sx(lx + w * 0.12), sy(baseY + h * (0.15 + 0.15 * (i % 2))));
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    this.glowStroke(COLORS.colony, 1.5, () => {
      ctx.moveTo(sx(o.x - w / 2), sy(baseY));
      ctx.lineTo(sx(o.x + w / 2), sy(baseY));
      for (const d of o.domes) {
        const cx = sx(o.x + d.x * w);
        ctx.moveTo(cx + d.r * w * scale, sy(baseY));
        ctx.arc(cx, sy(baseY), d.r * w * scale, 0, Math.PI, true);
      }
      for (const tw of o.towers) {
        const tx = sx(o.x + tw.x * w);
        ctx.moveTo(tx, sy(baseY));
        ctx.lineTo(tx, sy(baseY + tw.h * h));
      }
    });
    ctx.fillStyle = COLORS.red;
    for (const [i, tw] of o.towers.entries()) {
      if (Math.sin(t * 3 + i * 2 + o.x * 7) > 0) {
        ctx.fillRect(sx(o.x + tw.x * w) - 1.5, sy(baseY + tw.h * h) - 1.5, 3, 3);
      }
    }
    ctx.restore();
  }

  // Colony missile: a short dart angled along its path with an exhaust tail.
  drawThreat(x, y, vy, sx, sy, settings) {
    const { ctx } = this;
    const a = Math.atan2(vy, settings.scrollSpeed);
    const len = SHIP_SIZE * 1.3;
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    ctx.save();
    this.glowStroke(COLORS.threat, 2, () => {
      ctx.moveTo(sx(x - dx), sy(y - dy));
      ctx.lineTo(sx(x + dx), sy(y + dy));
    });
    ctx.globalAlpha = 0.6 + Math.random() * 0.4;
    this.glowStroke(COLORS.amber, 1, () => {
      ctx.moveTo(sx(x - dx), sy(y - dy));
      ctx.lineTo(sx(x - dx * 2.2), sy(y - dy * 2.2));
    });
    ctx.restore();
  }

  drawPopups(sx, sy, dt) {
    const { ctx } = this;
    this.popups = this.popups.filter((p) => (p.life -= dt) > 0);
    ctx.save();
    ctx.font = `500 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.accentText;
    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, p.life / (POPUP_S * 0.5));
      ctx.fillText(p.text, sx(p.x), sy(p.y) - 12 - (1 - p.life / POPUP_S) * 30);
    }
    ctx.restore();
  }

  drawMine(x, y, sx, sy, scale, t) {
    const { ctx } = this;
    const r = MINE_RADIUS * scale;
    const cx = sx(x);
    const cy = sy(y);
    const pulse = 0.6 + 0.4 * Math.sin(t * 4 + x * 10);
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    this.glowStroke(COLORS.red, 1.5, () => {
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 0.5;
        ctx.moveTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    });
    ctx.restore();
  }

  drawShip(x, y, angle, thrustRatio, sx, sy, scale) {
    const { ctx } = this;
    const u = SHIP_SIZE;
    ctx.save();
    ctx.lineJoin = 'round';

    // Lift flame under the belly; its length shows thrust.
    if (thrustRatio > 0.02) {
      const len = u * (0.3 + 0.8 * thrustRatio) * (0.85 + Math.random() * 0.3);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const at = (lx, ly) => [sx(x + (lx * c - ly * s)), sy(y + (lx * s + ly * c))];
      for (const [color, w, k] of [[COLORS.amber, 1.5, 1], [COLORS.amberLight, 1, 0.55]]) {
        this.glowStroke(color, w, () => {
          ctx.moveTo(...at(-0.55 * u * k - 0.1 * u, -0.25 * u));
          ctx.lineTo(...at(-0.3 * u, -0.25 * u - len * k));
          ctx.lineTo(...at(0.25 * u * k - 0.1 * u, -0.25 * u));
        });
      }
    }

    this.glowStroke(COLORS.text, 1.8, () => {
      const pts = hullPoints(x, y, angle);
      ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]));
      for (const [px, py] of pts.slice(1)) ctx.lineTo(sx(px), sy(py));
      ctx.closePath();
    });
    ctx.restore();
  }

  glowStroke(color, width, path) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = width;
    ctx.beginPath();
    path();
    ctx.stroke();
  }

  drawDebris(sx, sy, scale, dt) {
    const { ctx } = this;
    this.debris = this.debris.filter((d) => (d.life -= dt) > 0);
    ctx.save();
    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      const dx = (Math.cos(d.rot) * d.len) / 2;
      const dy = (Math.sin(d.rot) * d.len) / 2;
      ctx.globalAlpha = d.life / d.maxLife;
      this.glowStroke(d.color, 1.5, () => {
        ctx.moveTo(sx(d.x - dx), sy(d.y - dy));
        ctx.lineTo(sx(d.x + dx), sy(d.y + dy));
      });
    }
    ctx.restore();
  }

  drawOverlay(view, title, subtitle) {
    const { ctx } = this;
    const size = Math.max(28, view.h * 0.06);
    ctx.save();
    ctx.fillStyle = 'rgba(11, 11, 11, 0.6)';
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = `500 ${Math.round(size)}px ${FONT}`;
    ctx.fillText(title, view.x + view.w / 2, view.y + view.h / 2);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 ${Math.round(size * 0.4)}px ${FONT}`;
    ctx.fillText(subtitle, view.x + view.w / 2, view.y + view.h / 2 + size * 0.9);
    ctx.restore();
  }
}

export function formatEffort(value, source) {
  if (source === 'power') return `${Math.round(value)} W`;
  if (source === 'cadence') return `${Math.round(value)} rpm`;
  return `${value.toFixed(1)} km/h`;
}
