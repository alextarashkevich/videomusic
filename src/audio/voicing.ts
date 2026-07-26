import type { Config } from '../config'
import type { ChordQuality, Density, ScaleDegree } from '../types'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const LETTER_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * The four voices the synth always holds, each with a fixed job.
 *
 * Fixed roles matter: if a voice switched between playing the octave and playing the
 * third depending on density, changing density would make it swoop eight semitones.
 * With roles pinned, pitch only ever moves when the chord does, and density merely
 * fades voices in and out.
 */
export const VOICE_ROLES = ['root', 'octave', 'third', 'fifth'] as const
export type VoiceRole = (typeof VOICE_ROLES)[number]

const SEMITONES_ABOVE_ROOT: Record<VoiceRole, (quality: ChordQuality) => number> = {
  root: () => 0,
  octave: () => 12,
  third: (quality) => (quality === 'minor' ? 3 : 4),
  fifth: () => 7,
}

/** Which voices are heard at each density. */
const VOICES_BY_DENSITY: Record<Density, readonly VoiceRole[]> = {
  1: ['root'],
  2: ['root', 'octave'],
  3: ['root', 'third', 'fifth'],
}

export function noteToMidi(note: string): number {
  const match = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(note.trim())
  if (match === null) throw new Error(`Not a note name: ${note}`)

  const [, letter, accidentals, octave] = match as unknown as [string, string, string, string]
  let semitone = LETTER_SEMITONE[letter.toUpperCase()]!
  for (const accidental of accidentals) semitone += accidental === '#' ? 1 : -1

  return (Number(octave) + 1) * 12 + semitone
}

export function midiToNote(midi: number): string {
  const rounded = Math.round(midi)
  const index = ((rounded % 12) + 12) % 12
  return `${NOTE_NAMES[index]}${Math.floor(rounded / 12) - 1}`
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** MIDI note number of the chord's root for a given scale degree. */
export function rootMidi(degree: ScaleDegree, config: Config): number {
  const steps = config.music.scale[degree - 1] ?? 0
  return noteToMidi(config.music.root) + steps
}

/** What every voice should be sounding, whether or not it is currently audible. */
export function voicePitches(
  degree: ScaleDegree,
  quality: ChordQuality,
  config: Config,
): Record<VoiceRole, number> {
  const root = rootMidi(degree, config)
  return {
    root,
    octave: root + SEMITONES_ABOVE_ROOT.octave(quality),
    third: root + SEMITONES_ABOVE_ROOT.third(quality),
    fifth: root + SEMITONES_ABOVE_ROOT.fifth(quality),
  }
}

export function audibleVoices(density: Density): readonly VoiceRole[] {
  return VOICES_BY_DENSITY[density]
}

/**
 * Per-voice level for a density, already compensated so a triad is not three times as
 * loud as a single note. Voices that should be silent get exactly 0.
 */
export function voiceLevels(density: Density): Record<VoiceRole, number> {
  const audible = audibleVoices(density)
  // Equal-power rather than equal-amplitude: summing uncorrelated tones grows roughly
  // with the square root of their count, so dividing by it keeps perceived loudness flat.
  const level = 1 / Math.sqrt(audible.length)

  const levels = { root: 0, octave: 0, third: 0, fifth: 0 }
  for (const role of audible) levels[role] = level
  return levels
}

/** Note names for the chord as it currently sounds — for the HUD and for tests. */
export function chordNotes(
  degree: ScaleDegree,
  quality: ChordQuality,
  density: Density,
  config: Config,
): string[] {
  const pitches = voicePitches(degree, quality, config)
  return audibleVoices(density).map((role) => midiToNote(pitches[role]))
}
