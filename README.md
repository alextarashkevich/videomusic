# Gesture Synth

A browser instrument played with your hands in front of a webcam. The right hand picks
*which* chord, the left hand shapes *how* it sounds.

Most of the sounds are sustained, like an organ or a theremin: while a gesture is held, the
chord rings. Some are struck instead — see **Sounds** below.

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

Major or minor is chosen by the **other** hand — see below. The chord hand only ever has to
hold a shape square to the camera.

### Left hand — how it sounds

| Gesture | Effect |
| --- | --- |
| fist | mute, fading smoothly |
| 1 finger | triad |
| 2 fingers | triad + octave |
| 3 fingers | seventh chord |
| thumb out | major |
| thumb tucked | minor |

The thumb is read separately from the fingers, so it is free to choose major or minor
whatever density you are holding.

This used to be a lean of the chord hand, and it asked one hand to do two things at once —
where the second actively spoiled the first, because a rotated hand is a harder hand for the
tracker to read, exactly when it is being asked for a shape. Two hands, two jobs.

Where the boundary sits is a property of a thumb rather than of a number, so the live angle
is in the readout next to the two thresholds: hold the thumb out, tuck it in, and put them
either side of the gap. There are two of them rather than one so a thumb resting near the
boundary cannot flip the chord several times a second.

Every setting is a chord, and every one contains the third — which is what major and minor
change, so the two are audible whatever density you are holding.

Raising and lowering the hand sets **volume**, down to a floor rather than to nothing:
dropping your hand thins the sound out, and silence belongs to the fist. Tilting the left
wrist warps the visuals; no audio effect is mapped to it at the moment.

An unrecognised hand shape holds whatever was playing, so rearranging your fingers never
produces a stray note.

Which physical hand does which job depends on your browser and camera. If the wrong hand
is choosing chords, turn on **Swap hands** in the tuning panel.

### Calibration

Out of the box, recognition is geometric: a finger counts as up when its tip has reached far
enough from its knuckle **in the direction that knuckle points**, over that finger's own bone
lengths.

Both halves of that took a wrong turn first. Measuring against palm width put a short pinky
two and a half times closer to the threshold than a long middle finger, so коза — the one
gesture that needs the pinky — was the one that failed. And measuring the plain distance from
knuckle to tip asks how *straight* a finger is, which is a different question from whether it
is raised: a finger dropped at its base while staying straight along its length is still
perfectly straight, and read as up. That is how three fingers played as four.

Press `C` and it stops guessing. The walkthrough shows each gesture in turn, records about
a second and a half of your hand, and afterwards recognises shapes by comparing them to
what you actually did. It asks you to turn and tilt your hand while it records, and that is
the important part — the instrument is played with the hand leaning, so a gesture captured
from one angle is a gesture recognised from one angle.

The measured difference, against generated hands with tracker noise: for almost anyone the
rules are now perfect and calibration buys nothing. They still run out at the edge — a hand
that barely moves its fingers at all, a quarter of the way, falls to under 40% where a
calibration gets essentially all of them. One threshold standing in for everybody works for
most of everybody, and calibration is for the rest.

Nothing leaves the browser. The model is a few thousand numbers in `localStorage`, and
pressing `C` again clears it.

## Sounds

Eight of them, in two kinds.

**Held** — Clean synth, Organ, Warm pad, Strings, Glass. Four oscillators attacked once
when the instrument starts and never triggered again; everything audible is done with
gains. There is no note-on latency at all, and the fist fades rather than cutting because
there is nothing to cut.

**Struck** — Piano, E-piano, Pluck. These re-attack whenever the chord changes, and then
ring out and fade on their own. That makes them play differently: holding a gesture is
holding a chord that is dying, not one that is sustaining, so you change gesture to play
again. Because the left hand's density is part of the chord, reaching for a seventh also
re-strikes — which turns out to be the natural "hit it again" gesture.

**Piano** is a recorded one, not a synthesised imitation: Salamander Grand Piano by
Alexander Holm, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), one sample every
minor third from C1 to C7. About 1.8 MB, committed to the repo and served from our own
origin like everything else here. It loads the first time you choose it rather than at
startup, so nobody waits for a piano they were not going to play.

Presets are level-matched so switching one changes the sound and not the volume. The
numbers are measured rather than guessed — load the app with `?trims=1` and it prints them.

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
| `1`–`8` | sound: Clean synth, Piano, E-piano, Pluck, Organ, Warm pad, Strings, Glass |
| `X` | swap which hand plays chords |
| `C` | calibrate — hold each gesture once; press again to clear |
| `H` | hide the readout and the buttons |
| `S` | hide the hand skeleton |

`H` and `S` together leave just the instrument and the shader, for filming.

## Songs

The guide follows you rather than a clock: play the highlighted chord, hold it for a
moment, and it steps on. Nothing pushes.

Progressions are stored as scale degrees, so they follow whichever root and scale the
instrument is set to. **Creep** is the one to try first — its last two chords are the same
fingers on the chord hand, with only the other hand's thumb moving. Several of the others
(Wonderwall, Dust in the Wind, Stairway) need the second degree played major, which is the
same gesture again.

## Latency

There is some, and it is mostly deliberate:

| | |
| --- | --- |
| camera capture and transport | ~40 ms |
| hand tracking | 10–20 ms, shown live in the readout |
| stability gate, 1 frame at 30 fps | ~33 ms |
| glide and parameter ramp | ~100 ms |
| audio lookahead | 20 ms |

Around 100 ms on a chord change. Volume skips the stability gate and lands lower still. Every one of those numbers is a slider in the tuning panel —
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

The thumb has its own row, in degrees: how far it is swung off the line of the palm.
That is what separates an open palm from four fingers, and коза from коза with the thumb.

**Stability** is the speed/accuracy trade. Lower it and the instrument answers sooner;
lower it too far and shapes your fingers pass through on the way somewhere else start
sounding.

**Depth-aware shape** reads the hand from the tracker's 3D output rather than the flat
image, so turning your hand away from the camera cannot shorten a finger into reading as
folded. The depth estimate is the noisiest thing the tracker produces, so if recognition
gets jumpier rather than steadier, turn it off.

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
