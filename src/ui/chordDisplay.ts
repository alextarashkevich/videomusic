/**
 * What is sounding, and the two hands making it.
 *
 * Not the debug readout — that one is a page of numbers, off by default, for working out why
 * the instrument is doing something unexpected. This is the opposite: three things, always
 * on, for a player who wants to know what they just played and how they got there.
 *
 * Naming the chord is what turns waving at a camera into music you can talk about. Showing
 * the hands next to it is what lets somebody watching over your shoulder copy you, and what
 * lets you get back to a chord you stumbled onto and liked.
 */
import { chordLabel } from '../audio/voicing'
import type { Config } from '../config'
import { DEGREE_BY_MASK } from '../gesture/interpret'
import { ROMAN } from '../music/songs'
import type { PerformanceState } from '../types'
import { handIcon, maskForDegree, maskForDensity } from './handIcon'

export type ChordDisplay = {
  /** `notes` is what is actually sounding, lowest first — see `AudioEngine.getNotes`. */
  update: (state: PerformanceState, notes: readonly string[]) => void
  setVisible: (visible: boolean) => void
  dispose: () => void
}

export function createChordDisplay(config: Config): ChordDisplay {
  const panel = document.createElement('aside')
  panel.id = 'chord-display'

  const name = document.createElement('strong')
  name.className = 'chord-name'

  const numeral = document.createElement('span')
  numeral.className = 'chord-numeral'

  /** The pitches, spelled out. "It sometimes plays higher notes and sometimes lower" is not
   *  answerable by anything else on screen — a chord name is the same for every octave. */
  const spelling = document.createElement('span')
  spelling.className = 'chord-notes'

  const hands = document.createElement('div')
  hands.className = 'chord-hands'

  panel.append(name, numeral, spelling, hands)
  document.body.append(panel)

  // Only rebuilt when something actually changes. This runs off the draw loop, and replacing
  // two SVGs sixty times a second to show the same chord is a layout pass for nothing.
  let last = ''

  function render(state: PerformanceState, notes: readonly string[]): void {
    const silent = !state.gate || state.degree === null
    spelling.textContent = silent ? '' : notes.join('  ')

    panel.classList.toggle('is-silent', silent)
    name.textContent = silent
      ? '—'
      : chordLabel(state.degree!, state.quality, state.density, config)
    numeral.textContent =
      state.degree === null
        ? 'no chord'
        : `${state.quality === 'minor' ? ROMAN[state.degree].toLowerCase() : ROMAN[state.degree]}${silent ? ' · muted' : ''}`

    // Shaping hand first, chord hand second — see HAND_ORDER. They are laid out the way they
    // appear on screen, so glancing between the panel and your own hands does not mean
    // crossing them over in your head.
    hands.innerHTML = ''
    hands.append(
      labelled(
        state.gate ? 'shape' : 'muted',
        handIcon(state.gate ? maskForDensity(state.density, state.quality === 'major') : 0, {
          size: 46,
          role: 'shaping',
        }),
      ),
    )
    if (state.degree !== null) {
      hands.append(
        labelled(
          'chord',
          handIcon(maskForDegree(state.degree, DEGREE_BY_MASK), { size: 46, role: 'chord' }),
        ),
      )
    }
  }

  function labelled(text: string, icon: SVGElement): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'chord-hand'
    const caption = document.createElement('span')
    caption.textContent = text
    wrap.append(icon, caption)
    return wrap
  }

  return {
    update(state, notes) {
      const key = [state.gate, state.degree, state.quality, state.density, ...notes].join('|')
      if (key === last) return
      last = key
      render(state, notes)
    },

    setVisible(visible) {
      panel.hidden = !visible
    },

    dispose: () => panel.remove(),
  }
}
