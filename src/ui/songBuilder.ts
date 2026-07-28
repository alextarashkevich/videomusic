/**
 * Writing a song down, section by section.
 *
 * The point is not composition — it is not having to go and look a song up every time you
 * want to play it. Give it a name, add a verse, tap the chords in, add a chorus, and it is
 * yours and it stays.
 *
 * Chords are picked by **scale degree**, not by name, for the same reason the shipped songs
 * are stored that way: a song written here follows the root and scale dropdowns, so
 * transposing it is a dropdown rather than a rewrite. Each button carries the hand that
 * plays it, so filling in a chorus is also practice at reading the shapes.
 */
import type { Config } from '../config'
import { chordLabel } from '../audio/voicing'
import { DEGREE_BY_MASK } from '../gesture/interpret'
import { degreeLabel, type Chord, type Section, type Song } from '../music/songs'
import { loadSongs, saveSongs } from '../music/songStore'
import type { ScaleDegree } from '../types'
import { handIcon, maskForDegree } from './handIcon'

const DEGREES: ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7]

/** Offered rather than required. Songs do not agree on the vocabulary, so the name is free
 *  text and these are just the ones almost every song has. */
const SECTION_NAMES = ['Verse', 'Chorus', 'Bridge', 'Intro', 'Pre-chorus', 'Outro']

export type SongBuilder = {
  toggle: () => void
  readonly open: boolean
  /** Fires whenever the saved songs change, so the guide can pick them up. */
  onChange: (listener: (songs: Song[]) => void) => void
  dispose: () => void
}

export function createSongBuilder(config: Config): SongBuilder {
  const panel = document.createElement('aside')
  panel.id = 'song-builder'
  panel.hidden = true

  const listeners: ((songs: Song[]) => void)[] = []
  let open = false
  let songs = loadSongs()

  // The song being written. Kept out of `songs` until it is saved, so a half-finished one
  // never appears in the guide.
  let title = ''
  let artist = ''
  let sections: Section[] = [{ name: 'Verse', chords: [] }]
  let active = 0

  function commit(): void {
    saveSongs(songs)
    for (const listener of listeners) listener([...songs])
  }

  function reset(): void {
    title = ''
    artist = ''
    sections = [{ name: 'Verse', chords: [] }]
    active = 0
  }

  function field(label: string, value: string, onInput: (next: string) => void): HTMLElement {
    const wrap = document.createElement('label')
    wrap.className = 'builder-field'
    const caption = document.createElement('span')
    caption.textContent = label
    const input = document.createElement('input')
    input.type = 'text'
    input.value = value
    input.addEventListener('input', () => onInput(input.value))
    wrap.append(caption, input)
    return wrap
  }

  function chordButton(degree: ScaleDegree, quality: 'major' | 'minor'): HTMLElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'builder-chord'
    button.title = `${chordLabel(degree, quality, 1, config)} — ${degreeLabel({ degree, quality })}`

    const name = document.createElement('strong')
    name.textContent = chordLabel(degree, quality, 1, config)

    button.append(handIcon(maskForDegree(degree, DEGREE_BY_MASK), { size: 32, role: 'chord' }), name)
    button.addEventListener('click', () => {
      const section = sections[active]
      if (section === undefined) return
      sections[active] = { ...section, chords: [...section.chords, { degree, quality }] }
      render()
    })
    return button
  }

  function renderSection(section: Section, index: number): HTMLElement {
    const row = document.createElement('div')
    row.className = 'builder-section'
    if (index === active) row.classList.add('is-active')

    const head = document.createElement('div')
    head.className = 'builder-section-head'

    const name = document.createElement('input')
    name.type = 'text'
    name.value = section.name
    name.className = 'builder-section-name'
    name.addEventListener('input', () => {
      sections[index] = { ...section, name: name.value }
    })
    name.addEventListener('focus', () => {
      active = index
      render()
    })

    const drop = document.createElement('button')
    drop.type = 'button'
    drop.className = 'builder-drop'
    drop.textContent = '×'
    drop.title = 'Remove this section'
    drop.addEventListener('click', () => {
      sections.splice(index, 1)
      if (sections.length === 0) sections.push({ name: 'Verse', chords: [] })
      active = Math.min(active, sections.length - 1)
      render()
    })

    head.append(name, drop)

    const chords = document.createElement('div')
    chords.className = 'builder-chords'
    if (section.chords.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'builder-empty'
      empty.textContent = index === active ? 'Tap chords below' : 'Empty'
      chords.append(empty)
    }

    section.chords.forEach((chord: Chord, at) => {
      const tag = document.createElement('button')
      tag.type = 'button'
      tag.className = 'builder-tag'
      tag.textContent = chordLabel(chord.degree, chord.quality, 1, config)
      tag.title = 'Remove'
      tag.addEventListener('click', () => {
        sections[index] = {
          ...section,
          chords: section.chords.filter((_, position) => position !== at),
        }
        render()
      })
      chords.append(tag)
    })

    row.append(head, chords)
    row.addEventListener('click', () => {
      if (active === index) return
      active = index
      render()
    })
    return row
  }

  function render(): void {
    panel.innerHTML = ''

    const heading = document.createElement('div')
    heading.className = 'builder-heading'
    heading.textContent = 'Write a song'
    panel.append(heading)

    panel.append(
      field('Title', title, (next) => (title = next)),
      field('Artist', artist, (next) => (artist = next)),
    )

    const list = document.createElement('div')
    list.className = 'builder-sections'
    sections.forEach((section, index) => list.append(renderSection(section, index)))
    panel.append(list)

    const addSection = document.createElement('div')
    addSection.className = 'builder-add-section'
    for (const name of SECTION_NAMES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = `+ ${name}`
      button.addEventListener('click', () => {
        sections.push({ name, chords: [] })
        active = sections.length - 1
        render()
      })
      addSection.append(button)
    }
    panel.append(addSection)

    const picker = document.createElement('div')
    picker.className = 'builder-picker'
    for (const degree of DEGREES) {
      picker.append(chordButton(degree, 'major'))
    }
    for (const degree of DEGREES) {
      picker.append(chordButton(degree, 'minor'))
    }
    panel.append(picker)

    const actions = document.createElement('div')
    actions.className = 'builder-actions'

    const save = document.createElement('button')
    save.type = 'button'
    save.className = 'builder-save'
    save.textContent = 'Save song'
    // A song with no name or no chords in it is not a song, and saving one would put an
    // untitled empty row in the guide with no way to tell what it was meant to be.
    const usable = title.trim() !== '' && sections.some((section) => section.chords.length > 0)
    save.disabled = !usable
    save.addEventListener('click', () => {
      songs.push({
        title: title.trim(),
        artist: artist.trim(),
        sections: sections.filter((section) => section.chords.length > 0),
        note: 'Yours.',
        custom: true,
      })
      commit()
      reset()
      render()
    })

    actions.append(save)
    panel.append(actions)

    if (songs.length > 0) {
      const saved = document.createElement('div')
      saved.className = 'builder-saved'
      const caption = document.createElement('span')
      caption.textContent = `Your songs (${songs.length})`
      saved.append(caption)

      songs.forEach((song, index) => {
        const row = document.createElement('div')
        row.className = 'builder-saved-row'
        const name = document.createElement('span')
        name.textContent = song.title
        const drop = document.createElement('button')
        drop.type = 'button'
        drop.textContent = '×'
        drop.title = 'Delete'
        drop.addEventListener('click', () => {
          songs = songs.filter((_, position) => position !== index)
          commit()
          render()
        })
        row.append(name, drop)
        saved.append(row)
      })

      panel.append(saved)
    }
  }

  document.body.append(panel)
  render()

  return {
    get open() {
      return open
    },

    toggle() {
      open = !open
      panel.hidden = !open
      if (open) render()
    },

    onChange: (listener) => listeners.push(listener),
    dispose: () => panel.remove(),
  }
}
