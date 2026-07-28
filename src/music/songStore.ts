/**
 * Songs the player built, kept between sessions.
 *
 * Separate from the shipped list rather than merged into it, so a build that adds or fixes a
 * song cannot clobber something somebody wrote, and clearing your own songs cannot take the
 * built-in ones with it.
 *
 * Everything read back is checked shape by shape. This is localStorage: the contents can be
 * from a much older build, hand-edited, or corrupt, and a song with a degree of 9 in it would
 * otherwise reach `chordPitches` and produce a chord from outside the scale with no clue as
 * to where it came from.
 */
import type { ChordQuality, ScaleDegree } from '../types'
import type { Chord, Section, Song } from './songs'

const STORAGE_KEY = 'gesture-synth.songs'

function isDegree(value: unknown): value is ScaleDegree {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7
}

function isQuality(value: unknown): value is ChordQuality {
  return value === 'major' || value === 'minor'
}

function readChord(raw: unknown): Chord | null {
  if (raw === null || typeof raw !== 'object') return null
  const { degree, quality } = raw as Partial<Chord>
  if (!isDegree(degree) || !isQuality(quality)) return null
  return { degree, quality }
}

function readSection(raw: unknown): Section | null {
  if (raw === null || typeof raw !== 'object') return null
  const { name, chords } = raw as Partial<Section>
  if (typeof name !== 'string' || !Array.isArray(chords)) return null

  const read = chords.map(readChord).filter((chord): chord is Chord => chord !== null)
  if (read.length === 0) return null
  return { name: name.slice(0, 40), chords: read }
}

function readSong(raw: unknown): Song | null {
  if (raw === null || typeof raw !== 'object') return null
  const { title, artist, sections, note } = raw as Partial<Song>
  if (typeof title !== 'string' || title.trim() === '' || !Array.isArray(sections)) return null

  const read = sections.map(readSection).filter((section): section is Section => section !== null)
  if (read.length === 0) return null

  return {
    title: title.slice(0, 60),
    artist: typeof artist === 'string' ? artist.slice(0, 60) : '',
    sections: read,
    note: typeof note === 'string' ? note.slice(0, 200) : '',
    custom: true,
  }
}

export function loadSongs(): Song[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return []

  try {
    const stored = JSON.parse(raw) as unknown
    if (!Array.isArray(stored)) return []
    return stored.map(readSong).filter((song): song is Song => song !== null)
  } catch {
    return []
  }
}

export function saveSongs(songs: readonly Song[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs))
}
