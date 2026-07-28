import { chordLabel } from '../audio/voicing'
import type { Config } from '../config'
import { DEGREE_BY_MASK } from '../gesture/interpret'
import { degreeLabel, progressionOf, SONGS, type Chord, type Song } from '../music/songs'
import type { PerformanceState } from '../types'
import { handIcon, HAND_ORDER, maskForDegree, maskForDensity } from './handIcon'

export type SongGuide = {
  /** Feed the played state each frame; returns nothing, draws itself. */
  update: (state: PerformanceState, deltaMs: number) => void
  next: () => void
  toggle: () => void
  setVisible: (visible: boolean) => void
  /** Swaps in a new set of songs the player has written. */
  setCustom: (songs: readonly Song[]) => void
  readonly open: boolean
}

/** How long the target chord must be held before the guide moves on. Long enough that
 *  a chord brushed past on the way somewhere else does not count as played. */
const HOLD_MS = 400

/**
 * A chord chart that follows the player rather than a clock.
 *
 * Nothing here pushes: play the highlighted chord, hold it a moment, and it steps on.
 * A metronome would fight the instrument, which sustains and has no rhythm of its own.
 *
 * Matching ignores density and everything else the shaping hand does — only which chord and
 * whether it is major or minor.
 */
export function createSongGuide(config: Config): SongGuide {
  const panel = document.createElement('aside')
  panel.id = 'song-guide'
  panel.hidden = true

  const header = document.createElement('div')
  header.className = 'song-header'
  panel.append(header)

  const body = document.createElement('div')
  body.className = 'song-body'
  panel.append(body)

  const footer = document.createElement('div')
  footer.className = 'song-footer'
  panel.append(footer)

  document.body.append(panel)

  let custom: readonly Song[] = []
  let songIndex = 0
  let step = 0
  let heldMs = 0
  let open = false

  function all(): readonly Song[] {
    // Yours first: if you went to the trouble of writing one down, it is the one you want.
    return [...custom, ...SONGS]
  }

  function song(): Song {
    const list = all()
    return list[songIndex % list.length]!
  }

  function render(): void {
    const current = song()
    const list = all()

    header.innerHTML = ''
    const title = document.createElement('strong')
    title.textContent = current.title
    const artist = document.createElement('span')
    artist.textContent = current.artist
    const note = document.createElement('p')
    note.textContent = current.note
    header.append(title, artist, note)

    body.innerHTML = ''
    // Sections are numbered through, so `step` indexes the whole song rather than a section
    // — the guide walks the song, not the section.
    let index = 0

    for (const section of current.sections) {
      const heading = document.createElement('div')
      heading.className = 'song-section'
      heading.textContent = section.name
      body.append(heading)

      const list = document.createElement('ol')
      list.className = 'song-chords'

      for (const chord of section.chords) {
        list.append(chordRow(chord, index === step))
        index++
      }

      body.append(list)
    }

    footer.textContent = `${(songIndex % list.length) + 1}/${list.length}   G next   ⇧G hide`
  }

  function chordRow(chord: Chord, isTarget: boolean): HTMLElement {
    const row = document.createElement('li')
    if (isTarget) row.className = 'is-target'

    const numeral = document.createElement('span')
    numeral.className = 'song-numeral'
    numeral.textContent = degreeLabel(chord)

    const named = document.createElement('span')
    named.className = 'song-name'
    named.textContent = chordLabel(chord.degree, chord.quality, 1, config)

    /*
     * Both hands, in the order they appear on screen.
     *
     * It used to be the chord hand and the words "thumb out". But a chord here is two hands
     * doing two things at once, and that is the part people get wrong — reading a shape off
     * one picture while translating a sentence for the other is exactly the moment the
     * change falls apart. Two pictures side by side is one glance.
     *
     * The shaping hand is drawn holding two fingers, which is illustrative rather than
     * required: the guide matches on the chord and on major or minor, and ignores the
     * voicing entirely. Any number of fingers will step it on. Two is simply the middle one.
     */
    const hands = document.createElement('span')
    hands.className = 'song-hands'
    for (const role of HAND_ORDER) {
      hands.append(
        handIcon(
          role === 'chord'
            ? maskForDegree(chord.degree, DEGREE_BY_MASK)
            : maskForDensity(2, chord.quality === 'major'),
          { size: 30, role, target: isTarget },
        ),
      )
    }

    // Words only on the row being asked for. On every row they are noise; on this one they
    // are the thing a beginner is still translating the picture into.
    const thumb = document.createElement('span')
    thumb.className = 'song-thumb'
    if (isTarget) thumb.textContent = chord.quality === 'minor' ? 'thumb in' : 'thumb out'

    row.append(numeral, named, hands, thumb)
    return row
  }

  function length(): number {
    return progressionOf(song()).length
  }

  function advance(): void {
    step = (step + 1) % Math.max(length(), 1)
    heldMs = 0
    render()
  }

  render()

  return {
    get open() {
      return open
    },

    update(state, deltaMs) {
      if (!open) return

      const target = progressionOf(song())[step]
      if (target === undefined) return

      const matches = state.degree === target.degree && state.quality === target.quality
      if (!matches || !state.gate) {
        if (heldMs !== 0) {
          heldMs = 0
          panel.style.removeProperty('--hold')
        }
        return
      }

      heldMs += deltaMs
      panel.style.setProperty('--hold', String(Math.min(heldMs / HOLD_MS, 1)))
      if (heldMs >= HOLD_MS) {
        panel.style.removeProperty('--hold')
        advance()
      }
    },

    next() {
      songIndex = (songIndex + 1) % all().length
      step = 0
      heldMs = 0
      render()
    },

    setCustom(songs) {
      custom = songs
      songIndex = 0
      step = 0
      render()
    },

    toggle() {
      open = !open
      panel.hidden = !open
    },

    setVisible(visible) {
      panel.hidden = !visible || !open
    },
  }
}
