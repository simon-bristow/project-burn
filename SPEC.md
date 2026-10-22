# Project Burn — Prototype 0: "Does it feel good?"

## Goal

Prove that pedalling a Tacx Neo 2T can steer a vector spacecraft in a way that feels good:

- **Pedal** → the ship thrusts upward.
- **Freewheel** → gravity pulls the ship down.

This is a feel test and nothing more. There are no levels, no enemies and no scoring beyond a couple of feel metrics. Success means you get off the bike knowing which input signal and which physics settings feel right, and that the settings are saved.

## Decisions so far

| Topic | Decision |
|---|---|
| Platform | Single web page in Chrome on macOS, using Web Bluetooth. No build step. |
| Input signal | Read power, cadence and speed, and switch between them live. |
| Physics | Thrust vs gravity, with momentum. Steady effort lets you hover. |
| Tuning | On-screen sliders and a live readout. Settings persist between sessions. |
| Trainer resistance | Read-only. The game never writes to the trainer; you vary effort with your gears. |
| Bounds | ~~Bounded box~~ Superseded by the cavern in Prototype 1 below. |
| Hover effort | Set as a percentage of your FTP. Defaults: FTP 250 W, hover at 60%. |
| Feel trace | Included: a rolling 20-second graph of input vs ship height. |
| No-trainer mode | Keyboard simulator: hold **Z** to pedal. Space is now the fire button. |
| Display | Laptop on a stand, about 1m away. Large readouts and big slider hit-targets. |

---

## Prototype 1: cavern side-scroller

The box test showed the input is responsive enough, so the game becomes a Scramble-style side-scroller (Scramble, 1981).

| Topic | Decision |
|---|---|
| Scrolling | Constant forward speed (tunable). Pedalling only controls height. |
| Camera | Zoomed out, with a small ship sitting about 15% in from the left so you can see far ahead. The camera follows the cavern vertically and leans toward the terrain ahead. |
| World | An endless cavern built from section types, from a seed, so the same seed gives the same cavern. A **New cavern** button picks a new seed. |
| Start | The game opens on a **Ready** screen with the world frozen. Input, readouts, the thrust bar, the flame and the trace all run live, so you can connect and test the trainer. **Start** (button or Enter) runs a 5-second countdown. Resuming from pause and respawning keep the 3-second countdown. **New cavern** returns to Ready. |
| Practice | Every cavern starts with about **91 s of straight, empty cavern**. The centre line stays level, and the gap gently narrows and widens in 7 s steps, tightening from 0.9 to 0.6 so control gets a little harder as you settle in. It's labelled "practice · 91 s · find your hover, press T to tune", so test riders have time to set FTP, hover and smoothing before anything can hit them. |
| Warm-up | After the practice stretch: about 20 s of near-flat, wide cavern with two mines around mid-height, at roughly 10 s and 16 s. Then a gentle climb (1.08–1.12× hover, 6–8 s), a short flat with one mine, a moderate climb (1.18–1.25×, 8–10 s), a short flat with a mine and a pillar, and then the first big climb (1.4–1.5×, 12–15 s). There are no mines on any warm-up climb. With the defaults that works out to roughly 165 W, then 183 W, then 215 W. Sections are random after that. |
| Sections | **Cruise:** gentle undulation, with mines and pillars. **Ramp:** a sustained climb. **Mountain:** a climb, a short summit, then a descent. **Squeeze:** a narrow gap to hold steady through. **Drop:** a coasting descent. |
| Effort-based slopes | A climb is generated from the effort it needs, e.g. 1.15–1.5× hover for 8–15 s, so with the defaults a ramp means holding roughly 170–225 W. Each climb is labelled in the world with the effort it needs in the active unit, such as "climb · 190 W · 12 s". The label is recalculated whenever tuning changes. Descents are kept below the ship's terminal fall speed, so they can always be followed by coasting. |
| Obstacles | **Mines** are red and bob gently; one missile destroys them. **Rock pillars** grow from the floor or the ceiling and can't be destroyed. They never block more than about 45% of the gap. |
| Weapon | Space fires a missile straight ahead. Only one can be in flight at a time. |
| Bombs | **B** drops a bomb. It falls under gravity, keeping the ship's forward speed plus a small forward toss, so it lands a little ahead. Only one can be in the air at a time. It destroys a colony or a mine it hits, and puffs dust if it misses. |
| Colonies | Small alien colonies (purple domes and towers with blinking lights) sit on the floor of some flat stretches: about half of the random cruise sections, plus one in the warm-up between the two moderate climbs. Flying into a colony counts as a crash. |
| Colony missiles | If you fly about 0.25 units past a colony without bombing it, it launches a missile at 1.35× scroll speed. While the missile is behind you it steers loosely toward your height, with a top vertical speed of 0.3 u/s. Once it draws level it stops steering and flies straight, so a late dodge makes it miss. It hits you about 1.4 s after launch if you hold steady. It can hit the cavern walls. Once it's ahead of you, it can be shot down. On a rewind, colonies you're sent back in front of get their missile back. |
| Score | Mine = 1 point (missile or bomb). Colony = 2 points. Shooting down a colony missile = 1 point. The score is shown large in the HUD, with a "+N" popup where the points were won. |
| Crash | Hitting a wall, a pillar or a mine destroys the ship. After 1.5 s the game rewinds about 3 s, to a spot clear of obstacles, then runs the 3-2-1 countdown with your input live. Mines you've already destroyed stay destroyed. |
| HUD | Adds distance, crash count and mines destroyed. The feel trace plots height *within the cavern gap*. |
| Tuning | Adds **Scroll speed** and **View height** (zoom). |

---

## 1. Trainer connection

### Bluetooth services
The Neo 2T advertises both of these. The game prefers FTMS and falls back to CPS.

| Service | UUID | Characteristic | What we get |
|---|---|---|---|
| Fitness Machine (FTMS) | `0x1826` | Indoor Bike Data `0x2AD2` (notify) | Speed (0.01 km/h), cadence (0.5 rpm), power (W) |
| Cycling Power (CPS) | `0x1818` | Cycling Power Measurement `0x2A63` (notify) | Power (W). Cadence and speed are derived from crank and wheel revolution counters. |

- **Indoor Bike Data parsing:** read the flags (uint16), then the fields in order. Flag bit 0 is *inverted*: when it is **0**, instantaneous speed is present. Bit 2 means cadence is present, and bit 6 means power is present. Fields we don't use (average speed, average cadence, distance, resistance) still have to be skipped by their byte widths.
- **Connect flow:** a "Connect trainer" button opens Chrome's device picker, filtered to the FTMS/CPS services. When the connection drops, the game shows a banner, keeps the physics running with an input of 0 (so the ship falls), and offers a one-click reconnect.
- **Exclusivity:** close Zwift, TrainerRoad, Tacx Training and similar apps first. They can hold the trainer's Bluetooth connection.

### Signal quality readout
The trainer sends data a few times a second, not every frame. The HUD shows:
- **Update rate (Hz)** for the active source, measured from the time between notifications.
- **Data age (ms)**: how long ago the last value arrived.

This lets us see how much of the "feel" is trainer lag and how much is physics.

### Known signal traits (to be confirmed on the bike)
- **Power** drops to about 0 within roughly a second of freewheeling. This is probably the most responsive source.
- **Cadence** is averaged by the trainer, so expect about 1s of lag.
- **Speed** follows the Neo's simulated flywheel and decays slowly after you stop pedalling. It will probably feel floaty, and that's worth confirming.

---

## 2. Keyboard simulator

Available whenever no trainer is connected. Toggle it with **K**.

- **Hold Space** to pedal. Power ramps up to *Sim watts* (default 200 W) over about 0.5s, and cadence jumps to 90 rpm.
- **Release** to freewheel. Power falls to 0 over about 0.5s and cadence to 0 straight away. Speed decays slowly, imitating the flywheel.
- **Up/Down arrows** change Sim watts by ±10 W while you hold Space, to imitate changing effort.
- **Mimic trainer update rate** (on by default): the simulator only emits a value every 250 ms, so desk testing has trainer-like steps rather than perfectly smooth input.

---

## 3. Physics

The ship's x position is fixed at the horizontal centre. Only vertical motion is simulated. Units are **box heights**: the box is 1.0 tall, and position runs from 0 (floor) to 1 (ceiling).

Each frame, with a fixed 120 Hz physics step and interpolated rendering:

```
raw      = value from the active source (W, rpm or km/h)
s        = smooth(raw)                       // exponential moving average, time constant = Smoothing
s        = s < Deadband ? 0 : s
n        = s / HoverPoint                    // 1.0 means "exactly cancels gravity"
thrust   = Gravity * min(n ^ Curve, MaxThrust)
accel    = thrust - Gravity - Drag * velocity
velocity += accel * dt
position += velocity * dt
```

The key design idea is the **hover point**. Gravity is not tuned against an abstract "thrust scale". Instead you set the effort at which the ship hovers, such as *60% of FTP*, *80 rpm* or *25 km/h*. Setting the power hover point from FTP makes the same setting feel about as hard for any rider. Riding above it climbs and riding below it sinks. Each source has its own hover point, so switching source doesn't throw everything off.

### Crash rule
- If the ship touches the floor (y ≤ 0) or the ceiling (y ≥ 1), it **crashes**. It breaks into vector line debris with a short screen shake.
- After **1.5s**, it respawns at mid-height with zero velocity and blinks for **1s** of invulnerability. Thrust is live straight away, so you can catch it.

---

## 4. Tuning panel

Toggle with **T**. The panel docks on the right and uses large sliders (at least 44px tall, easy to grab with a trackpad mid-ride).

| Control | Default | Range | Notes |
|---|---|---|---|
| Input source | Power | Power / Cadence / Speed | Can also be changed with keys **1 / 2 / 3** |
| FTP | 250 W | 100–450 W | Your functional threshold power |
| Hover point (Power) | 60% FTP | 30–100% FTP | Shown in both % and W (60% of 250 W = 150 W) |
| Hover point (Cadence) | 80 rpm | 40–120 rpm | |
| Hover point (Speed) | 25 km/h | 10–50 km/h | |
| Gravity | 0.6 box/s² | 0.1–2.0 | Higher values feel heavier and twitchier |
| Drag | 0.8 /s | 0–3 | Higher values give a lower terminal velocity and a "thicker air" feel |
| Smoothing | 0.3 s | 0–2 s | 0 uses the raw trainer steps |
| Response curve | 1.0 | 0.5–2.5 | Above 1, the ship eases in gently near hover and responds hard to sprints |
| Max thrust | 3.0 × g | 1–6 | Caps how hard a sprint can launch the ship |
| Deadband | 15 W / 20 rpm / 3 km/h | per source | Below this counts as freewheeling |
| Sim watts | 200 W | 50–600 W | Keyboard simulator only |

- Settings are saved in the browser on every change and restored on load.
- **Copy settings** copies the current settings to the clipboard as JSON, so you can note a good combination.
- **Reset** returns everything to the defaults.

---

## 5. Screen and HUD

**Style:** black background, thin glowing vector lines in the spirit of Asteroids or Lunar Lander, with one accent colour.

- **The box:** a large outlined rectangle filling about 80% of the screen height. The floor and ceiling lines pulse red as the ship gets close.
- **The ship:** a vector triangle with a **flame whose length scales with thrust**. This is the most important feedback element, because it shows the trainer is being read before the ship has visibly moved.
- **HUD (top-left):**
  - Large numbers for **W**, **rpm** and **km/h**, with the active source highlighted.
  - A **thrust vs gravity bar** with a marker where they balance. It fills past the marker when you're climbing.
  - Ship vertical speed.
  - Connection state, update rate and data age.
  - Time alive (current and best) and the crash count.
- **Feel trace (bottom strip):** a rolling 20-second graph of the active input signal and the ship's height. It makes it easy to see lag and overshoot after a test run.

---

## 6. Code layout

The project is plain ES modules with no build. Serve it from `localhost`, because Web Bluetooth needs a secure context:

```
python3 serve.py   # then open http://localhost:8000 in Chrome
```

```
index.html
src/
  main.js        game loop: fixed-step physics + render
  trainer.js     Web Bluetooth connect, FTMS + CPS parsing, rate/age stats
  sim.js         keyboard simulator (same output shape as trainer.js)
  input.js       picks the active source, applies smoothing and deadband
  physics.js     thrust/gravity/drag integration, crash detection
  render.js      canvas vector drawing, flame, debris, box
  hud.js         readouts, thrust bar, feel trace
  tuning.js      slider panel, persistence, copy/reset
```

`trainer.js` and `sim.js` both emit the same `{ power, cadence, speed, t }` samples. Nothing downstream needs to know which one is active.

macOS one-off: Chrome needs Bluetooth permission under System Settings → Privacy & Security → Bluetooth.

---

## 7. Feel test protocol

Run each of these with each input source and note the settings that felt best:

1. **Hover:** hold the ship mid-box for 30s. Is it achievable at a sustainable effort? Does it drift annoyingly?
2. **Climb and stop:** go from near the floor to near the ceiling and stop without crashing.
3. **Drop and catch:** freewheel from the top and recover before the floor. Is the lag between pedalling again and the ship responding acceptable?
4. **Sprint:** does a hard effort feel rewarding without being uncontrollable?
5. **Five minutes of play:** is it fun to stay alive on its own? How tiring is it?

## Out of scope for this prototype
Horizontal movement, obstacles, levels, sound, controlling trainer resistance, ANT+, mobile, Safari.
