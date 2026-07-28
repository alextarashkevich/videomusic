import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSongs, saveSongs } from './songStore'
import type { Song } from './songs'

/**
 * Tests run under the `node` environment, which has no browser storage — so this is the
 * whole of it, in memory.
 *
 * A real browser is not what these tests are about. What is being checked here is that
 * arbitrary bytes coming *out* of storage cannot get into the instrument, and a map is a
 * perfectly good source of arbitrary bytes.
 */
function fakeStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, String(value)),
    removeItem: (key) => void entries.delete(key),
    clear: () => entries.clear(),
  }
}

const GOOD: Song = {
  title: 'Mine',
  artist: 'Me',
  sections: [{ name: 'Verse', chords: [{ degree: 1, quality: 'major' }] }],
  note: 'Yours.',
  custom: true,
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
})

describe('songStore', () => {
  it('round-trips a song', () => {
    saveSongs([GOOD])
    expect(loadSongs()).toEqual([GOOD])
  })

  it('returns nothing when there is nothing saved', () => {
    expect(loadSongs()).toEqual([])
  })

  it('survives contents that are not JSON at all', () => {
    localStorage.setItem('gesture-synth.songs', '{oh no')
    expect(loadSongs()).toEqual([])
  })

  /**
   * This is localStorage: the contents can be from a much older build, hand-edited or
   * corrupt. A degree of 9 would otherwise reach `chordPitches` and produce a note from
   * outside the scale, sounding like a bug in the instrument rather than in the data.
   */
  it('drops chords whose degree is out of range', () => {
    localStorage.setItem(
      'gesture-synth.songs',
      JSON.stringify([
        {
          title: 'Bad',
          sections: [
            {
              name: 'Verse',
              chords: [
                { degree: 9, quality: 'major' },
                { degree: 0, quality: 'major' },
                { degree: 2, quality: 'major' },
              ],
            },
          ],
        },
      ]),
    )

    const [song] = loadSongs()
    expect(song?.sections[0]?.chords).toEqual([{ degree: 2, quality: 'major' }])
  })

  it('drops a song with no usable chords rather than showing an empty row', () => {
    localStorage.setItem(
      'gesture-synth.songs',
      JSON.stringify([{ title: 'Empty', sections: [{ name: 'Verse', chords: [] }] }]),
    )
    expect(loadSongs()).toEqual([])
  })

  it('drops a song with no title, which nothing could name in the list', () => {
    localStorage.setItem(
      'gesture-synth.songs',
      JSON.stringify([
        { title: '   ', sections: [{ name: 'Verse', chords: [{ degree: 1, quality: 'major' }] }] },
      ]),
    )
    expect(loadSongs()).toEqual([])
  })

  it('rejects a quality that is neither major nor minor', () => {
    localStorage.setItem(
      'gesture-synth.songs',
      JSON.stringify([
        {
          title: 'Odd',
          sections: [{ name: 'Verse', chords: [{ degree: 1, quality: 'diminished' }] }],
        },
      ]),
    )
    expect(loadSongs()).toEqual([])
  })

  it('marks everything it loads as custom, whatever was written in the file', () => {
    localStorage.setItem(
      'gesture-synth.songs',
      JSON.stringify([
        {
          title: 'Sneaky',
          custom: false,
          sections: [{ name: 'Verse', chords: [{ degree: 1, quality: 'major' }] }],
        },
      ]),
    )
    expect(loadSongs()[0]?.custom).toBe(true)
  })
})
