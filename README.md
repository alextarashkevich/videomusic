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
| 4 fingers | IV |
| open palm | V |
| коза (index + pinky) | VI |
| коза + thumb | VII |

Rotating the wrist switches the chord between **major** (upright) and **minor** (tilted).

### Left hand — how it sounds

| Gesture | Effect |
| --- | --- |
| fist | mute, fading smoothly |
| 1 finger | single note |
| 2 fingers | note + octave |
| 3 fingers | full triad |

Tilting the wrist drives **distortion**. Raising and lowering the hand sets **volume**.

An unrecognised hand shape holds whatever was playing, so rearranging your fingers never
produces a stray note.

## Keys

| Key | |
| --- | --- |
| `T` | tuning panel — every threshold, adjustable while playing |
| `H` | hide the readout |
| `S` | hide the hand skeleton |

`H` and `S` together leave just the instrument and the shader, for filming.

## Tuning

Recognition thresholds, the major/minor angle, the volume band and the feel of the
smoothing are all things that can only be settled by playing. Press `T` and drag — every
change is audible immediately and is saved, so a session survives a reload. "Reset to
defaults" undoes the lot.

If a gesture is being missed, the readout shows the finger mask it is actually seeing
(`TIMRP`, one letter per finger) alongside the wrist angle, which is usually enough to
tell which threshold is wrong.

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
  audio/      PerformanceState → sound
  visual/     shader background + hand overlay
```

`PerformanceState` is the only interface between seeing and hearing: vision knows nothing
about music, audio knows nothing about hands.

Built with [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker),
[Tone.js](https://tonejs.github.io/) and [Three.js](https://threejs.org/).
