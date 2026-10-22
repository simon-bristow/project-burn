// Web Bluetooth connection to a smart trainer. Prefers the Fitness Machine
// Service (FTMS) and falls back to the Cycling Power Service (CPS).

const FTMS = 0x1826;
const INDOOR_BIKE_DATA = 0x2ad2;
const CPS = 0x1818;
const CP_MEASUREMENT = 0x2a63;
const WHEEL_CIRCUMFERENCE_M = 2.105; // 700x25c, only used for CPS speed
const STOPPED_AFTER_MS = 2000;

export class Trainer {
  constructor(onSample, onState) {
    this.onSample = onSample;
    this.onState = onState;
    this.device = null;
    this.protocol = null;
    this.state = 'idle'; // idle | connecting | connected | lost
    this.revs = {};
  }

  static get supported() {
    return !!navigator.bluetooth;
  }

  get name() {
    return this.device?.name || 'Trainer';
  }

  setState(state) {
    this.state = state;
    this.onState(state);
  }

  async connect() {
    if (!Trainer.supported) {
      throw new Error("Web Bluetooth isn't available here. Use Chrome or Edge on localhost.");
    }
    if (!this.device) {
      // Throws NotFoundError if the user cancels the picker.
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS] }, { services: [CPS] }],
        optionalServices: [FTMS, CPS],
      });
      this.device.addEventListener('gattserverdisconnected', () => this.setState('lost'));
    }
    this.setState('connecting');
    try {
      const server = await this.device.gatt.connect();
      await this.subscribe(server);
      this.revs = {};
      this.setState('connected');
    } catch (err) {
      this.setState('lost');
      throw err;
    }
  }

  async subscribe(server) {
    try {
      const service = await server.getPrimaryService(FTMS);
      const ch = await service.getCharacteristic(INDOOR_BIKE_DATA);
      ch.addEventListener('characteristicvaluechanged', (e) => this.onSample(parseIndoorBikeData(e.target.value)));
      await ch.startNotifications();
      this.protocol = 'FTMS';
      return;
    } catch (err) {
      console.info('FTMS unavailable, falling back to CPS', err);
    }
    const service = await server.getPrimaryService(CPS);
    const ch = await service.getCharacteristic(CP_MEASUREMENT);
    ch.addEventListener('characteristicvaluechanged', (e) => this.onSample(this.parseCyclingPower(e.target.value)));
    await ch.startNotifications();
    this.protocol = 'CPS';
  }

  // Cycling Power Measurement: power is always present; cadence and speed are
  // derived from cumulative crank and wheel revolution counters.
  parseCyclingPower(dv) {
    const flags = dv.getUint16(0, true);
    const out = { power: dv.getInt16(2, true) };
    let o = 4;
    if (flags & 0x01) o += 1; // pedal power balance
    if (flags & 0x04) o += 2; // accumulated torque
    if (flags & 0x10) {
      const rate = this.revRate('wheel', dv.getUint32(o, true), dv.getUint16(o + 4, true), 2048, 0xffffffff);
      if (rate !== null) out.speed = rate * WHEEL_CIRCUMFERENCE_M * 3.6;
      o += 6;
    }
    if (flags & 0x20) {
      const rate = this.revRate('crank', dv.getUint16(o, true), dv.getUint16(o + 2, true), 1024, 0xffff);
      if (rate !== null) out.cadence = rate * 60;
      o += 4;
    }
    return out;
  }

  // Revolutions per second from two counter readings, or null if unchanged.
  revRate(key, revs, eventTime, ticksPerSecond, revMask) {
    const now = performance.now();
    const prev = this.revs[key];
    if (!prev) {
      this.revs[key] = { revs, eventTime, at: now };
      return null;
    }
    const dRevs = (revs - prev.revs) & revMask;
    const dTicks = (eventTime - prev.eventTime) & 0xffff;
    if (dRevs === 0 || dTicks === 0) {
      return now - prev.at > STOPPED_AFTER_MS ? 0 : null;
    }
    this.revs[key] = { revs, eventTime, at: now };
    return dRevs / (dTicks / ticksPerSecond);
  }
}

// FTMS Indoor Bike Data. Fields appear in a fixed order, each gated by a flag
// bit. Bit 0 is inverted: when it is 0, instantaneous speed is present.
// A packet may carry only some fields, so callers merge what is present.
export function parseIndoorBikeData(dv) {
  const flags = dv.getUint16(0, true);
  const out = {};
  let o = 2;
  if (!(flags & 0x0001)) { out.speed = dv.getUint16(o, true) / 100; o += 2; }
  if (flags & 0x0002) o += 2; // average speed
  if (flags & 0x0004) { out.cadence = dv.getUint16(o, true) / 2; o += 2; }
  if (flags & 0x0008) o += 2; // average cadence
  if (flags & 0x0010) o += 3; // total distance
  if (flags & 0x0020) o += 2; // resistance level
  if (flags & 0x0040) { out.power = dv.getInt16(o, true); o += 2; }
  return out;
}
