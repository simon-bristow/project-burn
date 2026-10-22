// Readouts, thrust bar, survival stats, connection status, and the feel trace.

import { COLORS } from './render.js';

// Power steers the ship and is shown large; cadence and speed are for reference.
const READOUTS = [
  { key: 'power', label: 'power', unit: 'W', main: true },
  { key: 'cadence', label: 'cadence', unit: 'rpm' },
  { key: 'speed', label: 'speed', unit: 'km/h', digits: 1 },
];

const FONT = 'system-ui, -apple-system, sans-serif';
const TRACE_SECONDS = 20;
const TRACE_INTERVAL_S = 0.05;
const TRACE_MAX_N = 2; // input axis tops out at 2x hover

const KEY_HELP = [
  ['Enter', 'start'],
  ['Z', 'pedal (simulator)'],
  ['↑ ↓', 'sim watts'],
  ['Space', 'fire missile'],
  ['B', 'drop bomb'],
  ['P', 'pause'],
  ['Q', 'quit run'],
  ['T', 'tuning panel'],
  ['K', 'simulator on/off'],
  ['C', 'connect trainer'],
];

export class FeelTrace {
  constructor() {
    this.capacity = TRACE_SECONDS / TRACE_INTERVAL_S;
    this.samples = [];
    this.acc = 0;
  }

  update(dt, n, y) {
    this.acc += dt;
    while (this.acc >= TRACE_INTERVAL_S) {
      this.acc -= TRACE_INTERVAL_S;
      this.samples.push({ n, y });
      if (this.samples.length > this.capacity) this.samples.shift();
    }
  }
}

function font(px, weight = 400) {
  return `${weight} ${Math.round(px)}px ${FONT}`;
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// One world unit is shown as 50 m.
export function formatDistance(units) {
  const m = units * 50;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

export function drawHud(ctx, r, d) {
  const s = Math.max(0.75, Math.min(1.3, d.H / 900));
  const x = r.x;
  let y = r.y;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  for (const { key, label, unit, main, digits = 0 } of READOUTS) {
    ctx.font = font(13 * s);
    ctx.fillStyle = main ? COLORS.accentText : COLORS.muted;
    y += 14 * s;
    ctx.fillText(label, x, y);

    const size = (main ? 64 : 30) * s;
    y += size * 0.95;
    ctx.font = font(size, 500);
    ctx.fillStyle = main ? COLORS.accentText : COLORS.soft;
    const text = d.latest[key].toFixed(digits);
    ctx.fillText(text, x, y);
    const width = ctx.measureText(text).width;
    ctx.font = font(15 * s);
    ctx.fillStyle = main ? COLORS.accentText : COLORS.muted;
    ctx.fillText(unit, x + width + 6 * s, y);
    y += 14 * s;
  }

  // Thrust vs gravity: the bar spans 0-2 g, with the hover balance marked at the middle.
  y += 10 * s;
  ctx.font = font(13 * s);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('thrust vs gravity', x, y);
  y += 8 * s;
  const barH = 14 * s;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, r.w, barH);
  const fill = Math.min(d.thrustRatio, 2) / 2;
  ctx.fillStyle = d.thrustRatio >= 1 ? COLORS.accent : COLORS.line;
  ctx.fillRect(x + 2, y + 2, Math.max(0, (r.w - 3) * fill), barH - 3);
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + r.w / 2, y - 4 * s);
  ctx.lineTo(x + r.w / 2, y + barH + 4 * s);
  ctx.stroke();
  y += barH + 22 * s;
  ctx.font = font(14 * s);
  ctx.fillStyle = COLORS.light;
  const motion = Math.abs(d.v) < 0.02 ? 'holding'
    : d.v > 0 ? `climbing +${d.v.toFixed(2)}/s` : `falling ${d.v.toFixed(2)}/s`;
  ctx.fillText(`${d.thrustRatio.toFixed(2)} g · ${motion}`, x, y);

  y = divider(ctx, x, y + 16 * s, r.w);

  // Score
  y += 16 * s;
  ctx.font = font(13 * s);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('score', x, y);
  y += 36 * s;
  ctx.font = font(38 * s, 500);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(String(d.score), x, y);

  // Survival
  y += 24 * s;
  ctx.font = font(13 * s);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('alive', x, y);
  ctx.fillText('best', x + r.w * 0.45, y);
  y += 28 * s;
  ctx.font = font(26 * s, 500);
  ctx.fillStyle = d.alive ? COLORS.text : COLORS.red;
  ctx.fillText(d.alive ? formatTime(d.aliveTime) : 'crashed', x, y);
  ctx.fillStyle = COLORS.soft;
  ctx.fillText(formatTime(d.bestTime), x + r.w * 0.45, y);
  y += 22 * s;
  ctx.font = font(13 * s);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`distance ${formatDistance(d.distance)}`, x, y);
  y += 18 * s;
  ctx.fillText(`mines ${d.mines} · colonies ${d.colonies}`, x, y);
  y += 18 * s;
  ctx.fillText(`crashes ${d.crashes}`, x, y);

  y = divider(ctx, x, y + 14 * s, r.w);

  // Connection
  y += 20 * s;
  ctx.fillStyle = d.conn.color;
  ctx.beginPath();
  ctx.arc(x + 5 * s, y - 5 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(14 * s);
  ctx.fillStyle = COLORS.light;
  ctx.fillText(d.conn.label, x + 16 * s, y);
  y += 20 * s;
  ctx.font = font(13 * s);
  ctx.fillStyle = COLORS.muted;
  const rate = d.rateHz ? `${d.rateHz.toFixed(1)} Hz` : '— Hz';
  const age = Number.isFinite(d.ageMs) ? `data age ${Math.round(d.ageMs)} ms` : 'no data';
  ctx.fillText(`${rate} · ${age}`, x, y);
  if (d.simActive) {
    y += 18 * s;
    ctx.fillText(`sim target ${d.simWatts} W`, x, y);
  }

  // Key help, pinned to the bottom of the HUD column when there's room.
  const lineH = 18 * s;
  const helpTop = Math.max(y + 28 * s, r.y + r.h - KEY_HELP.length * lineH);
  ctx.font = font(12 * s);
  KEY_HELP.forEach(([key, text], i) => {
    const ly = helpTop + i * lineH;
    ctx.fillStyle = COLORS.soft;
    ctx.fillText(key, x, ly);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(text, x + 52 * s, ly);
  });

  ctx.restore();
}

function divider(ctx, x, y, w) {
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 0.5);
  ctx.lineTo(x + w, y + 0.5);
  ctx.stroke();
  return y;
}

// Rolling input (normalised to hover, 0-2x) and ship height within the cavern
// gap (0-1) on one axis, so the dashed line is hover and mid-gap at once.
export function drawTrace(ctx, r, trace) {
  ctx.save();
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);

  ctx.font = font(12);
  ctx.fillStyle = COLORS.line;
  ctx.fillText(`last ${TRACE_SECONDS} s`, r.x + 10, r.y + 18);
  legend(ctx, r.x + r.w - 130, r.y + 18, COLORS.accentText, 'input');
  legend(ctx, r.x + r.w - 66, r.y + 18, COLORS.light, 'height');

  const pad = 6;
  const top = r.y + pad;
  const h = r.h - pad * 2;
  ctx.strokeStyle = COLORS.line;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(r.x, top + h / 2);
  ctx.lineTo(r.x + r.w, top + h / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const { samples, capacity } = trace;
  const xAt = (i) => r.x + r.w - (samples.length - 1 - i) * (r.w / (capacity - 1));
  const plot = (color, valueOf) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((sample, i) => {
      const v = Math.max(0, Math.min(1, valueOf(sample)));
      const py = top + h * (1 - v);
      if (i === 0) ctx.moveTo(xAt(i), py);
      else ctx.lineTo(xAt(i), py);
    });
    ctx.stroke();
  };
  plot(COLORS.accentText, (sample) => sample.n / TRACE_MAX_N);
  plot(COLORS.light, (sample) => sample.y);
  ctx.restore();
}

function legend(ctx, x, y, color, label) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 4, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(label, x + 8, y);
}
