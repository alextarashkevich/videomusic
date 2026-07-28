import { describe, expect, it } from 'vitest'
import { DEGREE_BY_MASK } from '../gesture/interpret'
import { maskForDegree } from '../ui/handIcon'
import { degreeLabel, progressionOf, SONGS } from './songs'

describe('songs', () => {
  it('gives every song a title, a section and some chords', () => {
    for (const song of SONGS) {
      expect(song.title, song.title).not.toBe('')
      expect(song.sections.length, song.title).toBeGreaterThan(0)
      expect(progressionOf(song).length, song.title).toBeGreaterThan(1)

      for (const section of song.sections) {
        expect(section.name, `${song.title} section`).not.toBe('')
        expect(section.chords.length, `${song.title} / ${section.name}`).toBeGreaterThan(0)
      }
    }
  })

  // Every chord has to be reachable with a hand. A degree outside 1..7 would sail through
  // chordPitches and come out as a note from outside the scale with nothing to explain it.
  it('only uses chords the instrument can actually play', () => {
    for (const song of SONGS) {
      for (const chord of progressionOf(song)) {
        expect(chord.degree, song.title).toBeGreaterThanOrEqual(1)
        expect(chord.degree, song.title).toBeLessThanOrEqual(7)
        expect(['major', 'minor'], song.title).toContain(chord.quality)
        // And the gesture tables have to know the shape, or the guide would show a hand
        // nobody can make.
        expect(maskForDegree(chord.degree, DEGREE_BY_MASK), song.title).toBeGreaterThan(0)
      }
    }
  })

  it('has no duplicate titles', () => {
    const titles = SONGS.map((song) => song.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('writes minor degrees in lower case, the way musicians do', () => {
    expect(degreeLabel({ degree: 6, quality: 'minor' })).toBe('vi')
    expect(degreeLabel({ degree: 6, quality: 'major' })).toBe('VI')
  })

  it('flattens sections in playing order', () => {
    const song = {
      title: 'x',
      artist: '',
      note: '',
      sections: [
        { name: 'a', chords: [{ degree: 1, quality: 'major' } as const] },
        { name: 'b', chords: [{ degree: 4, quality: 'minor' } as const] },
      ],
    }
    expect(progressionOf(song).map((chord) => chord.degree)).toEqual([1, 4])
  })
})
