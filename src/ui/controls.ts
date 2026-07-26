import type { Config } from '../config'

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

const degrees = (value: number) => `${value.toFixed(0)}°`
const ms = (value: number) => `${(value * 1000).toFixed(0)} ms`
const frames = (value: number) => `${value.toFixed(0)} fr`

export const CONTROLS: readonly Control[] = [
  {
    group: 'Recognition',
    label: 'Finger extension',
    min: 0.9,
    max: 1.5,
    step: 0.01,
    get: (c) => c.gesture.extendedRatio,
    set: (c, v) => {
      c.gesture.extendedRatio = v
    },
    hint: 'Raise it if half-curled fingers read as extended; lower it if extended ones are missed.',
  },
  {
    group: 'Recognition',
    label: 'Thumb spread',
    min: 0.5,
    max: 1.8,
    step: 0.01,
    get: (c) => c.gesture.thumbSpread,
    set: (c, v) => {
      c.gesture.thumbSpread = v
    },
    hint: 'How far the thumb must sit from the pinky knuckle to count as out. This is what separates коза from коза with the thumb.',
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
    label: 'Major below',
    min: 2,
    max: 45,
    step: 1,
    format: degrees,
    get: (c) => c.quality.majorBelowDeg,
    set: (c, v) => {
      c.quality.majorBelowDeg = v
    },
    hint: 'Tilt under this is major.',
  },
  {
    group: 'Major / minor',
    label: 'Minor above',
    min: 5,
    max: 75,
    step: 1,
    format: degrees,
    get: (c) => c.quality.minorAboveDeg,
    set: (c, v) => {
      c.quality.minorAboveDeg = v
    },
    hint: 'Tilt over this is minor. The gap between the two is what stops it flickering — keep them apart.',
  },

  {
    group: 'Distortion',
    label: 'Clean until',
    min: 0,
    max: 40,
    step: 1,
    format: degrees,
    get: (c) => c.distortion.minDeg,
    set: (c, v) => {
      c.distortion.minDeg = v
    },
    hint: 'Left-hand tilt below this stays clean.',
  },
  {
    group: 'Distortion',
    label: 'Full drive at',
    min: 10,
    max: 90,
    step: 1,
    format: degrees,
    get: (c) => c.distortion.maxDeg,
    set: (c, v) => {
      c.distortion.maxDeg = v
    },
    hint: 'Tilt at which drive reaches maximum.',
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
    group: 'Feel',
    label: 'Control smoothing',
    min: 0.02,
    max: 1,
    step: 0.01,
    get: (c) => c.smoothing.alpha,
    set: (c, v) => {
      c.smoothing.alpha = v
    },
    hint: 'Lower is smoother but laggier. Affects volume and distortion.',
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
