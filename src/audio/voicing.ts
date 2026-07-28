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
 * Semitones from the chord root for each of the four voices.
 *
 * Every density is a chord and every density contains the third, so major and minor are
 * always audible. An earlier mapping had the thinner settings play a bare note and an
 * octave, where major and minor are literally the same sound — which is why choosing
 * between them seemed to do nothing.
 *
 * **The root sits an octave below the rest.** It used to be level with them, which packed
 * every chord into a single octave starting at the root — so the instrument had no bottom
 * at all: nothing below C3, at any density, ever. A close triad with nothing underneath is
 * a thin, mid-register sound, and the thinnest density is where that is most exposed.
 * Dropping the root an octave and leaving the triad where it was gives a bass note without
 * darkening the top, which is how a pianist's left hand and right hand divide a chord.
 *
 * The fourth voice is always given a pitch even when it is silent, so it is already in the
 * right place when a change of density brings it in.
 */
export function chordIntervals(
  degree: ScaleDegree,
  quality: ChordQuality,
  density: Density,
  config: Config,
): number[] {
  const third = quality === 'minor' ? 3 : 4
  const fourth = density === 3 ? seventhInterval(degree, config) : 12
  return [-12, third, 7, fourth]
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
 * Which chord tone the thinnest density drops: the fourth one, the octave or the seventh.
 * Never the root, the third or the fifth — the third in particular, because that is the only
 * thing telling major from minor.
 */
const OPTIONAL_TONE = 3

/**
 * Level for each voice. Equal-power rather than equal-amplitude: uncorrelated tones sum
 * roughly with the square root of their count, so dividing by it keeps a seventh chord from
 * being louder than a triad.
 *
 * `sources` says which chord tone each voice ended up holding — see `leadVoicing`. Without
 * it this silenced voice number three, which is not the same thing at all: voices swap roles
 * to lead smoothly, so the voice being silenced was whichever one happened to be third in
 * the array. Measured on ordinary progressions, that dropped the **third** out of one chord
 * in three at the thinnest density, leaving a bare root and fifth — where major and minor
 * are literally the same sound. Which is exactly the complaint that the choice between them
 * sometimes seemed to do nothing.
 */
export function voiceGains(density: Density, sources?: readonly number[]): number[] {
  const level = 1 / Math.sqrt(audibleCount(density))
  if (density !== 1) return Array.from({ length: VOICE_COUNT }, () => level)

  // Without an assignment there is nothing better to go on than position, which is what the
  // offline loudness render uses and where it does not matter.
  const order = sources ?? Array.from({ length: VOICE_COUNT }, (_, index) => index)
  return order.map((tone) => (tone === OPTIONAL_TONE ? 0 : level))
}

/** Shifts `pitch` by whole octaves to land as close to `target` as possible. */
export function nearestOctave(pitch: number, target: number): number {
  return pitch + Math.round((target - pitch) / 12) * 12
}

export type Register = { low: number; high: number }

/**
 * The band the chord is allowed to occupy, so voice leading cannot walk it off the keyboard
 * over a long progression.
 *
 * The bottom is a full octave under the root because that is where the bass voice lives —
 * see `chordIntervals`. Anything higher and `intoRegister` would fold the bass note straight
 * back up into the triad, which is exactly the packed voicing it exists to get away from.
 *
 * The top used to be nineteen semitones above the root, and that turned out to be the source
 * of a complaint that the instrument was inconsistent — see `bandsOf`.
 */
export function registerFor(config: Config): Register {
  const base = noteToMidi(config.music.root)
  return { low: base - 12, high: base + 15 }
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

/** Permutations of the *upper* voices only. Voice 0 is the bass and does not take part —
 *  see `leadVoices`. */
const PERMUTATIONS = permutationsOf(VOICE_COUNT - 1)

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

/**
 * Two voices landing on the same note wastes one of them, so one of the pair is moved an
 * octave clear.
 *
 * **Up if there is room, down otherwise.** Moving up unconditionally is what this used to
 * do, and it could push a voice straight out of the top of the register — an F5 in an
 * instrument whose highest note is meant to be G4, and audible as a voice leaping an octave
 * away from the chord. The register is the one promise the voicing makes about where the
 * instrument lives; a collision is not a reason to break it.
 */
function separate(pitches: number[], register: Register): number[] {
  const order = pitches
    .map((pitch, index) => ({ pitch, index }))
    .sort((a, b) => a.pitch - b.pitch)

  for (let i = 1; i < order.length; i++) {
    if (order[i]!.pitch !== order[i - 1]!.pitch) continue

    if (order[i]!.pitch + 12 <= register.high) order[i]!.pitch += 12
    else if (order[i - 1]!.pitch - 12 >= register.low) order[i - 1]!.pitch -= 12
    // Neither direction fits, so the doubling stands. Two voices on one note is a thinner
    // chord than intended; a voice outside the register is a wrong one.
  }

  const out = [...pitches]
  for (const { pitch, index } of order) out[index] = pitch
  return out
}

/**
 * The bottom of the register, where the bass voice lives, and the band above it where the
 * chord is voiced. Two hands on a keyboard, essentially.
 *
 * **Both are eleven semitones wide, and that is the whole point.** A band narrower than an
 * octave has exactly one place for each note of the scale, so a chord has exactly one
 * voicing and the same gesture always sounds the same.
 *
 * The upper band used to be nineteen semitones. Every note then fitted in it twice, an
 * octave apart, and voice leading picked whichever was nearer to where that voice already
 * was — so one finger held after V sounded an octave above one finger held after silence.
 * Measured: four different voicings of the same gesture across six ordinary progressions.
 * That is textbook voice leading and it is also indistinguishable, to somebody learning the
 * thing, from the instrument not working properly. An instrument has to answer the same way
 * every time before anything else about it can be learned.
 *
 * Voice leading is not thrown away by this — it still decides *which voice* takes which note
 * of the chord, which is what keeps a held oscillator from leaping when the chord changes.
 * What it no longer decides is the octave.
 */
function bandsOf(register: Register): { bass: Register; upper: Register } {
  return {
    bass: { low: register.low, high: register.low + 11 },
    upper: { low: register.high - 11, high: register.high },
  }
}

/**
 * Chooses the inversion by deciding which upper voice takes which note of the chord, then
 * placing each at the octave nearest to where that voice already was.
 *
 * The assignment is the whole point. Leading each voice within a fixed role — this voice
 * always takes the third — still makes every voice move on every chord: going from C major
 * to A minor, the roles force C→A, E→C and G→E. Letting the voices swap roles instead means
 * the two that were already holding C and E simply stay put and only one moves, which is
 * what a pianist's right hand actually does. Three upper voices is six assignments, so the
 * best one is found by trying them all.
 *
 * **Voice 0 is the bass and is exempt from all of that.** It takes the chord root, in the
 * bottom octave of the register, every time.
 *
 * Letting it join the dance was tried and was worse in two ways that both reached the ear.
 * The bass note became incidental — whichever voice happened to be cheapest to move took
 * the low root, so on some chords there was no bass at all. And with every voice free to
 * roam the whole register, minimising movement produced voicings like C2-E2-G4-C4: a major
 * third down in the mud, a two-octave hole in the middle, and the chord hanging above it.
 * Movement is not the only thing that matters about a chord; where it sits is the other.
 *
 * A bass is a real role, unlike "the voice that takes the third", and pinning it is what
 * every keyboard player does with their left hand.
 */
export type Voicing = {
  pitches: number[]
  /**
   * Which note of the chord each voice ended up holding, as an index into `target`.
   *
   * Voices swap roles to lead smoothly, so "voice two" does not mean anything musical on its
   * own. Anything that wants to treat one chord tone differently from another — which is all
   * `voiceGains` does — has to be told the assignment rather than assume it.
   */
  sources: number[]
}

export function leadVoicing(
  target: readonly number[],
  previous: readonly number[] | null,
  register: Register,
): Voicing {
  const { bass, upper } = bandsOf(register)
  const root = target[0]
  if (root === undefined) return { pitches: [], sources: [] }

  const bassPitch = intoRegister(root, bass)
  const upperTargets = target.slice(1)

  if (previous === null || previous.length !== target.length) {
    return {
      pitches: [
        bassPitch,
        ...separate(
          upperTargets.map((pitch) => intoRegister(pitch, upper)),
          upper,
        ),
      ],
      // Straight through: voice 1 takes target 1, and so on.
      sources: [0, ...upperTargets.map((_, index) => index + 1)],
    }
  }

  const upperPrevious = previous.slice(1)
  let bestOrder: number[] = []
  let best: number[] = []
  let bestCost = Infinity

  for (const permutation of PERMUTATIONS) {
    if (permutation.length !== upperTargets.length) continue

    const placed: number[] = []
    let cost = 0

    for (let voice = 0; voice < upperTargets.length; voice++) {
      const tone = upperTargets[permutation[voice]!]!
      const from = upperPrevious[voice]!
      const pitch = intoRegister(nearestOctave(tone, from), upper)
      placed.push(pitch)
      cost += Math.abs(pitch - from)
    }

    if (cost < bestCost) {
      bestCost = cost
      best = placed
      // Shifted by one, because voice 0 is the bass and took target 0.
      bestOrder = permutation.map((index) => index + 1)
    }
  }

  return {
    pitches: [bassPitch, ...separate(best, upper)],
    sources: [0, ...bestOrder],
  }
}

/** Just the pitches, for callers that do not care which voice took which note of the chord. */
export function leadVoices(
  target: readonly number[],
  previous: readonly number[] | null,
  register: Register,
): number[] {
  return leadVoicing(target, previous, register).pitches
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
