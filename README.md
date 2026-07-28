# Gesture Synth

A browser instrument played with your hands in front of a webcam. The right hand picks
*which* chord, the left hand shapes *how* it sounds.

Every sound sustains, like an organ or a theremin: while a gesture is held, the chord rings.
Three of the five are recordings of real instruments — see **Sounds** below.

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
| 3 or 4 fingers | seventh chord |
| thumb out | major |
| thumb tucked | minor |

The thumb is read separately from the fingers, so it is free to choose major or minor
whatever density you are holding.

Fingers are **counted** here, not matched against particular shapes, which is the one place
the two hands work differently. The chord hand has to match on identity — коза and two
fingers are both two fingers and have to mean different degrees. This hand has three
voicings and no such problem, so any shape with two fingers up is two fingers up, коза
included.

That difference is worth stating because the alternative was tried and was much worse. This
hand used to match a table of three exact shapes, and everything else — four fingers, an
open palm, a коза, or simply a pinky drifting up while three were held — fell off the end of
it into "hold what you had". The hand would go quiet and stay quiet with nothing to say why.
Same measurements as the chord hand and the same thresholds, but it forgave three shapes
where the other forgave seven, and it felt broken.

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
produces a stray note. On the chord hand that covers the shapes you pass through on the way
from one degree to another; on the shaping hand it now only happens under a calibration,
since counting fingers gives every shape a meaning.

Which physical hand does which job depends on your browser and camera. If the wrong hand
is choosing chords, press <kbd>X</kbd> or turn on **Swap hands** in the tuning panel.

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

Five of them, and every one sustains for as long as you hold the gesture.

**Recorded** — Organ, Warm pad, Strings. Real instruments, not synthesised imitations: a
pipe organ, a harmonium, and a string section with a double bass under the bottom voice and
violins over the top. From
[tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments),
[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), about 5.5 MB across the three,
committed to the repo and served from our own origin like everything else here. Each loads
the first time you choose it, so nobody waits for a string section they were not going to
play.

**Oscillator** — Clean synth and Glass. Four voices attacked once when the instrument starts
and never triggered again; everything audible is done with gains, so there is no note-on
latency at all. These two stay synthetic on purpose: they are synthetic sounds by name and
by intent, and Clean synth is also the one that has to make sound before anything has
downloaded.

The three earlier presets that *decayed* — a piano, an electric piano and a pluck — have
gone. On an instrument played by holding a shape, a chord that dies while your hand is still
up fights the way the thing is played: you end up wiggling a finger to restate a chord you
never stopped asking for.

A recording is finite, though, which is a problem a held oscillator does not have. The
lengths here are ten to thirteen seconds — measured, not assumed, and one of them is cut off
mid-note rather than fading. So a held chord is quietly played again before its recording
runs out, releasing the ringing notes over a 1.4-second tail while the new ones come in
underneath. On the two organs there is no attack transient to hear; on the strings it reads
as a bow change, which is what a real player holding a long note does anyway.

Presets are level-matched so switching one changes the sound and not the volume. The
numbers are measured rather than guessed — load the app with `?trims=1` and it prints them.

### Voicing

Four voices, split the way a keyboard player splits a chord between two hands.

**Voice one is the bass**: the chord root, in the bottom octave of the register, every time.
It is the only voice with a fixed role.

**The other three are voice-led** — each moves to the nearest note of the next chord rather
than stacking up from the root. Going from C to Am, the voices already holding C and E stay
where they are and only one moves, which is what stops a progression marching around the
keyboard in parallel blocks. They swap roles freely to make that happen; three voices is six
possible assignments, so the cheapest is found by trying all of them.

The bass used to join that dance, and it was worse in two ways that both reached the ear.
The bass note became incidental — whichever voice was cheapest to move took the low root, so
some chords had no bass at all. And with every voice free to roam the whole register,
minimising movement produced voicings like C2-E3-G4-C4: a two-octave hole in the middle with
the chord hanging above it. How far a chord moves is not the only thing that matters about
it; where it sits is the other.

Before any of this the root sat level with the rest, packing every chord into a single
octave above it. The instrument then had no bottom at all — nothing below C3 sounded, at any
density — and a close triad with nothing underneath is a thin, mid-register sound. The
thinnest density is where that was most exposed, which is exactly where it was noticed.

## Keys

Everything here is also a button along the bottom of the screen, so none of it has to be
remembered. Shortcuts are matched on the physical key rather than the character it types,
so they work on any keyboard layout.

| Key | |
| --- | --- |
| `L` | tutorial — learn it by playing it |
| `T` | tuning panel — every threshold, adjustable while playing |
| `⇧G` | show or hide the song guide |
| `G` | next song |
| `W` | write a song of your own |
| `1`–`5` | sound: Clean synth, Organ, Warm pad, Strings, Glass |
| `X` | swap which hand plays chords |
| `C` | calibrate — hold each gesture once; press again to clear |
| `H` | show or hide the diagnostic readout |
| `S` | hide the hand skeleton |

The readout is off by default: it is a page of numbers for working out why the instrument is
doing something unexpected, and the first thing a new player should see is the instrument
rather than its instrumentation. The buttons are *not* tied to it — they used to be, so
hiding the readout took every control with it.

`H` and `S` off together leave just the instrument, the glow and the chord name, for filming.

## Learning it

Press `L`, or just start it for the first time and the tutorial opens by itself. It shows
one thing at a time, draws the hand that does it, and then waits — it advances when the
instrument actually reports that state, not when a timer runs out and not when you press
anything. So it cannot be clicked through, and it cannot claim you did something you did
not do.

That also makes it the only honest end-to-end check there is: if a gesture is unreadable on
your camera, the tutorial simply will not move on, and it says which hand it is waiting for.

It is offered once and never again, including if you skip it. Calibration is deliberately
not part of it — that is for hands the rules cannot read, and putting it in front of every
new player teaches them to expect trouble.

## Songs

The guide follows you rather than a clock: play the highlighted chord, hold it for a
moment, and it steps on. Nothing pushes.

Each chord is a numeral, a name, and **both hands** — the shaping hand on the left and the
chord hand on the right, laid out the way they appear on screen. A chord here is two hands
doing two things at once, and that is the part people get wrong; reading a shape off one
picture while translating a sentence for the other is exactly where a change falls apart.
The shaping hand is drawn holding two fingers, which is illustrative rather than required:
the guide matches on the chord and on major or minor, and ignores the voicing entirely.

Songs are broken into **sections** — verse, chorus, bridge — because that is how anyone
holds a song in their head, and because the interesting thing about most of them is that the
chorus does something the verse did not.

Progressions are stored as **scale degrees**, so they follow whichever root and scale the
instrument is set to: the same four numbers are C–G–Am–F in C and D–A–Bm–G in D, and
transposing is a dropdown rather than a rewrite. These are harmonic skeletons — the
instrument plays triads and sevenths, so slash chords and walking bass lines come out as the
plain chord they sit on.

**Creep** is the one to try first: its last two chords are the same fingers on the chord
hand, with only the other hand's thumb moving.

### Writing your own

`W` opens the writer. Name it, add sections, tap chords in. Chords are picked by degree, not
by name, for the same reason the shipped ones are stored that way — and each button carries
the hand that plays it, so filling in a chorus is also practice at reading the shapes.

Your songs are saved on your device and appear at the top of the guide. They are kept in
their own storage key rather than merged into the shipped list, so a build that adds or
fixes a song cannot clobber something you wrote.

## Visuals

A glow around the edges of the frame. It says three things and only three: **hue is which
chord**, **brightness is how loud**, and it breathes so a held chord is alive rather than a
still image. How far it reaches in from the edge is the left wrist's tilt — the one control
with nothing to hear.

Round the edges rather than over the middle, which is the whole idea: the middle is where
your hands are, and where your face is if this is being filmed. A full-screen field competes
with both.

This replaced a warped noise shader — prettier in a screenshot, worse to play against, and
it pulled in Three.js, which was most of the JavaScript the page shipped. Four canvas
gradients do the job, and the bundle went from 941 kB to 433 kB.

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
  music/      songs as scale degrees, and your own in storage
  visual/     edge glow + hand overlay
  ui/         tutorial, chord display, song guide, song writer, tuning panel
```

`PerformanceState` is the only interface between seeing and hearing: vision knows nothing
about music, audio knows nothing about hands.

Hands are drawn from a finger mask by one routine in `ui/handIcon.ts`, so the tutorial, the
chord display, the song guide and the song writer all draw a gesture from the same fact the
recogniser matches against — and a gesture added to the table gets its picture for free.

Built with [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)
and [Tone.js](https://tonejs.github.io/). Samples from
[tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), CC-BY 3.0.
