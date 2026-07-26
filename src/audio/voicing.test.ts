import { describe, expect, it } from 'vitest'
import { defaultConfig, type Config } from '../config'
import type { ChordQuality, Density, ScaleDegree } from '../types'
import {
  audibleCount,
  chordIntervals,
  chordLabel,
  chordNotes,
  chordPitches,
  leadVoices,
  midiToFrequency,
  midiToNote,
  nearestOctave,
  noteToMidi,
  registerFor,
  rootMidi,
  seventhInterval,
  voiceGains,
  VOICE_COUNT,
} from './voicing'

const DEGREES: ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7]
const DENSITIES: Density[] = [1, 2, 3]

describe('note and midi conversion', () => {
  it('places middle C and concert A where the MIDI standard does', () => {
    expect(noteToMidi('C4')).toBe(60)
    expect(noteToMidi('A4')).toBe(69)
    expect(midiToFrequency(69)).toBeCloseTo(440, 9)
  })

  it('reads sharps and flats', () => {
    expect(noteToMidi('C#4')).toBe(61)
    expect(noteToMidi('Db4')).toBe(61)
  })

  it('rejects things that are not note names', () => {
    expect(() => noteToMidi('H4')).toThrow()
    expect(() => noteToMidi('C')).toThrow()
  })

  it('doubles frequency for each octave', () => {
    expect(midiToFrequency(72) / midiToFrequency(60)).toBeCloseTo(2, 9)
  })
})

describe('scale degrees', () => {
  it('walks the major scale from the configured root', () => {
    expect(DEGREES.map((d) => midiToNote(rootMidi(d, defaultConfig)))).toEqual([
      'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3',
    ])
  })

  it('follows the root when it is changed', () => {
    const config: Config = structuredClone(defaultConfig)
    config.music.root = 'A2'
    expect(midiToNote(rootMidi(1, config))).toBe('A2')
    expect(midiToNote(rootMidi(5, config))).toBe('E3')
  })
})

// No fixed interval is right everywhere: a major seventh over V drags in the raised
// fourth, a minor seventh over I turns the tonic bluesy. The scale knows the answer.
describe('seventhInterval', () => {
  it('gives a major seventh on I and IV', () => {
    expect(seventhInterval(1, defaultConfig)).toBe(11)
    expect(seventhInterval(4, defaultConfig)).toBe(11)
  })

  it('gives a dominant seventh on V', () => {
    expect(seventhInterval(5, defaultConfig)).toBe(10)
  })

  it('gives a minor seventh on ii, iii and vi', () => {
    for (const degree of [2, 3, 6] as ScaleDegree[]) {
      expect(seventhInterval(degree, defaultConfig)).toBe(10)
    }
  })

  it('keeps every seventh inside the scale', () => {
    const inScale = new Set(defaultConfig.music.scale.map((step) => ((step % 12) + 12) % 12))
    const tonic = noteToMidi(defaultConfig.music.root)

    for (const degree of DEGREES) {
      const seventh = rootMidi(degree, defaultConfig) + seventhInterval(degree, defaultConfig)
      expect(inScale.has((((seventh - tonic) % 12) + 12) % 12), `degree ${degree}`).toBe(true)
    }
  })

  it('follows a change of scale', () => {
    const config: Config = structuredClone(defaultConfig)
    config.music.scale = [0, 2, 3, 5, 7, 8, 10] // natural minor
    expect(seventhInterval(1, config)).toBe(10)
  })
})

// The point of the new density mapping: every setting is a chord, and every setting
// contains the third — otherwise the wrist tilt has nothing to change.
describe('every density is a chord', () => {
  it('sounds a triad, then a triad plus its octave or seventh', () => {
    expect(audibleCount(1)).toBe(3)
    expect(audibleCount(2)).toBe(4)
    expect(audibleCount(3)).toBe(4)
  })

  it('includes the third at every density, so tilt is always audible', () => {
    for (const density of DENSITIES) {
      const intervals = chordIntervals(1, 'major', density, defaultConfig).slice(0, audibleCount(density))
      expect(intervals, `density ${density}`).toContain(4)
    }
  })

  it('sounds different for major and minor at every density', () => {
    for (const density of DENSITIES) {
      expect(
        chordNotes(3, 'minor', density, defaultConfig),
        `density ${density}`,
      ).not.toEqual(chordNotes(3, 'major', density, defaultConfig))
    }
  })

  it('never sounds fewer than three notes', () => {
    for (const density of DENSITIES) expect(audibleCount(density)).toBeGreaterThanOrEqual(3)
  })

  it('gives the silent fourth voice a pitch anyway, so it is in place when it arrives', () => {
    expect(chordPitches(1, 'major', 1, defaultConfig)).toHaveLength(VOICE_COUNT)
  })

  it('puts the seventh on the fourth voice only at the richest density', () => {
    const root = rootMidi(5, defaultConfig)
    expect(chordPitches(5, 'major', 3, defaultConfig)[3]! - root).toBe(10)
    expect(chordPitches(5, 'major', 2, defaultConfig)[3]! - root).toBe(12)
  })
})

describe('voiceGains', () => {
  it('silences the voices that are not in use', () => {
    expect(voiceGains(1)[3]).toBe(0)
    expect(voiceGains(2)[3]).toBeGreaterThan(0)
  })

  it('keeps a four-note chord from being louder than a triad', () => {
    const power = (density: Density) => voiceGains(density).reduce((sum, g) => sum + g * g, 0)
    expect(power(3)).toBeCloseTo(power(1), 9)
  })

  it('never exceeds unity on any voice', () => {
    for (const density of DENSITIES) {
      for (const gain of voiceGains(density)) {
        expect(gain).toBeGreaterThanOrEqual(0)
        expect(gain).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('nearestOctave', () => {
  it('shifts by whole octaves only', () => {
    expect((nearestOctave(48, 70) - 48) % 12).toBe(0)
  })

  it('lands within a tritone of the target', () => {
    for (let pitch = 30; pitch < 90; pitch++) {
      for (let target = 30; target < 90; target += 7) {
        expect(Math.abs(nearestOctave(pitch, target) - target)).toBeLessThanOrEqual(6)
      }
    }
  })
})

describe('leadVoices', () => {
  const register = registerFor(defaultConfig)

  const FOUR_CHORDS: [ScaleDegree, ChordQuality][] = [
    [1, 'major'],
    [5, 'major'],
    [6, 'minor'],
    [4, 'major'],
    [1, 'major'],
  ]

  function walk(
    progression: [ScaleDegree, ChordQuality][],
    lead: boolean,
  ): { pitches: number[][]; distance: number } {
    let previous: number[] | null = null
    const pitches: number[][] = []
    let distance = 0

    for (const [degree, quality] of progression) {
      const target = chordPitches(degree, quality, 1, defaultConfig)
      const placed: number[] = lead ? leadVoices(target, previous, register) : [...target]
      if (previous !== null) {
        for (let i = 0; i < placed.length; i++) distance += Math.abs(placed[i]! - previous[i]!)
      }
      pitches.push(placed)
      previous = placed
    }

    return { pitches, distance }
  }

  // Root-position triads march around the keyboard in parallel blocks, which is
  // recognisably not how anyone plays piano.
  it('moves far less than parallel root-position chords', () => {
    const led = walk(FOUR_CHORDS, true).distance
    const parallel = walk(FOUR_CHORDS, false).distance
    expect(led).toBeLessThan(parallel * 0.6)
  })

  // C major and A minor share C and E. A pianist leaves those fingers where they are.
  it('holds the notes two neighbouring chords have in common', () => {
    const c = leadVoices(chordPitches(1, 'major', 1, defaultConfig), null, register)
    const a = leadVoices(chordPitches(6, 'minor', 1, defaultConfig), c, register)

    const held = a.filter((pitch) => c.includes(pitch)).length
    expect(held).toBeGreaterThanOrEqual(2)
  })

  it('keeps every voice inside the register over a long progression', () => {
    let previous: number[] | null = null

    for (let round = 0; round < 40; round++) {
      for (const [degree, quality] of FOUR_CHORDS) {
        previous = leadVoices(chordPitches(degree, quality, 3, defaultConfig), previous, register)
        for (const pitch of previous) {
          expect(pitch).toBeGreaterThanOrEqual(register.low)
          // separate() may push a collision one octave past the top; nothing beyond that.
          expect(pitch).toBeLessThanOrEqual(register.high + 12)
        }
      }
    }
  })

  it('changes only the octave of a note, never its pitch class', () => {
    const target = chordPitches(6, 'minor', 3, defaultConfig)
    const led = leadVoices(target, chordPitches(1, 'major', 3, defaultConfig), register)

    const wanted = target.map((pitch) => ((pitch % 12) + 12) % 12).sort()
    const got = led.map((pitch) => ((pitch % 12) + 12) % 12).sort()
    expect(got).toEqual(wanted)
  })

  it('leaves a repeated chord exactly where it was', () => {
    const first = leadVoices(chordPitches(1, 'major', 1, defaultConfig), null, register)
    const second = leadVoices(chordPitches(1, 'major', 1, defaultConfig), first, register)
    expect(second).toEqual(first)
  })

  it('never puts two voices on the same note', () => {
    let previous: number[] | null = null
    for (const density of [1, 2, 3, 1, 3] as Density[]) {
      for (const [degree, quality] of FOUR_CHORDS) {
        previous = leadVoices(chordPitches(degree, quality, density, defaultConfig), previous, register)
        expect(new Set(previous).size, `${degree} ${quality} d${density}`).toBe(previous.length)
      }
    }
  })
})

describe('chordLabel', () => {
  it('names plain triads', () => {
    expect(chordLabel(1, 'major', 1, defaultConfig)).toBe('C')
    expect(chordLabel(6, 'minor', 1, defaultConfig)).toBe('Am')
  })

  it('names sevenths the way a musician would', () => {
    expect(chordLabel(1, 'major', 3, defaultConfig)).toBe('Cmaj7')
    expect(chordLabel(5, 'major', 3, defaultConfig)).toBe('G7')
    expect(chordLabel(6, 'minor', 3, defaultConfig)).toBe('Am7')
  })

  it('does not add a seventh at densities that do not play one', () => {
    expect(chordLabel(5, 'major', 2, defaultConfig)).toBe('G')
  })
})
