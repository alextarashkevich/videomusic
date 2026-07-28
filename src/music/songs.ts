import type { ChordQuality, ScaleDegree } from '../types'

/**
 * Practice material, stored as **scale degrees** rather than named chords.
 *
 * That is what lets one entry follow whatever root and scale the instrument is set to: the
 * same four numbers are C–G–Am–F in C and D–A–Bm–G in D, and transposing is a dropdown
 * rather than a rewrite.
 *
 * Chords only — no melodies and no lyrics. These are harmonic skeletons: the instrument
 * plays triads and sevenths, so a descending bass line under a static chord, a slash chord
 * or a passing diminished comes out as the plain chord it sits on.
 *
 * **These are loops, not transcriptions, and they are named as loops.** There were twenty of
 * them named after particular records, and playing through it the verdict was that most of
 * the chords were odd — fairly, because a four-chord reduction of a real arrangement is not
 * that record and putting the record's name on it promises something it cannot deliver. What
 * is left is the handful of shapes that genuinely are the whole song, or that genuinely are
 * a named progression in their own right. Anything more specific belongs in the song writer,
 * where it is yours and it is right.
 *
 * Songs are broken into **sections** because that is how anyone actually holds a song in
 * their head, and because the interesting thing about several of these is that the second
 * half does something the first did not.
 */
export type Chord = {
  degree: ScaleDegree
  quality: ChordQuality
}

export type Section = {
  /** Verse, Chorus, Bridge, Intro… free text, because songs do not agree on the vocabulary. */
  name: string
  chords: readonly Chord[]
}

export type Song = {
  title: string
  artist: string
  sections: readonly Section[]
  /** Why this one is worth playing — shown under the title. */
  note: string
  /** Set on songs built in the app rather than shipped with it. */
  custom?: boolean
}

const M = (degree: ScaleDegree): Chord => ({ degree, quality: 'major' })
const m = (degree: ScaleDegree): Chord => ({ degree, quality: 'minor' })

/** Every chord in a song, in playing order — what the guide steps through. */
export function progressionOf(song: Song): readonly Chord[] {
  return song.sections.flatMap((section) => section.chords)
}

export const SONGS: readonly Song[] = [
  {
    title: 'Four chords',
    artist: 'half of pop music',
    sections: [
      { name: 'The wheel', chords: [M(1), M(5), m(6), M(4)] },
      { name: 'Started on the minor', chords: [m(6), M(4), M(1), M(5)] },
    ],
    note: 'The same four chords twice, started in two different places. Let It Be, No Woman No Cry, Don’t Stop Believin’, With or Without You, Zombie — and a great many more — are this wheel.',
  },
  {
    title: 'Creep',
    artist: 'Radiohead',
    sections: [{ name: 'Whole song', chords: [M(1), M(3), M(4), m(4)] }],
    note: 'Four chords, all the way through, and the only one of these that is unmistakably itself. The last two are the same fingers — only the other hand’s thumb moves.',
  },
  {
    title: 'The fifties',
    artist: 'Stand By Me, and a thousand others',
    sections: [{ name: 'The wheel', chords: [M(1), m(6), M(4), M(5)] }],
    note: 'Doo-wop. Slow, one chord per bar, and the easiest thing here to play in time.',
  },
  {
    title: 'Canon',
    artist: 'Pachelbel',
    sections: [{ name: 'The ground', chords: [M(1), M(5), m(6), m(3), M(4), M(1), M(4), M(5)] }],
    note: 'Eight chords, three hundred years old, and the first four of them are still everywhere.',
  },
  {
    title: 'The minor loop',
    artist: '(Don’t Fear) The Reaper',
    sections: [{ name: 'Whole song', chords: [m(6), M(5), M(4), M(5)] }],
    note: 'Never resolves to the tonic, which is why it always sounds like it is about to start.',
  },
  {
    title: 'Two chords',
    artist: 'Hallelujah, more or less',
    sections: [
      { name: 'Rock between them', chords: [M(1), m(6), M(1), m(6)] },
      { name: 'Then walk', chords: [M(4), M(5), M(1), M(1)] },
    ],
    note: 'Sit on the first pair as long as you like. The second half is the release.',
  },
  {
    title: 'The third degree',
    artist: 'a road less taken',
    sections: [
      { name: 'Verse', chords: [M(1), m(3), M(1), m(3)] },
      { name: 'Lift', chords: [M(4), M(5), m(6), M(4), M(5), M(1)] },
    ],
    note: 'Most progressions skip the third degree entirely. This one lives on it, and sounds unlike the rest of this list because of it.',
  },
  {
    title: 'Down the scale',
    artist: 'the descending bass',
    sections: [{ name: 'Whole thing', chords: [M(1), M(5), m(6), m(3), M(4)] }],
    note: 'Each chord a step below the last. Stairway, Dust in the Wind and Hotel California all lean on this shape.',
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
