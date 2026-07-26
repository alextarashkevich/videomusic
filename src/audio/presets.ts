/**
 * Synth voicings.
 *
 * The voices are held permanently, so a preset is not an envelope — it is the oscillator,
 * the filter feeding the drive, and how much space sits behind it.
 *
 */
export type Preset = {
  name: string
  oscillator: { type: string; count?: number; spread?: number }
  filter: { frequency: number; Q: number }
  reverbWet: number
  /**
   * Level trim so switching preset does not jump in loudness. Measured by rendering a
   * C major triad through each preset and matching RMS.
   */
  trim: number
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
    hint: 'Pure and round. The drive has the most room to work here.',
  },
  {
    name: 'Warm pad',
    oscillator: { type: 'fatsawtooth', count: 3, spread: 16 },
    filter: { frequency: 2400, Q: 0.6 },
    reverbWet: 0.32,
    trim: 1.0,
    hint: 'Thick and detuned. Already rich, so the drive changes it least.',
  },
  {
    name: 'Rock organ',
    oscillator: { type: 'square' },
    filter: { frequency: 2600, Q: 2.2 },
    reverbWet: 0.14,
    trim: 0.59,
    hint: 'Hollow and resonant. Takes drive like an amp.',
  },
  {
    name: 'Strings',
    oscillator: { type: 'fatsawtooth', count: 2, spread: 34 },
    filter: { frequency: 3000, Q: 0.7 },
    reverbWet: 0.48,
    trim: 1.0,
    hint: 'Wide detune and a long tail.',
  },
  {
    name: 'Glass',
    oscillator: { type: 'fmsine' },
    filter: { frequency: 7000, Q: 0.4 },
    reverbWet: 0.4,
    trim: 0.51,
    hint: 'Thin and bell-like.',
  },
]

export const DEFAULT_PRESET = 'Organ'

export function findPreset(name: string): Preset {
  return PRESETS.find((preset) => preset.name === name) ?? PRESETS[0]!
}
