import { chordLabel } from '../audio/voicing'
import type { Config } from '../config'
import { degreeLabel, GESTURE_FOR_DEGREE, SONGS, type Song } from '../music/songs'
import type { PerformanceState } from '../types'

export type SongGuide = {
  /** Feed the played state each frame; returns nothing, draws itself. */
  update: (state: PerformanceState, deltaMs: number) => void
  next: () => void
  toggle: () => void
  setVisible: (visible: boolean) => void
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
 * Matching ignores density and everything the left hand does — only the chord counts.
 */
export function createSongGuide(config: Config): SongGuide {
  const panel = document.createElement('aside')
  panel.id = 'song-guide'
  panel.hidden = true

  const header = document.createElement('div')
  header.className = 'song-header'
  panel.append(header)

  const list = document.createElement('ol')
  list.className = 'song-chords'
  panel.append(list)

  const footer = document.createElement('div')
  footer.className = 'song-footer'
  panel.append(footer)

  document.body.append(panel)

  let songIndex = 0
  let step = 0
  let heldMs = 0
  let open = false

  function song(): Song {
    return SONGS[songIndex]!
  }

  function render(): void {
    const current = song()

    header.innerHTML = ''
    const title = document.createElement('strong')
    title.textContent = current.title
    const artist = document.createElement('span')
    artist.textContent = current.artist
    const note = document.createElement('p')
    note.textContent = current.note
    header.append(title, artist, note)

    list.innerHTML = ''
    current.progression.forEach((chord, index) => {
      const row = document.createElement('li')
      if (index === step) row.className = 'is-target'

      const numeral = document.createElement('span')
      numeral.className = 'song-numeral'
      numeral.textContent = degreeLabel(chord)

      const named = document.createElement('span')
      named.className = 'song-name'
      named.textContent = chordLabel(chord.degree, chord.quality, 1, config)

      const gesture = document.createElement('span')
      gesture.className = 'song-gesture'
      // Quality lives on the other hand now, so the guide names what each hand does rather
      // than folding both into one instruction.
      gesture.textContent =
        chord.quality === 'minor'
          ? `${GESTURE_FOR_DEGREE[chord.degree]} · thumb in`
          : `${GESTURE_FOR_DEGREE[chord.degree]} · thumb out`

      row.append(numeral, named, gesture)
      list.append(row)
    })

    footer.textContent = `${songIndex + 1}/${SONGS.length}   G next song   ⇧G hide`
  }

  function advance(): void {
    step = (step + 1) % song().progression.length
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

      const target = song().progression[step]
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
      songIndex = (songIndex + 1) % SONGS.length
      step = 0
      heldMs = 0
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
