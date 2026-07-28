import { defaultConfig, type Config } from '../config'

/**
 * One tunable number.
 *
 * Each control carries an explicit getter and setter rather than a path into the config
 * object, so the compiler checks that every control still points at something real.
 */
export type Control = {
  group: string
  label: string
  min: number
  max: number
  step: number
  get: (config: Config) => number
  set: (config: Config, value: number) => void
  format?: (value: number) => string
  /** Why you would reach for this one. */
  hint: string
}

/**
 * Puts any stored number that sits outside its slider's range back to the default.
 *
 * Config is merged from localStorage on every load, and a value that has drifted out of
 * range — left by an older build, or by a key that has since changed meaning — cannot be
 * corrected from the panel, because the slider cannot reach it. One of these silenced the
 * instrument outright: an extension threshold above 1.0, which the measurement can never
 * exceed, so every finger read as folded, no gesture ever matched, and nothing in the
 * readout said why.
 *
 * Reset rather than clamped to the nearest bound. A value nobody could have chosen is not a
 * preference worth approximating, and clamping lands on the extreme end of the range —
 * which for a threshold means the strictest possible setting, i.e. very nearly the same
 * failure it was rescuing from.
 *
 * Ranges live here, next to the controls, so one place knows them.
 */
export function repairConfig(config: Config): void {
  for (const control of CONTROLS) {
    const value = control.get(config)
    if (Number.isFinite(value) && value >= control.min && value <= control.max) continue
    control.set(config, control.get(defaultConfig))
  }
}

const degrees = (value: number) => `${value.toFixed(0)}°`
const ms = (value: number) => `${(value * 1000).toFixed(0)} ms`
const frames = (value: number) => `${value.toFixed(0)} fr`

export const CONTROLS: readonly Control[] = [
  {
    group: 'Recognition',
    label: 'Finger extension',
    min: 0.05,
    max: 0.95,
    step: 0.01,
    get: (c) => c.gesture.extendedProjection,
    set: (c, v) => {
      c.gesture.extendedProjection = v
    },
    hint: 'How far out a finger must reach to count as up. About 1.00 held out, near 0 folded away — including folded down at the base while staying straight, which is how a pinky usually drops. The readout shows the live number per finger; hold up three and put this between the two groups.',
  },
  {
    group: 'Recognition',
    label: 'Thumb angle',
    min: 10,
    max: 70,
    step: 1,
    format: degrees,
    get: (c) => c.gesture.thumbAngleDeg,
    set: (c, v) => {
      c.gesture.thumbAngleDeg = v
    },
    hint: 'How far the thumb must swing off the line of the palm to count as out. The readout shows the live angle. This is what separates an open palm from four fingers, and коза from коза with the thumb.',
  },
  {
    group: 'Recognition',
    label: 'Stability',
    min: 1,
    max: 12,
    step: 1,
    format: frames,
    get: (c) => c.gesture.stabilityFrames,
    set: (c, v) => {
      c.gesture.stabilityFrames = v
    },
    hint: 'Frames a new shape must hold before it sounds. Higher rejects more fumbling but adds delay.',
  },
  {
    group: 'Recognition',
    label: 'Detect at width',
    min: 192,
    max: 1280,
    step: 64,
    format: (value) => `${value.toFixed(0)} px`,
    get: (c) => c.vision.inferenceWidth,
    set: (c, v) => {
      c.vision.inferenceWidth = v
    },
    hint: 'How large a picture the detector is given. It works at 192×192 whatever it gets, so most of a full-size frame is uploaded and thrown away. The picture on screen is unaffected. Watch the detect figure in the readout as you drag this — and if recognition suffers at the far end, that is what the far end is for.',
  },
  {
    group: 'Recognition',
    label: 'Hand-lost tolerance',
    min: 1,
    max: 40,
    step: 1,
    format: frames,
    get: (c) => c.gesture.handLostFrames,
    set: (c, v) => {
      c.gesture.handLostFrames = v
    },
    hint: 'How long the right hand may vanish before the sound fades. Raise it if tracking drops cause dropouts.',
  },

  {
    group: 'Major / minor',
    label: 'Major above',
    min: 20,
    max: 80,
    step: 1,
    format: degrees,
    get: (c) => c.quality.majorAboveDeg,
    set: (c, v) => {
      c.quality.majorAboveDeg = v
    },
    hint: 'Shaping-hand thumb swung out past this and the chord is major. The readout shows the live angle beside it — hold the thumb out, then tuck it, and put these two either side of the gap.',
  },
  {
    group: 'Major / minor',
    label: 'Minor below',
    min: 5,
    max: 60,
    step: 1,
    format: degrees,
    get: (c) => c.quality.minorBelowDeg,
    set: (c, v) => {
      c.quality.minorBelowDeg = v
    },
    hint: 'Thumb tucked in tighter than this and the chord is minor. The gap between the two is what stops a thumb resting near the boundary flipping the chord several times a second — keep them apart.',
  },

  {
    group: 'Wrist tilt',
    label: 'Neutral until',
    min: 0,
    max: 40,
    step: 1,
    format: degrees,
    get: (c) => c.tilt.minDeg,
    set: (c, v) => {
      c.tilt.minDeg = v
    },
    hint: 'Left-hand tilt below this counts as upright.',
  },
  {
    group: 'Wrist tilt',
    label: 'Full at',
    min: 10,
    max: 90,
    step: 1,
    format: degrees,
    get: (c) => c.tilt.maxDeg,
    set: (c, v) => {
      c.tilt.maxDeg = v
    },
    hint: 'Tilt at which the visuals reach full warp. No audio effect is mapped to this at the moment.',
  },

  {
    group: 'Volume',
    label: 'Loudest at height',
    min: 0,
    max: 0.5,
    step: 0.01,
    get: (c) => c.volume.topY,
    set: (c, v) => {
      c.volume.topY = v
    },
    hint: 'Frame height where the left hand is at full volume. 0 is the very top.',
  },
  {
    group: 'Volume',
    label: 'Silent at height',
    min: 0.5,
    max: 1,
    step: 0.01,
    get: (c) => c.volume.bottomY,
    set: (c, v) => {
      c.volume.bottomY = v
    },
    hint: 'Frame height where the left hand is silent. 1 is the very bottom.',
  },

  {
    group: 'Volume',
    label: 'Quietest level',
    min: 0,
    max: 0.5,
    step: 0.01,
    format: (value) => `${(value * 100).toFixed(0)}%`,
    get: (c) => c.volume.floor,
    set: (c, v) => {
      c.volume.floor = v
    },
    hint: 'How loud the instrument still is with the hand at the bottom. Above zero so dropping your hand thins the sound rather than ending it — silence is the fist.',
  },

  {
    group: 'Feel',
    label: 'Control smoothing',
    min: 0.02,
    max: 1,
    step: 0.01,
    get: (c) => c.smoothing.alpha,
    set: (c, v) => {
      c.smoothing.alpha = v
    },
    hint: 'Lower is smoother but laggier. Affects volume and the left wrist tilt.',
  },
  {
    group: 'Feel',
    label: 'Parameter ramp',
    min: 0.005,
    max: 0.3,
    step: 0.005,
    format: ms,
    get: (c) => c.smoothing.rampSeconds,
    set: (c, v) => {
      c.smoothing.rampSeconds = v
    },
    hint: 'Too short and fast moves click; too long and the instrument feels rubbery.',
  },
  {
    group: 'Feel',
    label: 'Glide between notes',
    min: 0,
    max: 0.5,
    step: 0.005,
    format: ms,
    get: (c) => c.smoothing.glideSeconds,
    set: (c, v) => {
      c.smoothing.glideSeconds = v
    },
    hint: 'Zero steps between chords; longer slides into them.',
  },
  {
    group: 'Feel',
    label: 'Wait for both hands',
    min: 0,
    max: 0.4,
    step: 0.01,
    format: ms,
    get: (c) => c.smoothing.settleSeconds,
    set: (c, v) => {
      c.smoothing.settleSeconds = v
    },
    hint: 'How long a chord must hold still before it plays. Higher catches the wrong chords you pass through changing hands; the whole instrument answers that much later. Zero is off.',
  },
  {
    group: 'Feel',
    label: 'Mute fade',
    min: 0.02,
    max: 1.5,
    step: 0.01,
    format: ms,
    get: (c) => c.smoothing.gateFadeSeconds,
    set: (c, v) => {
      c.smoothing.gateFadeSeconds = v
    },
    hint: 'How gently the fist silences the instrument.',
  },
]

/** Roots offered in the panel — one octave of naturals, low and mid. */
export const ROOT_OPTIONS = [
  'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2',
  'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3',
] as const

export const SCALE_OPTIONS: readonly { name: string; steps: readonly number[] }[] = [
  { name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
]
