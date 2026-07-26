import type { Config } from '../config'
import type { ChordQuality, Density, ScaleDegree } from '../types'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const LETTER_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * Four voices, held for the life of the instrument.
 *
 * They deliberately have no fixed roles. Which voice plays the root and which plays the
 * third is decided per chord by `leadVoices`, because that is what voice leading *is* —
 * pinning a voice to a role is exactly what makes a progression march in parallel blocks.
 */
export const VOICE_COUNT = 4

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

/**
 * Semitones from the chord root up to its seventh, taken from the scale rather than
 * fixed.
 *
 * Six scale steps up gives a major seventh on I and IV, a minor seventh on ii, iii and
 * vi, and a proper dominant seventh on V. No single fixed interval can do that —
 * whichever is chosen puts an out-of-key note under some degree, and a major seventh
 * over V is the worst of them since it drags in the raised fourth.
 *
 * Reading it from the scale also means it follows the scale dropdown for free.
 */
export function seventhInterval(degree: ScaleDegree, config: Config): number {
  const scale = config.music.scale
  if (scale.length === 0) return 10

  const rootIndex = degree - 1
  const seventhIndex = rootIndex + 6
  const wrapped = seventhIndex % scale.length
  const octaves = Math.floor(seventhIndex / scale.length)

  return (scale[wrapped] ?? 0) + octaves * 12 - (scale[rootIndex] ?? 0)
}

/**
 * Semitones above the chord root for each of the four voices.
 *
 * Every density is a chord and every density contains the third, so the wrist tilt is
 * always audible. An earlier mapping had the thinner settings play a bare note and an
 * octave, where major and minor are literally the same sound — which is why the tilt
 * seemed to do nothing.
 *
 * The fourth voice is always given a pitch even when it is silent, so it is already in
 * the right place when a change of density brings it in.
 */
export function chordIntervals(
  degree: ScaleDegree,
  quality: ChordQuality,
  density: Density,
  config: Config,
): number[] {
  const third = quality === 'minor' ? 3 : 4
  const fourth = density === 3 ? seventhInterval(degree, config) : 12
  return [0, third, 7, fourth]
}

/** Root-position pitches for all four voices, before any voice leading. */
export function chordPitches(
  degree: ScaleDegree,
  quality: ChordQuality,
  density: Density,
  config: Config,
): number[] {
  const root = rootMidi(degree, config)
  return chordIntervals(degree, quality, density, config).map((interval) => root + interval)
}

/** How many voices sound: a triad, or a triad plus its octave or seventh. */
export function audibleCount(density: Density): number {
  return density === 1 ? 3 : 4
}

/**
 * Level for each voice. Equal-power rather than equal-amplitude: uncorrelated tones sum
 * roughly with the square root of their count, so dividing by it keeps a seventh chord
 * from being louder than a triad.
 */
export function voiceGains(density: Density): number[] {
  const count = audibleCount(density)
  const level = 1 / Math.sqrt(count)
  return Array.from({ length: VOICE_COUNT }, (_, index) => (index < count ? level : 0))
}

/** Shifts `pitch` by whole octaves to land as close to `target` as possible. */
export function nearestOctave(pitch: number, target: number): number {
  return pitch + Math.round((target - pitch) / 12) * 12
}

export type Register = { low: number; high: number }

/** The band the chord is allowed to occupy, so voice leading cannot walk it off the
 *  keyboard over a long progression. */
export function registerFor(config: Config): Register {
  const base = noteToMidi(config.music.root)
  return { low: base - 4, high: base + 19 }
}

function intoRegister(pitch: number, register: Register): number {
  const { low, high } = register
  // Too narrow for any octave to be guaranteed to fit — settle for closest to the middle.
  if (high - low < 12) return nearestOctave(pitch, (low + high) / 2)

  let out = pitch
  while (out < low) out += 12
  while (out > high) out -= 12
  return out
}

const PERMUTATIONS = permutationsOf(VOICE_COUNT)

function permutationsOf(size: number): number[][] {
  if (size <= 1) return [[0]]
  const result: number[][] = []
  const build = (chosen: number[], left: number[]): void => {
    if (left.length === 0) {
      result.push(chosen)
      return
    }
    for (let i = 0; i < left.length; i++) {
      build([...chosen, left[i]!], [...left.slice(0, i), ...left.slice(i + 1)])
    }
  }
  build(
    [],
    Array.from({ length: size }, (_, i) => i),
  )
  return result
}

/** Two voices landing on the same note wastes one of them; push the collision up. */
function separate(pitches: number[]): number[] {
  const order = pitches
    .map((pitch, index) => ({ pitch, index }))
    .sort((a, b) => a.pitch - b.pitch)

  for (let i = 1; i < order.length; i++) {
    if (order[i]!.pitch === order[i - 1]!.pitch) order[i]!.pitch += 12
  }

  const out = [...pitches]
  for (const { pitch, index } of order) out[index] = pitch
  return out
}

/**
 * Chooses the inversion by deciding which voice takes which note of the chord, then
 * placing each at the octave nearest to where that voice already was.
 *
 * The assignment is the whole point. Leading each voice within a fixed role — root voice
 * always takes the root — still makes every voice move on every chord: going from C major
 * to A minor, the roles force C→A, E→C and G→E. Letting the voices swap roles instead
 * means the two that were already holding C and E simply stay put and only one moves,
 * which is what a pianist's hand actually does.
 *
 * Four voices is 24 assignments, so the best one is found by trying them all.
 */
export function leadVoices(
  target: readonly number[],
  previous: readonly number[] | null,
  register: Register,
): number[] {
  if (previous === null || previous.length !== target.length) {
    return separate(target.map((pitch) => intoRegister(pitch, register)))
  }

  let best: number[] = []
  let bestCost = Infinity

  for (const permutation of PERMUTATIONS) {
    if (permutation.length !== target.length) continue

    const placed: number[] = []
    let cost = 0

    for (let voice = 0; voice < target.length; voice++) {
      const tone = target[permutation[voice]!]!
      const from = previous[voice]!
      const pitch = intoRegister(nearestOctave(tone, from), register)
      placed.push(pitch)
      cost += Math.abs(pitch - from)
    }

    if (cost < bestCost) {
      bestCost = cost
      best = placed
    }
  }

  return separate(best)
}

/** Note names for the chord as it sounds in root position — for tests and the readout. */
export function chordNotes(
  degree: ScaleDegree,
  quality: ChordQuality,
  density: Density,
  config: Config,
): string[] {
  return chordPitches(degree, quality, density, config)
    .slice(0, audibleCount(density))
    .map(midiToNote)
}

/** How the chord is spelled, for the readout and the song guide: C, Am, G7, Cmaj7. */
export function chordLabel(
  degree: ScaleDegree,
  quality: ChordQuality,
  density: Density,
  config: Config,
): string {
  const root = midiToNote(rootMidi(degree, config)).replace(/-?\d+$/, '')
  const minor = quality === 'minor'

  if (density !== 3) return minor ? `${root}m` : root

  const major7 = seventhInterval(degree, config) === 11
  if (minor) return major7 ? `${root}m(maj7)` : `${root}m7`
  return major7 ? `${root}maj7` : `${root}7`
}
