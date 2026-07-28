/**
 * The sounds the instrument can make.
 *
 * Every one of them sustains. Presets that decayed — a piano, an electric piano, a pluck —
 * were here and have gone: on an instrument you play by *holding* a shape, a chord that dies
 * while your hand is still up is fighting the way the thing is played. What is left holds
 * for as long as you do.
 *
 * Two ways of producing that, and the difference is structural rather than a matter of taste.
 *
 * **Oscillator** presets are what the engine was built for: four voices attacked once at
 * startup and held forever, with everything audible done by gains. Nothing is ever
 * triggered, so there is no note-on latency at all and the fist can fade rather than cut.
 *
 * **Sampled** presets play recordings, and a recording has to be triggered — you cannot
 * glide a sampler from one chord to the next the way an oscillator bends. So they set
 * `retrigger` and are re-struck on each change, and again before the recording runs out.
 * They still sustain, because the recordings do: an organ, a reed organ and a bowed string
 * hold their note. That is what makes them usable here where a piano was not.
 *
 * Two presets stay synthetic on purpose. Clean synth and Glass are synthetic sounds by name
 * and by intent — a recording of one is a contradiction — and Clean synth is also the one
 * that has to make sound before anything has downloaded.
 */
import type { SampleSetName } from './sampleSets'

export type Preset = {
  name: string
  /** Which recorded instrument to play, if this is a sampled preset. Sampled presets ignore
   *  `oscillator` entirely. */
  sampler?: SampleSetName
  oscillator: { type: string; count?: number; spread?: number }
  filter: { frequency: number; Q: number }
  reverbWet: number
  /**
   * Level trim so switching preset does not jump in loudness. Measured rather than guessed
   * — see `measureTrims` in audio/trims.ts, and `?trims=1`.
   */
  trim: number
  /**
   * Re-attack on every chord change instead of gliding.
   *
   * Implied by `sampler` — a recording cannot bend to the next chord. On an oscillator
   * preset this also needs an envelope with a decay, or it is a held preset wearing a hat.
   */
  retrigger?: boolean
  envelope?: { attack: number; decay: number; sustain: number; release: number }
  /**
   * Seconds to slide between chords, overriding the global setting.
   *
   * Retriggering presets set this to zero: the glide only applies to oscillators being bent
   * from one pitch to the next, and there is nothing to bend when each chord is played
   * afresh.
   */
  glideSeconds?: number
  /** Spread the voices across the stereo field by this many degrees either side of centre.
   *  Four voices stacked dead centre is where a chord stops sounding like several notes and
   *  starts sounding like one complicated one. */
  spreadStereo?: number
  /** Detune the voices against each other, in cents. Small numbers only: it is the beating
   *  between them that makes a held chord sound alive rather than synthesised. */
  detuneCents?: number
  /** One line for the dropdown. */
  hint: string
}

export const PRESETS: readonly Preset[] = [
  {
    name: 'Clean synth',
    oscillator: { type: 'triangle' },
    filter: { frequency: 4200, Q: 0.5 },
    reverbWet: 0.22,
    trim: 0.57,
    spreadStereo: 22,
    detuneCents: 5,
    hint: 'Plain and clear, with just enough width and detune to stop it sounding like a test tone.',
  },
  {
    name: 'Organ',
    sampler: 'organ',
    // Only reached if the samples fail to load, so it is shaped like the recording rather
    // than like a fallback: a pure held tone, which is most of what a pipe organ is.
    oscillator: { type: 'sine' },
    filter: { frequency: 9000, Q: 0.3 },
    reverbWet: 0.3,
    trim: 1.51,
    retrigger: true,
    glideSeconds: 0,
    spreadStereo: 14,
    hint: 'A recorded pipe organ. Holds dead flat for as long as you do.',
  },
  {
    name: 'Warm pad',
    sampler: 'pad',
    oscillator: { type: 'fatsawtooth', count: 3, spread: 16 },
    filter: { frequency: 6000, Q: 0.4 },
    reverbWet: 0.36,
    trim: 1.24,
    retrigger: true,
    glideSeconds: 0,
    spreadStereo: 30,
    hint: 'A recorded reed organ — warm and slightly breathy, the softest thing here.',
  },
  {
    name: 'Strings',
    sampler: 'strings',
    oscillator: { type: 'fatsawtooth', count: 2, spread: 34 },
    filter: { frequency: 7000, Q: 0.4 },
    reverbWet: 0.48,
    trim: 1.30,
    retrigger: true,
    glideSeconds: 0,
    spreadStereo: 34,
    hint: 'A real string section — double bass underneath, violins on top.',
  },
  {
    name: 'Glass',
    oscillator: { type: 'fmsine' },
    filter: { frequency: 7000, Q: 0.4 },
    reverbWet: 0.4,
    trim: 0.48,
    spreadStereo: 26,
    detuneCents: 3,
    hint: 'Thin and bell-like, held rather than struck.',
  },
]

export const DEFAULT_PRESET = 'Clean synth'

export function findPreset(name: string): Preset {
  return PRESETS.find((preset) => preset.name === name) ?? PRESETS[0]!
}
