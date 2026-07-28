# HANDOFF — Gesture Synth (videomusic) — 2026-07-27

## 🎯 Goal / where we started
Resumed at `6c16c40` with recognition unverified. Alex confirmed on his real camera that the
chord hand now reads correctly, which retired the whole projection-metric/calibration thread.
The session then became his feature list: real instrument sounds, an even pair of hands, a
tutorial a stranger can follow, nicer visuals, songs by section, fewer buttons — plus three
bugs he found by playing (octave jumping, flipped hand icons, the volume step).

## 🔒 Decisions locked
- **Shaping (left) hand counts fingers**, it does not match exact shapes. 0 → mute, 1 → triad,
  2 → +octave, 3–4 → seventh. The chord hand keeps identity matching (коза vs two fingers).
- **All presets sustain. Struck ones are gone** — Piano, E-piano, Pluck removed. Five left.
- **Organ / Warm pad / Strings are recordings**; Clean synth and Glass stay oscillators on
  purpose (synthetic by name and intent; Clean synth must sound before anything downloads).
- Samples from **nbrosowsky/tonejs-instruments, CC-BY 3.0**, committed, served from our origin.
- **Sampled presets re-strike** (`retrigger`) and are re-struck again before the recording runs
  out — measured lengths 10.5–13.3 s, refresh at 9–10 s.
- **Bass root sits an octave below the triad**; voice 0 is pinned to it and never voice-led.
- **Register bands are 11 semitones wide** so each note has exactly one home → the same gesture
  always sounds the same. Voice leading still chooses *which voice* takes which note.
- **`voiceGains` follows notes, not voice indices** — density 1 drops the octave, never the third.
- **Three.js deleted.** Rim glow drawn with four canvas gradients. Bundle 941 kB → 443 kB.
- **Hand icons: `MIRRORED = { chord: false, shaping: true }`, `HAND_ORDER = ['shaping','chord']`.**
  Both established from a real camera frame, not from reasoning about chirality. Got reversed
  twice by arguing about it; now locked by tests.
- **Tutorial is full-screen, centre, large white type**, one instruction at a time, 2 s hold,
  both hands always drawn (active + "keep it up"). Plain language, no music jargon.
- **One button at the bottom: Settings.** Everything else lives inside it.
- Songs are **loops, not transcriptions** — cut 20 → 8, renamed to what they actually are.
- Not scraping ultimate-guitar (ToS + licensed transcriptions).

## ✅ Shipped / done (verified)
**224 tests pass · `tsc --noEmit` clean · `npm run build` clean · console clean.**
**Nothing is committed.** HEAD is still `6c16c40`; everything below is in the working tree.

| Area | Files |
|---|---|
| Even hands + per-hand diagnostics | `src/gesture/interpret.ts`, `src/main.ts` |
| Sample sets (6.1 MB, 3 instruments) | `src/audio/sampleSets.ts` + `.test.ts`, `scripts/sample-sets.mjs`/`.d.mts`, `scripts/fetch-samples.mjs`, `public/samples/{organ,pad,strings}/` |
| Sustain refresh + sounding notes | `src/audio/engine.ts` (`getNotes`, `SUSTAIN_SECONDS`) |
| Voicing rework | `src/audio/voicing.ts` (`leadVoicing`, `bandsOf`, `separate`, `voiceGains`) |
| Hand icons (capsules) | `src/ui/handIcon.ts` + `.test.ts` |
| Chord display | `src/ui/chordDisplay.ts` |
| Tutorial | `src/ui/tutorial.ts` |
| Rim glow | `src/visual/rim.ts` (replaced `src/visual/scene.ts`, deleted) |
| Songs by section + writer | `src/music/songs.ts` + `.test.ts`, `songStore.ts` + `.test.ts`, `src/ui/songBuilder.ts`, `src/ui/songGuide.ts` |
| Settings consolidation | `src/ui/tuning.ts` (`actions` slot), `src/ui/toolbar.ts` (`parent` arg), `src/main.ts` |
| **Transition log (this turn)** | `src/gesture/transitions.ts` + `.test.ts`, wired into `src/main.ts` |

**Measured, not assumed:**
- Same gesture used to sound **4 different ways** depending on the preceding chord. Now **1**.
- At density 1 the **third could be dropped** (`C2 G3 C4` — no E), so major and minor sounded
  identical. Fixed; test asserts the third is present at every density on every degree.
- `separate()` could push a voice **out of the register** (F5 on an instrument topping at G4).
- Sample durations: organ 12.4 s, harmonium 12.1 s, violin 13.3 s, cello 3.2 s (rejected),
  contrabass 10.5 s. Harmonium is **cut off**, not faded — hence refresh at 9 s.
- Trims re-measured twice via `?trims=1`: Clean synth 0.57, Organ 1.51, Warm pad 1.24,
  Strings 1.30, Glass 0.48.
- Bundle: 941 kB → 443 kB (gzip 247 → 123).

## 🚧 Current state / in progress
**The transition log is built and wired but has never been run against a camera.** That is the
entire next step. Nothing else is half-done.

Uncommitted: 24 modified, 25 piano samples deleted, 20 new files. `git status` matches the
table above.

## 📁 Key files for next session
- `src/gesture/transitions.ts` — the measurement. `spanMs`, `wobble`, `summary()`, `report()`.
- `src/main.ts` — log fed at `transitions.push(latest, now)` on fresh frames only; `R` prints
  the table, `⇧R` resets; live line in the HUD under `hands`.
- `src/audio/engine.ts` — where option **D** (deferred strike) would go: `strike()`, the
  `chord !== lastChord` block, and the sustain-refresh that must not fight it.
- `src/gesture/interpret.ts` — where **A** (debounce) or **C** (motion gate) would go.
- `src/config.ts` — `gesture.stabilityFrames` is currently **1**, i.e. option **B** is available
  and switched off. It already has a slider.
- `src/ui/handIcon.ts` — `MIRRORED` and `HAND_ORDER`, with the reasoning. Do not "fix" by feel.
- `src/audio/voicing.ts` — `bandsOf` explains why the bands are 11 semitones.

## 🔍 How to verify current state
```bash
cd /Users/alexander/Developer/Claude/videomusic
npx vitest run          # expect 224 passed
npx tsc --noEmit        # expect silence
npm run build           # expect clean
git log --oneline -1    # expect 6c16c40 — nothing committed this session
```
Play it in real Chrome (the in-app browser renders at 0×0 and blocks the camera):
```bash
npm run dev
```
```bash
open -a "Google Chrome" http://127.0.0.1:5173/videomusic/
```

## ❓ Open questions / deferred
- **The chord-transition glitch — the live question.** Changing chord moves both hands and they
  do not arrive together, so a wrong chord is *struck* on the way past. Five options were
  analysed and reduce to two independent axes: **when to commit** (B `stabilityFrames` / A
  debounce / C motion gate, in `interpret.ts`) and **how to strike** (D deferred strike / E no
  re-strike on quality-only, in `engine.ts`). ~150–200 lines to build all; **recommended
  instead: measure first, expect it to eliminate 2–3 of them.** Leaning D.
- **Alex's wife's hands read noticeably worse** — longer palm, narrower fingers. Calibration
  (`C`, now in Settings) exists for exactly this and has never been run by her. Need her
  `reach` numbers from the Readout to turn this into a measurement.
- Nothing has been **committed**. Ask before committing.
- Sampled presets have never been heard for a 20-second held chord — the sustain refresh at
  9–10 s is verified by measurement of the files, not by ear.
- Song writer (`W`) verified by driving it in a harness, never used by a human.
- `.github/workflows/deploy.yml` — on disk, deliberately untracked. Still blocked on
  `gh auth refresh -h github.com -s workflow`. Site has never been deployed.
- Nothing recorded for YouTube, still.

## ▶️ PICK UP HERE
```
Continue the gesture synth at /Users/alexander/Developer/Claude/videomusic (read HANDOFF.md
first). At 6c16c40 with a large uncommitted working tree, 224 tests green, tsc and build clean.

Last session ended by building a chord-transition log to settle one question: when I change
chord, both hands do not arrive together, so a wrong chord gets struck on the way past. I
have now run it.

Here is the output of pressing R in the console after playing for a minute or two:

<paste the table, or at least the summary line:
 changes N   span med X  p90 Y ms   wrong chord Z%   wobbles W>

Read the numbers and tell me which fix they justify, then build only that one:
 - span p90 ~0–50 ms  → nothing to fix
 - ~80–150 ms         → option D: defer the strike ~p90+margin in engine.ts, with a slider
 - 300+ ms            → option C: motion gate in interpret.ts, with a commit-anyway cap
 - many wobbles, small span → not hand lag at all; raise gesture.stabilityFrames (now 1)

Do not build all five options. Also: nothing is committed yet — ask me before you commit.
```
