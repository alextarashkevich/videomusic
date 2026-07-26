# Gesture Synth

A browser instrument played with your hands in front of a webcam. The right hand picks
*which* chord, the left hand shapes *how* it sounds.

Sound is sustained, like an organ or a theremin: while a gesture is held, the chord rings.

## Gestures

Recognition is by **which** fingers are extended, not how many — "коза" (index + pinky)
and "two fingers" (index + middle) are both two fingers and can only be told apart by
identity.

### Right hand — what to play

| Gesture | Scale degree |
| --- | --- |
| 1 finger | I |
| 2 fingers | II |
| 3 fingers | III |
| thumb + index + middle | III — the same, counted the German way |
| 4 fingers | IV |
| open palm | V |
| коза (index + pinky) | VI |
| коза + thumb | VII |

Rotating the wrist switches the chord between **major** (upright) and **minor** (tilted).

### Left hand — how it sounds

| Gesture | Effect |
| --- | --- |
| fist | mute, fading smoothly |
| 1 finger | triad |
| 2 fingers | triad + octave |
| 3 fingers | seventh chord |

Every setting is a chord, and every one contains the third — which is what the wrist tilt
changes, so major and minor are audible whatever the left hand is doing.

Raising and lowering the hand sets **volume**, down to a floor rather than to nothing:
dropping your hand thins the sound out, and silence belongs to the fist. Tilting the left
wrist warps the visuals; no audio effect is mapped to it at the moment.

An unrecognised hand shape holds whatever was playing, so rearranging your fingers never
produces a stray note.

Which physical hand does which job depends on your browser and camera. If the wrong hand
is choosing chords, turn on **Swap hands** in the tuning panel.

### Inversions

Chords are voiced by moving each voice to the nearest note of the next chord rather than
stacking every one from its root. Going from C to Am, the voices already holding C and E
stay where they are and only one moves — which is what stops a progression marching
around the keyboard in parallel blocks.

## Keys

Everything here is also a button along the bottom of the screen, so none of it has to be
remembered. Shortcuts are matched on the physical key rather than the character it types,
so they work on any keyboard layout.

| Key | |
| --- | --- |
| `T` | tuning panel — every threshold, adjustable while playing |
| `⇧G` | show or hide the song guide |
| `G` | next song |
| `1`–`5` | synth: Organ, Warm pad, Rock organ, Strings, Glass |
| `X` | swap which hand plays chords |
| `H` | hide the readout and the buttons |
| `S` | hide the hand skeleton |

`H` and `S` together leave just the instrument and the shader, for filming.

## Songs

The guide follows you rather than a clock: play the highlighted chord, hold it for a
moment, and it steps on. Nothing pushes.

Progressions are stored as scale degrees, so they follow whichever root and scale the
instrument is set to. **Creep** is the one to try first — its last two chords are the same
fingers with the wrist turned, which is the tilt gesture and nothing else. Several of the
others (Wonderwall, Dust in the Wind, Stairway) need the second degree played major, which
is only reachable by tilting too.

## Latency

There is some, and it is mostly deliberate:

| | |
| --- | --- |
| camera capture and transport | ~40 ms |
| hand tracking | 10–20 ms, shown live in the readout |
| stability gate, 2 frames at 30 fps | ~66 ms |
| glide and parameter ramp | ~100 ms |
| audio lookahead | 20 ms |

Around 200 ms on a chord change. Volume skips the stability gate and lands nearer 150 ms. Every one of those numbers is a slider in the tuning panel —
shortening the stability gate is the biggest win, at the cost of the occasional stray
chord while your fingers are still moving.

## Tuning

Recognition thresholds, the major/minor angle, the volume band and the feel of the
smoothing are all things that can only be settled by playing. Press `T` and drag — every
change is audible immediately and is saved, so a session survives a reload. "Reset to
defaults" undoes the lot.

If a gesture is being missed, the readout shows the finger mask it is actually seeing
(`TIMRP`, one letter per finger) alongside the wrist angle. Under it is `reach` — how far
each fingertip is from its own knuckle, which is the number the extension threshold is
compared against. Hold up one finger, then two, and read both rows: the threshold belongs
between them. That beats guessing at it.

**Stability** is the speed/accuracy trade. Lower it and the instrument answers sooner;
lower it too far and shapes your fingers pass through on the way somewhere else start
sounding.

## Privacy

Everything runs on your device. The hand tracking model is a static file that executes
locally in your browser, and no camera frame is ever sent anywhere. There is no backend,
no analytics and no account.

There are also no API keys — and there is no way to hide one in a static site, since the
build inlines environment variables straight into the bundle. If this app ever needs a
secret, it will need a backend to hold it.

## Running it locally

```bash
npm install
npm run fetch:model   # only needed if public/models/ is empty
npm run dev
```

Then open the printed URL. `localhost` counts as a secure context, so the camera works
without HTTPS during development.

```bash
npm test        # unit tests for the gesture and voicing logic
npm run build   # type-check and produce dist/
```

## How it is put together

The musical logic is pure functions over hand landmark arrays — no camera, no audio, no
DOM — so gesture thresholds can be tuned under unit tests instead of by rebuilding and
waving at the screen.

```
src/
  vision/     camera + MediaPipe hand tracking
  gesture/    landmarks → PerformanceState   (pure, tested)
  audio/      PerformanceState → sound       (voicing is pure, tested)
  music/      song progressions as scale degrees
  visual/     shader background + hand overlay
  ui/         tuning panel, song guide
```

`PerformanceState` is the only interface between seeing and hearing: vision knows nothing
about music, audio knows nothing about hands.

Built with [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker),
[Tone.js](https://tonejs.github.io/) and [Three.js](https://threejs.org/).
