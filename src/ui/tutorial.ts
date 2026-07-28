/**
 * Learning the instrument by playing it.
 *
 * Every step names **one** thing, draws the hand that does it, and then waits. It moves on
 * when the instrument actually reports that state — not when a timer runs out and not when a
 * button is pressed. So it cannot be clicked through, and it cannot claim you did something
 * you did not do.
 *
 * That also makes it the only honest end-to-end test of the whole chain there is. If a
 * gesture is unreadable on your camera the tutorial simply will not advance, and it says
 * which hand it is waiting for — a far better first experience of a bad threshold than an
 * instrument that silently plays nothing.
 *
 * **Written for somebody who has never seen this.** It sat in the corner in small grey type
 * next to a chord chart, a readout and nine buttons, and watching a first-time player use it
 * made the problem obvious: there was too much on screen to know where to look, and the one
 * thing that was explaining itself was the smallest text of the lot. So it is now the middle
 * of the screen in large white type, one instruction at a time, and everything else gets out
 * of the way while it runs.
 *
 * The words avoid music too. "Triad", "seventh", "major" and "degree" are all correct and
 * all useless to somebody who does not already know them — the names are introduced only
 * after the thing has been done once.
 *
 * Deliberately not covered: calibration. It is for hands the rules cannot read, and putting
 * it in front of every new player teaches them to expect trouble.
 */
import { DEGREE_BY_MASK } from '../gesture/interpret'
import { progressionOf, SONGS } from '../music/songs'
import type { PerformanceState } from '../types'
import { handIcon, inHandOrder, maskForDegree, maskForDensity, type HandRole } from './handIcon'

/**
 * How long the target state must hold.
 *
 * Two full seconds, much longer than it takes to prove the shape was made on purpose. That
 * is the point: this is where the shape is learned, and a step that clears the instant your
 * fingers pass through the right position teaches nothing. Being made to sit in a gesture is
 * what fixes it in the hand.
 */
const HOLD_MS = 2000

/**
 * A hand in a step's diagram.
 *
 * **Both hands are always drawn, even when only one of them is being asked for.** A step
 * headed "right hand" made people take their left hand out of shot — reasonably, since
 * nothing on screen said to keep it there — and with the left hand gone there is no sound at
 * all, so the instrument appeared to break the moment the tutorial got specific. The passive
 * hand is drawn dimmed with "keep it up" under it, which is the whole instruction.
 */
type Hand = { mask: number; role: HandRole; active: boolean }

const HAND_NAME: Record<HandRole, string> = { chord: 'right hand', shaping: 'left hand' }

type Step = {
  /** The instruction, in as few words as it can be said. Shown very large. */
  title: string
  /** One short line under it. Optional — several steps do not need one. */
  detail?: string
  hands: Hand[]
  done: (state: PerformanceState) => boolean
  /** Called when the step becomes the current one, for steps that measure a change rather
   *  than a position. */
  begin?: () => void
  /** Shown while waiting, when the waiting is the point rather than a failure. */
  waiting?: string
}

/** What the hand that is not being taught should be doing: a plain chord on the right, an
 *  open hand on the left. Something that sounds, so the instrument is audible throughout. */
const RESTING_DEGREE = 1
const RESTING_DENSITY = 3

/**
 * Both hands for a step, with `active` saying which one the instruction is about.
 *
 * `'both'` is for the song at the end, where the whole point is that the two move together.
 */
function hands(
  active: HandRole | 'both',
  shape: { degree?: number; density?: number; major?: boolean; fist?: boolean } = {},
): Hand[] {
  const { degree = RESTING_DEGREE, density = RESTING_DENSITY, major = true, fist = false } = shape

  return [
    {
      mask: maskForDegree(degree, DEGREE_BY_MASK),
      role: 'chord',
      active: active === 'chord' || active === 'both',
    },
    {
      mask: fist ? 0 : maskForDensity(density, major),
      role: 'shaping',
      active: active === 'shaping' || active === 'both',
    },
  ]
}

function buildSteps(): Step[] {
  /**
   * The lowest the hand has been since this step started.
   *
   * The volume step used to ask for an absolute height near the top of the frame, which is
   * exactly where hand tracking gets unreliable — so it asked the player to go where the
   * instrument could no longer see them, and then waited. Measuring the *lift* instead works
   * wherever they happen to be holding their hand.
   */
  let lowest = 1

  const steps: Step[] = [
    {
      title: 'Hold up both hands',
      detail: 'Where the camera can see them.',
      hands: hands('both'),
      done: (state) => state.degree !== null && state.gate,
      waiting: 'Looking for your hands…',
    },
    {
      title: 'Right hand: one finger',
      detail: 'You just played a chord.',
      hands: hands('chord', { degree: 1 }),
      done: (state) => state.degree === 1,
      waiting: 'If the wrong hand is answering, press X.',
    },
    {
      title: 'Now two fingers',
      detail: 'A different chord.',
      hands: hands('chord', { degree: 2 }),
      done: (state) => state.degree === 2,
    },
    {
      title: 'Now three',
      detail: 'Every count is another chord. Four and an open palm carry on from here.',
      hands: hands('chord', { degree: 3 }),
      done: (state) => state.degree === 3,
    },
    {
      title: 'Index and little finger',
      detail: 'Fold the middle two away. Two fingers again — but different ones, so a different chord.',
      hands: hands('chord', { degree: 6 }),
      done: (state) => state.degree === 6,
    },
    {
      title: 'Left hand: make a fist',
      detail: 'That is how you stop the sound.',
      hands: hands('shaping', { fist: true }),
      done: (state) => !state.gate,
    },
    {
      title: 'Open one finger',
      detail: 'Sound is back, and thin.',
      hands: hands('shaping', { density: 1 }),
      done: (state) => state.gate && state.density === 1,
    },
    {
      title: 'Open three',
      detail: 'More fingers, fuller chord.',
      hands: hands('shaping', { density: 3 }),
      done: (state) => state.gate && state.density === 3,
    },
    {
      title: 'Left thumb out',
      detail: 'Listen. This is the bright one — a major chord.',
      hands: hands('shaping', { density: 2, major: true }),
      done: (state) => state.gate && state.quality === 'major',
    },
    {
      title: 'Left thumb tucked in',
      detail: 'Same fingers, darker sound — a minor chord. This is how you change the mood.',
      hands: hands('shaping', { density: 2, major: false }),
      done: (state) => state.gate && state.quality === 'minor',
    },
    {
      title: 'Lift your left hand',
      detail: 'Higher is louder. Drop it and the sound thins out.',
      hands: hands('shaping', { density: 2 }),
      begin: () => {
        lowest = 1
      },
      done: (state) => {
        lowest = Math.min(lowest, state.volume)
        return state.volume - lowest > 0.3
      },
      waiting: 'Raise it a little…',
    },
  ]

  // The finale: an actual song, one chord at a time. Creep because its last two chords are
  // the same fingers on the chord hand with only the other hand's thumb moving — so the last
  // thing the tutorial asks for is the one thing that is genuinely easy to miss.
  const creep = SONGS.find((song) => song.title === 'Creep')
  if (creep !== undefined) {
    const chords = progressionOf(creep)
    chords.forEach((chord, index) => {
      steps.push({
        title: index === 0 ? 'That is everything' : `Chord ${index + 1} of ${chords.length}`,
        detail:
          index === 0
            ? 'Now play a song. Fingers pick the chord, thumb picks the mood.'
            : chord.quality === 'minor'
              ? 'Same fingers — only the thumb moves.'
              : undefined,
        hands: hands('both', { degree: chord.degree, density: 2, major: chord.quality === 'major' }),
        done: (state) =>
          state.gate && state.degree === chord.degree && state.quality === chord.quality,
      })
    })
  }

  return steps
}

export type Tutorial = {
  /** Feed the played state each frame. Does nothing unless a run is in progress. */
  update: (state: PerformanceState, deltaMs: number) => void
  start: () => void
  stop: () => void
  readonly running: boolean
  /** Fires when the run ends, finished or skipped, so the rest of the interface can come
   *  back. */
  onEnd: (listener: () => void) => void
  dispose: () => void
}

const STORAGE_KEY = 'gesture-synth.tutorial-done'

/** Whether the tutorial has ever been run to the end or skipped, so it can offer itself once
 *  and then get out of the way. */
export function tutorialSeen(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function createTutorial(): Tutorial {
  const steps = buildSteps()

  const panel = document.createElement('div')
  panel.id = 'tutorial'
  panel.hidden = true

  const card = document.createElement('div')
  card.className = 'tutorial-card'
  panel.append(card)

  const dots = document.createElement('div')
  dots.className = 'tutorial-dots'

  const heading = document.createElement('h2')
  heading.className = 'tutorial-title'

  const detail = document.createElement('p')
  detail.className = 'tutorial-detail'

  const handsRow = document.createElement('div')
  handsRow.className = 'tutorial-hands'

  const status = document.createElement('div')
  status.className = 'tutorial-status'

  const skip = document.createElement('button')
  skip.type = 'button'
  skip.className = 'tutorial-skip'
  skip.textContent = 'Skip the tutorial'

  card.append(dots, heading, detail, handsRow, status, skip)
  document.body.append(panel)

  const enders: (() => void)[] = []

  let running = false
  let index = 0
  let heldMs = 0

  function step(): Step | undefined {
    return steps[index]
  }

  function render(): void {
    const current = step()
    if (current === undefined) return

    dots.innerHTML = ''
    for (let at = 0; at < steps.length; at++) {
      const dot = document.createElement('i')
      if (at < index) dot.className = 'is-done'
      else if (at === index) dot.className = 'is-here'
      dots.append(dot)
    }

    heading.textContent = current.title
    detail.textContent = current.detail ?? ''
    detail.hidden = current.detail === undefined

    handsRow.innerHTML = ''
    for (const hand of inHandOrder(current.hands)) {
      const wrap = document.createElement('div')
      wrap.className = hand.active ? 'tutorial-hand' : 'tutorial-hand is-resting'

      // Named in full — "left hand", not "left". The short version read as a direction on
      // screen rather than as one of your own hands.
      const caption = document.createElement('span')
      caption.textContent = HAND_NAME[hand.role]

      // The whole reason both hands are drawn: without this the passive one gets taken out
      // of shot, and an instrument with one hand in front of it makes no sound at all.
      const aside = document.createElement('em')
      aside.textContent = hand.active ? 'do this' : 'keep it up'

      wrap.append(
        handIcon(hand.mask, { size: hand.active ? 132 : 96, role: hand.role, target: hand.active }),
        caption,
        aside,
      )
      handsRow.append(wrap)
    }

    status.textContent = current.waiting ?? ''
    current.begin?.()
  }

  function end(): void {
    running = false
    // Skipping counts as seen too. Being asked again by something you already declined is
    // worse than never being asked.
    localStorage.setItem(STORAGE_KEY, '1')
    panel.hidden = true
    panel.style.removeProperty('--hold')
    for (const listener of enders) listener()
  }

  skip.addEventListener('click', end)

  return {
    get running() {
      return running
    },

    start() {
      running = true
      index = 0
      heldMs = 0
      panel.hidden = false
      render()
    },

    stop: end,
    onEnd: (listener) => enders.push(listener),

    update(state, deltaMs) {
      if (!running) return

      const current = step()
      if (current === undefined) {
        end()
        return
      }

      if (!current.done(state)) {
        if (heldMs !== 0) {
          heldMs = 0
          panel.style.removeProperty('--hold')
          status.textContent = current.waiting ?? ''
        }
        return
      }

      heldMs += deltaMs
      panel.style.setProperty('--hold', String(Math.min(heldMs / HOLD_MS, 1)))
      status.textContent = 'Hold it…'

      if (heldMs < HOLD_MS) return

      panel.style.removeProperty('--hold')
      heldMs = 0
      index++

      if (index >= steps.length) end()
      else render()
    },

    dispose: () => panel.remove(),
  }
}
