/**
 * Teaching the instrument your hands.
 *
 * Thresholds have to be right for everybody, and no single number ever is — a pinky is a
 * quarter shorter than a middle finger, people fold a коза to different depths, and every
 * camera lies about depth in its own way. This walks through each gesture once, records
 * what the tracker actually reports for *your* hand, and hands back a model that recognises
 * shapes by comparison instead of by rule.
 *
 * Capture asks you to move while holding the shape. That is the part that matters: the
 * instrument is played with the hand tilted, so a gesture recorded from one angle is a
 * gesture recognised from one angle. Waving through a range during capture is what buys
 * back the tilts it failed at.
 */
import type { Config } from '../config'
import { buildModel, type GestureModel } from '../gesture/classifier'
import { handFeatures } from '../gesture/features'
import { FINGER_BIT } from '../gesture/landmarks'
import type { Calibration } from '../gesture/modelStore'
import type { FingerMask, HandFrame } from '../types'

const { THUMB, INDEX, MIDDLE, RING, PINKY } = FINGER_BIT

/**
 * The shaping hand's thumb is not part of its gesture — it chooses major or minor, and is
 * read as an angle rather than as a bit of the mask. So the model for that hand has to
 * recognise each density with the thumb either way, which is why its steps ask for the
 * thumb to be moved while they record. Stripping the bit here keeps the recorded classes
 * to one per density instead of two.
 */
function labelFor(step: Step): FingerMask {
  return step.role === 'left' ? step.mask & ~THUMB : step.mask
}

type Step = {
  role: 'right' | 'left'
  mask: FingerMask
  title: string
  detail: string
}

/**
 * What gets recorded, in order.
 *
 * The chord hand learns seven shapes and the shaping hand four. They are kept apart rather
 * than mirrored into one model because a left hand is a reflection of a right one and the
 * numbers know it — see gesture/features.ts. Splitting them also leaves each model with a
 * narrower question to answer, which is worth more than the captures it costs.
 */
export const STEPS: readonly Step[] = [
  { role: 'right', mask: INDEX, title: '1 finger', detail: 'Index up, the rest down.' },
  { role: 'right', mask: INDEX | MIDDLE, title: '2 fingers', detail: 'Index and middle.' },
  { role: 'right', mask: INDEX | MIDDLE | RING, title: '3 fingers', detail: 'Index, middle, ring.' },
  {
    role: 'right',
    mask: INDEX | MIDDLE | RING | PINKY,
    title: '4 fingers',
    detail: 'All four up, thumb tucked in.',
  },
  {
    role: 'right',
    mask: THUMB | INDEX | MIDDLE | RING | PINKY,
    title: 'Open palm',
    detail: 'Everything out, thumb included.',
  },
  {
    role: 'right',
    mask: INDEX | PINKY,
    title: 'коза',
    detail: 'Index and pinky. Fold the middle two however you naturally do — that is exactly what this is here to learn.',
  },
  {
    role: 'right',
    mask: THUMB | INDEX | PINKY,
    title: 'коза + thumb',
    detail: 'The same, with the thumb swung out.',
  },
  { role: 'left', mask: 0, title: 'Fist', detail: 'Closed hand — this is the mute.' },
  {
    role: 'left',
    mask: INDEX,
    title: '1 finger',
    detail: 'Shaping hand: triad. Swing your thumb out and tuck it back in a few times while this records — on this hand the thumb chooses major or minor, so it has to be seen doing both.',
  },
  {
    role: 'left',
    mask: INDEX | MIDDLE,
    title: '2 fingers',
    detail: 'Triad plus octave. Thumb in and out again.',
  },
  {
    role: 'left',
    mask: INDEX | MIDDLE | RING,
    title: '3 fingers',
    detail: 'Seventh chord. Thumb in and out again.',
  },
]

/** Frames recorded per gesture, and the countdown before recording starts. At 30–60 fps
 *  this is between one and two seconds of hand — long enough to turn it through a range,
 *  short enough that eleven of them is not a chore. */
const SAMPLES_PER_STEP = 45
const COUNTDOWN_MS = 1400

export type Calibrator = {
  /** Feed every camera frame. Does nothing unless a session is running. */
  update: (frame: HandFrame, fresh: boolean, nowMs: number) => void
  start: () => void
  cancel: () => void
  readonly running: boolean
  /** Fires with the finished calibration. */
  onDone: (listener: (calibration: Calibration) => void) => void
  dispose: () => void
}

export function createCalibrator(config: Config): Calibrator {
  const panel = document.createElement('aside')
  panel.id = 'calibrate'
  panel.hidden = true

  const heading = document.createElement('div')
  heading.className = 'calibrate-heading'
  panel.append(heading)

  const shape = document.createElement('strong')
  shape.className = 'calibrate-shape'
  panel.append(shape)

  const detail = document.createElement('p')
  detail.className = 'calibrate-detail'
  panel.append(detail)

  const status = document.createElement('div')
  status.className = 'calibrate-status'
  panel.append(status)

  const meter = document.createElement('div')
  meter.className = 'calibrate-meter'
  const fill = document.createElement('span')
  meter.append(fill)
  panel.append(meter)

  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'calibrate-cancel'
  cancelButton.textContent = 'Cancel'
  panel.append(cancelButton)

  document.body.append(panel)

  const listeners: ((calibration: Calibration) => void)[] = []

  let running = false
  let stepIndex = 0
  let startedAt = 0
  let samples: { role: 'right' | 'left'; mask: FingerMask; features: number[] }[] = []
  let captured = 0

  function step(): Step {
    return STEPS[stepIndex]!
  }

  function render(waiting: boolean, missing: boolean): void {
    const current = step()
    heading.textContent = `${stepIndex + 1} of ${STEPS.length} · ${current.role === 'right' ? 'chord hand' : 'shaping hand'}`
    shape.textContent = current.title
    detail.textContent = current.detail

    if (missing) {
      status.textContent = 'Show that hand to the camera'
      fill.style.width = '0%'
    } else if (waiting) {
      status.textContent = 'Get ready…'
      fill.style.width = '0%'
    } else {
      status.textContent = 'Recording — turn and tilt your hand a little'
      fill.style.width = `${Math.round((captured / SAMPLES_PER_STEP) * 100)}%`
    }
  }

  function finish(): void {
    running = false
    panel.hidden = true

    const calibration: Calibration = { right: null, left: null }
    for (const role of ['right', 'left'] as const) {
      const forRole = samples.filter((sample) => sample.role === role)
      if (forRole.length > 0) calibration[role] = trimmed(buildModel(forRole))
    }

    for (const listener of listeners) listener(calibration)
  }

  function advance(): void {
    stepIndex++
    captured = 0
    startedAt = 0
    if (stepIndex >= STEPS.length) finish()
  }

  cancelButton.addEventListener('click', () => {
    running = false
    panel.hidden = true
  })

  return {
    get running() {
      return running
    },

    start() {
      running = true
      stepIndex = 0
      captured = 0
      startedAt = 0
      samples = []
      panel.hidden = false
      render(true, false)
    },

    cancel() {
      running = false
      panel.hidden = true
    },

    update(frame, fresh, nowMs) {
      if (!running || !fresh) return

      const current = step()
      const hand = frame[current.role]
      if (hand === null) {
        // The countdown does not run while the hand is out of shot, so stepping away and
        // coming back resumes rather than recording an empty room.
        startedAt = 0
        render(false, true)
        return
      }

      if (startedAt === 0) startedAt = nowMs
      if (nowMs - startedAt < COUNTDOWN_MS) {
        render(true, false)
        return
      }

      const features = handFeatures(config.vision.use3d ? hand.world : hand.landmarks)
      if (features !== null) {
        samples.push({ role: current.role, mask: labelFor(current), features })
        captured++
      }

      render(false, false)
      if (captured >= SAMPLES_PER_STEP) advance()
    },

    onDone: (listener) => listeners.push(listener),
    dispose: () => panel.remove(),
  }
}

/**
 * Rounds the model's numbers on the way to storage.
 *
 * Four decimal places on a measurement normalised to palm length is well past anything the
 * tracker can actually resolve, and it roughly halves what goes into localStorage.
 */
function trimmed(model: GestureModel): GestureModel {
  const round = (values: number[]) => values.map((value) => Math.round(value * 10000) / 10000)

  return {
    version: model.version,
    classes: model.classes.map((gesture) => ({
      mask: gesture.mask,
      centroid: round(gesture.centroid),
      exemplars: gesture.exemplars.map(round),
      spread: Math.round(gesture.spread * 10000) / 10000,
      separation: Math.round(gesture.separation * 10000) / 10000,
    })),
  }
}
