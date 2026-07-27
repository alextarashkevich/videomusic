import { describe, expect, it } from 'vitest'
import { PIANO_NOTES as DOWNLOADED } from '../../scripts/piano-notes.mjs'
import { PIANO_NOTES, sampleUrls } from './pianoSampler'

/** Every sample actually sitting in public/, by filename. Globbed rather than read with
 *  node:fs so this stays a browser-shaped project with no Node types in it. */
const onDisk = new Set(
  Object.keys(import.meta.glob('../../public/samples/piano/*.mp3')).map(
    (path) => path.split('/').pop()!,
  ),
)

describe('piano samples', () => {
  // The engine's list and the download script's list are written out separately — one is
  // TypeScript, the other has to run in plain Node before the build. Drift between them
  // does not fail loudly; it fails as a note missing from the middle of a chord.
  it('asks for exactly the notes the script downloads', () => {
    expect([...PIANO_NOTES]).toEqual(DOWNLOADED)
  })

  it('turns Salamander’s filenames into note names the Sampler understands', () => {
    const urls = sampleUrls()
    expect(urls['D#1']).toBe('Ds1.mp3')
    expect(urls['F#4']).toBe('Fs4.mp3')
    expect(urls['C7']).toBe('C7.mp3')
    expect(Object.keys(urls)).toHaveLength(PIANO_NOTES.length)
  })

  // Catches the case where somebody adds a note here without running the download script,
  // which otherwise shows up as a chord with a hole in it.
  it('has every file on disk', () => {
    for (const file of Object.values(sampleUrls())) {
      expect(onDisk.has(file), file).toBe(true)
    }
  })

  // A gap wider than a minor third starts to sound stretched, and the Sampler fills gaps by
  // pitching the nearest sample up.
  it('leaves no gap wider than a minor third', () => {
    const semitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
    const midi = PIANO_NOTES.map((note) => {
      const [, letter, sharp, octave] = /^([A-G])(s?)(\d)$/.exec(note)!
      return (Number(octave) + 1) * 12 + semitone[letter!]! + (sharp === 's' ? 1 : 0)
    })

    for (let index = 1; index < midi.length; index++) {
      expect(midi[index]! - midi[index - 1]!, PIANO_NOTES[index]).toBeLessThanOrEqual(3)
    }
  })
})
