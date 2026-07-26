/**
 * Synth voicings.
 *
 * The voices are held permanently, so a preset is not an envelope — it is the oscillator,
 * the filter feeding the drive, and how much space sits behind it.
 *
 * The oscillator choice matters more than it looks. A sawtooth already contains every
 * harmonic, so distortion has almost nothing to add to it; on a sine the same drive more
 * than doubles the brightness. If the drive should be dramatic, start simple.
 */
export type Preset = {
  name: string
  oscillator: { type: string; count?: number; spread?: number }
  /** Feeds the drive, so it shapes what gets distorted rather than cleaning up after. */
  filter: { frequency: number; Q: number }
  reverbWet: number
  /**
   * Level trim so switching preset does not jump in loudness. Applied *after* the drive:
   * putting it before would change how hard the waveshaper is hit, so the trim would
   * silently alter the character of the distortion as well as the volume.
   *
   * Measured by rendering a C major triad through each preset and matching RMS.
   */
  trim: number
  /**
   * How much of the drive's own level increase to give back, as `1 / (1 + drive · comp)`.
   *
   * This cannot be one shared number. Clipping does far more to a waveform that already
   * has a high crest factor: at full drive a sawtooth gets 2.6x louder where a sine gets
   * 1.45x. One formula for both either leaves the pad deafening or the organ quieter than
   * clean — and a drive that makes things quieter is exactly what reads as "broken".
   *
   * Measured per preset, tuned to leave full drive about 1.3x louder than clean, because
   * the ear hears "louder and brighter" as "dirtier".
   */
  driveComp: number
  /** One line for the dropdown. */
  hint: string
}

export const PRESETS: readonly Preset[] = [
  {
    name: 'Organ',
    oscillator: { type: 'sine' },
    filter: { frequency: 6000, Q: 0.4 },
    reverbWet: 0.26,
    trim: 0.64,
    driveComp: 0.11,
    hint: 'Pure and round. The drive has the most room to work here.',
  },
  {
    name: 'Warm pad',
    oscillator: { type: 'fatsawtooth', count: 3, spread: 16 },
    filter: { frequency: 2400, Q: 0.6 },
    reverbWet: 0.32,
    trim: 1.0,
    driveComp: 0.7,
    hint: 'Thick and detuned. Already rich, so the drive changes it least.',
  },
  {
    name: 'Rock organ',
    oscillator: { type: 'square' },
    filter: { frequency: 2600, Q: 2.2 },
    reverbWet: 0.14,
    trim: 0.59,
    driveComp: 0.07,
    hint: 'Hollow and resonant. Takes drive like an amp.',
  },
  {
    name: 'Strings',
    oscillator: { type: 'fatsawtooth', count: 2, spread: 34 },
    filter: { frequency: 3000, Q: 0.7 },
    reverbWet: 0.48,
    trim: 1.0,
    driveComp: 1.02,
    hint: 'Wide detune and a long tail.',
  },
  {
    name: 'Glass',
    oscillator: { type: 'fmsine' },
    filter: { frequency: 7000, Q: 0.4 },
    reverbWet: 0.4,
    trim: 0.51,
    driveComp: 0.0,
    hint: 'Thin and bell-like.',
  },
]

export const DEFAULT_PRESET = 'Organ'

export function findPreset(name: string): Preset {
  return PRESETS.find((preset) => preset.name === name) ?? PRESETS[0]!
}
