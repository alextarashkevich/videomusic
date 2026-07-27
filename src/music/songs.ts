import type { ChordQuality, ScaleDegree } from '../types'

/**
 * Practice progressions, stored as scale degrees rather than named chords so they follow
 * whatever root and scale the instrument is set to.
 *
 * Chords only — no melodies and no lyrics. Several are simplified: the instrument plays
 * triads and sevenths, so a descending bass line under a static chord, or a slash chord,
 * comes out as the plain chord it sits on.
 */
export type Chord = {
  degree: ScaleDegree
  quality: ChordQuality
}

export type Song = {
  title: string
  artist: string
  progression: readonly Chord[]
  /** Why this one is worth playing — shown under the title. */
  note: string
}

const major = (degree: ScaleDegree): Chord => ({ degree, quality: 'major' })
const minor = (degree: ScaleDegree): Chord => ({ degree, quality: 'minor' })

export const SONGS: readonly Song[] = [
  {
    title: 'The Nights',
    artist: 'Avicii',
    progression: [major(1), major(5), minor(6), major(4)],
    note: 'The four chords half of pop is built on. Start here.',
  },
  {
    title: 'Creep',
    artist: 'Radiohead',
    progression: [major(1), major(3), major(4), minor(4)],
    note: 'The last two are the same fingers — only the other hand’s thumb moves.',
  },
  {
    title: '(Don’t Fear) The Reaper',
    artist: 'Blue Öyster Cult',
    progression: [minor(6), major(5), major(4), major(5)],
    note: 'Four chords, endlessly. Good for getting the changes clean.',
  },
  {
    title: 'Wonderwall',
    artist: 'Oasis',
    progression: [minor(6), major(1), major(5), major(2)],
    note: 'The last chord is the second degree turned major — thumb out for it.',
  },
  {
    title: 'Dust in the Wind',
    artist: 'Kansas',
    progression: [major(1), minor(6), major(1), minor(6), major(5), major(2), minor(3), minor(6)],
    note: 'Alternates two chords, then walks down. The second degree goes major again.',
  },
  {
    title: 'Hallelujah',
    artist: 'Leonard Cohen',
    progression: [major(1), minor(6), major(1), minor(6), major(4), major(5), major(1), major(1)],
    note: 'The fourth, the fifth, the minor fall, the major lift.',
  },
  {
    title: 'Hey There Delilah',
    artist: 'Plain White T’s',
    progression: [major(1), minor(3), major(1), minor(3), minor(6), major(4), major(1), major(5)],
    note: 'Leans on the third degree, which most progressions skip.',
  },
  {
    title: 'Stairway to Heaven',
    artist: 'Led Zeppelin',
    progression: [minor(6), major(1), major(2), major(4), major(5), minor(6)],
    note: 'The chord skeleton of the intro. The original walks its bass down underneath.',
  },
  {
    title: 'Boulevard of Broken Dreams',
    artist: 'Green Day',
    progression: [minor(6), major(4), major(1), major(5)],
    note: 'The same four chords as The Nights, started somewhere else. Hear the difference.',
  },
]

/** Right-hand gesture for each degree, named the way the README names them. */
export const GESTURE_FOR_DEGREE: Record<ScaleDegree, string> = {
  1: '1 finger',
  2: '2 fingers',
  3: '3 fingers',
  4: '4 fingers',
  5: 'open palm',
  6: 'коза',
  7: 'коза + thumb',
}

export const ROMAN: Record<ScaleDegree, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
}

/** Roman numeral in the case musicians write it: lower for minor. */
export function degreeLabel(chord: Chord): string {
  const numeral = ROMAN[chord.degree]
  return chord.quality === 'minor' ? numeral.toLowerCase() : numeral
}
