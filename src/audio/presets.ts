/**
 * The sounds the instrument can make.
 *
 * Two kinds, and the difference is structural rather than a matter of taste.
 *
 * **Sustained** presets are what the engine was built for: four voices attacked once at
 * startup and held forever, with everything audible done by gains. Nothing is ever
 * triggered, so there is no note-on latency at all and the fist can fade rather than cut.
 *
 * **Struck** presets set `retrigger`, and re-attack the voices whenever the chord changes.
 * That is the only way a piano can exist here — a piano is a hammer and a decay, and no
 * amount of gain-riding on a held tone will imitate one. It also changes how the instrument
 * plays: a struck chord rings and fades on its own, so holding a gesture is holding a chord
 * that is dying, not one that is sustaining.
 */
export type Preset = {
  name: string
  /** Which sample folder to play, if this is a sampled instrument. Sampled presets ignore
   *  `oscillator` entirely. */
  sampler?: 'piano'
  oscillator: { type: string; count?: number; spread?: number }
  filter: { frequency: number; Q: number }
  reverbWet: number
  /**
   * Level trim so switching preset does not jump in loudness. Measured rather than guessed
   * — see `measureTrims` in audio/trims.ts, and `?trims=1`.
   */
  trim: number
  /**
   * Re-attack the voices on every chord change instead of holding them.
   *
   * Set this and the preset needs an envelope with a decay, or it is a sustained preset
   * wearing a hat.
   */
  retrigger?: boolean
  envelope?: { attack: number; decay: number; sustain: number; release: number }
  /**
   * Seconds to slide between chords, overriding the global setting.
   *
   * Struck presets set this to zero. A piano string cannot bend to the next note, and a
   * glide on a struck chord sounds like a fault rather than a feature.
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
    trim: 0.5,
    spreadStereo: 22,
    detuneCents: 5,
    hint: 'Plain and clear, with just enough width and detune to stop it sounding like a test tone.',
  },
  {
    name: 'Piano',
    sampler: 'piano',
    oscillator: { type: 'sine' },
    filter: { frequency: 12000, Q: 0.3 },
    reverbWet: 0.2,
    trim: 2.31,
    retrigger: true,
    // The Sampler carries its own release, so this envelope only matters if the samples
    // fail to load and the oscillators have to stand in. It is shaped like a struck note
    // so that fallback is a different piano rather than a stuck drone.
    envelope: { attack: 0.002, decay: 2.2, sustain: 0.05, release: 1.2 },
    glideSeconds: 0,
    spreadStereo: 16,
    hint: 'A recorded grand. Struck rather than sustained, so a chord rings out and fades — change gesture to play it again.',
  },
  {
    name: 'E-piano',
    oscillator: { type: 'fmsine' },
    filter: { frequency: 5200, Q: 0.6 },
    reverbWet: 0.28,
    trim: 0.5,
    retrigger: true,
    envelope: { attack: 0.004, decay: 2.6, sustain: 0.12, release: 1.1 },
    glideSeconds: 0,
    spreadStereo: 26,
    detuneCents: 4,
    hint: 'Bell-struck and warm, in the Rhodes direction. Rings out like the piano but takes longer about it.',
  },
  {
    name: 'Pluck',
    oscillator: { type: 'triangle' },
    filter: { frequency: 3000, Q: 1.4 },
    reverbWet: 0.3,
    trim: 0.81,
    retrigger: true,
    envelope: { attack: 0.002, decay: 0.9, sustain: 0.04, release: 0.7 },
    glideSeconds: 0,
    spreadStereo: 30,
    detuneCents: 7,
    hint: 'Short and bright. The most rhythmic thing here — every gesture change is an event.',
  },
  {
    name: 'Organ',
    oscillator: { type: 'sine' },
    filter: { frequency: 6000, Q: 0.4 },
    reverbWet: 0.26,
    trim: 0.48,
    spreadStereo: 14,
    hint: 'Pure and round. Holds forever without moving, which is exactly what an organ does.',
  },
  {
    name: 'Warm pad',
    oscillator: { type: 'fatsawtooth', count: 3, spread: 16 },
    filter: { frequency: 2400, Q: 0.6 },
    reverbWet: 0.34,
    trim: 0.67,
    spreadStereo: 30,
    detuneCents: 6,
    hint: 'Thick and detuned, with the longest tail of the sustained ones.',
  },
  {
    name: 'Strings',
    oscillator: { type: 'fatsawtooth', count: 2, spread: 34 },
    filter: { frequency: 3000, Q: 0.7 },
    reverbWet: 0.48,
    trim: 1.0,
    spreadStereo: 34,
    detuneCents: 8,
    hint: 'Wide detune and a long room behind it.',
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
