# Project Burn

A Scramble-style cavern-flying arcade game that you steer by pedalling your smart trainer. Pedal to climb and freewheel to sink. Shoot mines, bomb alien colonies, and hold the effort through long climbs.

**Play:** https://simon-bristow.github.io/project-burn/

This is an early prototype, shared to get feedback on how it feels.

## What you need

- **Chrome or Edge on a laptop or desktop.** Chrome on Android should also work. Safari and every browser on iPhone or iPad won't work, because they don't support Web Bluetooth.
- **A smart trainer that broadcasts over Bluetooth** with the standard Fitness Machine (FTMS) or Cycling Power service. It has been built against a Tacx Neo 2T; most current smart trainers should work.
- Close Zwift, TrainerRoad or any other app that might be holding the trainer's Bluetooth connection.

No trainer? The keyboard simulator lets you try it: hold **Z** to pedal.

The game only *reads* from the trainer. It never changes resistance, so you set the effort with your gears.

## How to play

1. Open the link, then click **Connect trainer** and pick your trainer.
2. On the **Ready** screen, pedal a little and check the watts, rpm and km/h readouts respond.
3. Set your **FTP** in the tuning panel. By default the ship hovers at 60% of FTP.
4. Press **Start** or **Enter**. You get a 5-second countdown to spin up.

Every cavern eases you in. There are about 40 seconds of straight, empty **practice** to get a feel for the ship and adjust the tuning. Then comes a flat stretch of **targets**: shoot mines with Space and bomb colonies with B. After that come gentle **climbs and coasts**, with the first big climb at about two minutes.

Pedal above your hover effort to climb, and ease off or freewheel to sink. Each climb shows the effort it needs, such as "▲ climb · 190 W · 12 s", so you can see it coming.

| Key | Action |
|---|---|
| Enter | Start |
| Space | Fire missile (one at a time) |
| B | Drop bomb (one at a time) |
| P | Pause / resume |
| Q | Quit the run and go back to the Ready screen (same cavern, fresh start) |
| T | Show or hide the tuning panel |
| C | Connect trainer |
| Z | Pedal (keyboard simulator) |
| ↑ / ↓ | Simulator watts |
| K | Simulator on/off |

**Scoring:** a mine is 1 point, a colony is 2, and a colony missile shot down is 1. If you fly past a colony without bombing it, it fires a missile that chases you loosely. Change height at the last moment and it flies past, then shoot it.

**Crashing** rewinds you a few seconds, with a 3-second countdown.

## Tuning

Press **T** for the tuning panel. Your settings are saved in your browser.

- **Hover:** the effort that exactly holds your height. Raise it if the game feels too easy, and lower it if it's too hard.
- **Gravity / Drag:** how heavy and how floaty the ship feels.
- **Smoothing:** evens out jumpy trainer readings. More smoothing adds lag.
- **Scroll speed / View height:** how fast the cavern moves and how far ahead you can see.

## Feedback

Use **Send feedback** in the tuning panel. It opens a GitHub issue pre-filled with your settings and setup. Add a few lines on how it felt and which settings you changed. You'll need a GitHub account.

## Running it locally

```bash
python3 serve.py
```

Then open http://localhost:8000 in Chrome. There's no build step; it's plain HTML and JavaScript modules. `serve.py` turns off browser caching so a normal reload always picks up changes.

The design notes are in [SPEC.md](SPEC.md).
