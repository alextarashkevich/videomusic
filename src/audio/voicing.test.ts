import { describe, expect, it } from 'vitest'
import { defaultConfig, type Config } from '../config'
import type { Density, ScaleDegree } from '../types'
import {
  audibleVoices,
  chordNotes,
  midiToFrequency,
  midiToNote,
  noteToMidi,
  rootMidi,
  voiceLevels,
  voicePitches,
} from './voicing'

describe('note and midi conversion', () => {
  it('places middle C and concert A where the MIDI standard does', () => {
    expect(noteToMidi('C4')).toBe(60)
    expect(noteToMidi('A4')).toBe(69)
    expect(midiToFrequency(69)).toBeCloseTo(440, 9)
  })

  it('reads sharps and flats', () => {
    expect(noteToMidi('C#4')).toBe(61)
    expect(noteToMidi('Db4')).toBe(61)
    expect(noteToMidi('Bb3')).toBe(58)
  })

  it('round-trips through midi', () => {
    for (const note of ['C0', 'C3', 'F#4', 'A4', 'G8']) {
      expect(midiToNote(noteToMidi(note))).toBe(midiToNote(noteToMidi(note)))
      expect(noteToMidi(midiToNote(noteToMidi(note)))).toBe(noteToMidi(note))
    }
  })

  it('rejects things that are not note names', () => {
    expect(() => noteToMidi('H4')).toThrow()
    expect(() => noteToMidi('C')).toThrow()
    expect(() => noteToMidi('')).toThrow()
  })

  it('doubles frequency for each octave', () => {
    expect(midiToFrequency(72) / midiToFrequency(60)).toBeCloseTo(2, 9)
  })
})

describe('scale degrees', () => {
  it('walks the major scale from the configured root', () => {
    const notes = ([1, 2, 3, 4, 5, 6, 7] as ScaleDegree[]).map((degree) =>
      midiToNote(rootMidi(degree, defaultConfig)),
    )
    expect(notes).toEqual(['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'])
  })

  it('follows the root when it is changed', () => {
    const config: Config = structuredClone(defaultConfig)
    config.music.root = 'A2'
    expect(midiToNote(rootMidi(1, config))).toBe('A2')
    expect(midiToNote(rootMidi(5, config))).toBe('E3')
  })

  it('follows a different scale', () => {
    const config: Config = structuredClone(defaultConfig)
    config.music.scale = [0, 3, 5, 7, 10, 12, 15] // minor pentatonic-ish
    expect(midiToNote(rootMidi(2, config))).toBe('D#3')
  })
})

describe('voicePitches', () => {
  it('puts the third four semitones up in major and three in minor', () => {
    const major = voicePitches(1, 'major', defaultConfig)
    const minor = voicePitches(1, 'minor', defaultConfig)

    expect(major.third - major.root).toBe(4)
    expect(minor.third - minor.root).toBe(3)
  })

  it('keeps root, octave and fifth the same whichever the quality', () => {
    const major = voicePitches(4, 'major', defaultConfig)
    const minor = voicePitches(4, 'minor', defaultConfig)

    expect(minor.root).toBe(major.root)
    expect(minor.octave).toBe(major.octave)
    expect(minor.fifth).toBe(major.fifth)
  })

  it('spaces the octave and fifth correctly above the root', () => {
    const pitches = voicePitches(3, 'major', defaultConfig)
    expect(pitches.octave - pitches.root).toBe(12)
    expect(pitches.fifth - pitches.root).toBe(7)
  })

  // The reason voices have fixed roles: a voice that switched jobs with density would
  // audibly swoop every time the left hand changed shape.
  it('gives every voice a pitch that does not depend on density', () => {
    const pitches = voicePitches(2, 'minor', defaultConfig)
    for (const density of [1, 2, 3] as Density[]) {
      for (const role of audibleVoices(density)) {
        expect(voicePitches(2, 'minor', defaultConfig)[role]).toBe(pitches[role])
      }
    }
  })
})

describe('voiceLevels', () => {
  it('sounds one note, a note plus its octave, then a triad', () => {
    expect(audibleVoices(1)).toEqual(['root'])
    expect(audibleVoices(2)).toEqual(['root', 'octave'])
    expect(audibleVoices(3)).toEqual(['root', 'third', 'fifth'])
  })

  it('silences the voices that are not in use', () => {
    const levels = voiceLevels(1)
    expect(levels.root).toBeGreaterThan(0)
    expect(levels.octave).toBe(0)
    expect(levels.third).toBe(0)
    expect(levels.fifth).toBe(0)
  })

  it('keeps a triad from being three times as loud as a single note', () => {
    const single = voiceLevels(1)
    const triad = voiceLevels(3)

    const singleTotal = single.root ** 2
    const triadTotal = triad.root ** 2 + triad.third ** 2 + triad.fifth ** 2
    expect(triadTotal).toBeCloseTo(singleTotal, 9)
  })

  it('never exceeds unity on any voice', () => {
    for (const density of [1, 2, 3] as Density[]) {
      for (const level of Object.values(voiceLevels(density))) {
        expect(level).toBeLessThanOrEqual(1)
        expect(level).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('chordNotes', () => {
  it('spells the tonic triad', () => {
    expect(chordNotes(1, 'major', 3, defaultConfig)).toEqual(['C3', 'E3', 'G3'])
    expect(chordNotes(1, 'minor', 3, defaultConfig)).toEqual(['C3', 'D#3', 'G3'])
  })

  it('spells the sixth degree, which is the коза gesture', () => {
    expect(chordNotes(6, 'minor', 3, defaultConfig)).toEqual(['A3', 'C4', 'E4'])
  })

  it('drops to a note and an octave as density falls', () => {
    expect(chordNotes(5, 'major', 2, defaultConfig)).toEqual(['G3', 'G4'])
    expect(chordNotes(5, 'major', 1, defaultConfig)).toEqual(['G3'])
  })

  it('sounds the same at density 1 whatever the quality, since one note has none', () => {
    expect(chordNotes(3, 'major', 1, defaultConfig)).toEqual(chordNotes(3, 'minor', 1, defaultConfig))
  })
})
