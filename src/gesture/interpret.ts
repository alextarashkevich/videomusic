import type { Config } from '../config'
import type {
  Density,
  FingerMask,
  HandFrame,
  Landmarks,
  PerformanceState,
  ScaleDegree,
} from '../types'
import { tiltAmount, tiltMagnitude, volumeLevel } from './angles'
import { classify } from './classifier'
import { handFeatures } from './features'
import { fingerMask, fingerReach, thumbAngle } from './fingers'
import { FINGER_BIT } from './landmarks'
import { EMPTY_CALIBRATION, type Calibration } from './modelStore'
import { createLatch, createSmoother, createStabilizer } from './stabilizer'

const { THUMB, INDEX, MIDDLE, RING, PINKY } = FINGER_BIT

/**
 * Right hand: which fingers are up picks the degree of the scale.
 *
 * Keyed by identity rather than count, which is the only way "коза" (index + pinky) and
 * "two fingers" (index + middle) can be told apart — both are two fingers.
 *
 * One shape per degree. Three was briefly given a second spelling — thumb, index and
 * middle, the way much of Europe counts it — and it went again: a second way to say the
 * same thing is a second way to say it by accident, and it bought nothing the plain three
 * did not already do.
 */
export const DEGREE_BY_MASK: ReadonlyMap<FingerMask, ScaleDegree> = new Map([
  [INDEX, 1],
  [INDEX | MIDDLE, 2],
  [INDEX | MIDDLE | RING, 3],
  [INDEX | MIDDLE | RING | PINKY, 4],
  [THUMB | INDEX | MIDDLE | RING | PINKY, 5],
  [INDEX | PINKY, 6],
  [THUMB | INDEX | PINKY, 7],
] as [FingerMask, ScaleDegree][])

/**
 * Left hand: how thickly the chord is voiced.
 *
 * Keyed on the fingers alone — the thumb is stripped before the lookup, because on this
 * hand the thumb says something else entirely. Out is major, tucked is minor. So each of
 * these has two spellings, and both mean the same density.
 */
export const DENSITY_BY_MASK: ReadonlyMap<FingerMask, Density> = new Map([
  [INDEX, 1],
  [INDEX | MIDDLE, 2],
  [INDEX | MIDDLE | RING, 3],
] as [FingerMask, Density][])

/** A closed left hand is the mute — thumb wherever it likes, so a thumbs-up mutes too. */
export const FIST: FingerMask = 0

/** What the left hand is showing once its thumb has been set aside for the chord quality. */
export function shapedFingers(mask: FingerMask): FingerMask {
  return mask & ~THUMB
}

/** Everything the HUD and tuning panel need to show why the instrument is doing what it
 *  is doing. Not used to make sound. */
export type InterpreterDebug = {
  rightMask: FingerMask | null
  leftMask: FingerMask | null
  rightTilt: number
  leftTilt: number
  /** Shaping hand's thumb, in degrees off the palm — what chooses major or minor. Shown in
   *  the readout because where the two thresholds belong is a property of a hand, and the
   *  only way to find it is to hold the thumb out, then tuck it, and read. */
  leftThumb: number
  rightLostFrames: number
  /** Raw per-finger extension for the chord hand — what the threshold is compared against.
   *  Shown in the readout so it can be set from what the camera actually sees rather than
   *  guessed at. */
  rightReach: Record<string, number>
  /** Whether the chord hand is being read by a calibration or by the rules. */
  calibrated: boolean
  /** The numbers a calibrated decision was made from: how far the hand sat from the nearest
   *  gesture, how far out it would still have been accepted, and how much better that match
   *  was than the next. Rejection is silent by design — the chord holds — so these are the
   *  only way to tell "cannot see my hand" from "cannot decide" from "too far from anything". */
  margin: number
  distance: number
  radius: number
}

export type Interpreter = {
  /**
   * Advances the instrument by one camera frame.
   *
   * `fresh` says whether this is a new observation. The render loop runs at 60 Hz while
   * the camera delivers about 30, so roughly every other call is the same frame seen
   * twice — and counting a repeat toward the stability requirement is not evidence the
   * shape persisted, it is the same evidence counted twice. Stale frames return the last
   * state untouched.
   */
  update: (frame: HandFrame, fresh?: boolean) => PerformanceState
  /** Swaps in a calibration, or clears it back to the rules. Set rather than passed to the
   *  constructor because calibrating happens while the instrument is running. */
  setCalibration: (calibration: Calibration) => void
  readonly debug: InterpreterDebug
  reset: () => void
}

/**
 * Turns what the camera sees into what the synth should play.
 *
 * This is the whole musical mapping, and it is deliberately free of any reference to
 * cameras, audio or the DOM — it is a function of landmark arrays and config, which is
 * what makes the thresholds tunable under test rather than by waving at a screen.
 */
export function createInterpreter(config: Config): Interpreter {
  const degree = createStabilizer<ScaleDegree>()
  const density = createStabilizer<Density>(3)
  const gate = createStabilizer<boolean>(true)
  const major = createLatch(true)
  const tilt = createSmoother(0)
  const volume = createSmoother(0.7)

  let calibration: Calibration = EMPTY_CALIBRATION
  let rightLostFrames = 0
  let last: PerformanceState = {
    gate: true,
    degree: null,
    quality: 'major',
    density: 3,
    tilt: 0,
    volume: 0.7,
  }

  const debug: InterpreterDebug = {
    rightMask: null,
    leftMask: null,
    rightTilt: 0,
    leftTilt: 0,
    leftThumb: 0,
    rightLostFrames: 0,
    rightReach: {},
    calibrated: false,
    margin: 0,
    distance: 0,
    radius: 0,
  }

  /**
   * Which gesture a hand is showing, or null for "not sure".
   *
   * With a calibration this is nearest-neighbour against shapes the player actually held.
   * Without one it falls back to the rules, which never say "not sure" — they always name
   * a mask, and it is the gesture tables that decide whether that mask means anything.
   */
  function read(shape: Landmarks, role: 'left' | 'right'): FingerMask | null {
    const model = calibration[role]
    if (model === null) return fingerMask(shape, config)

    const verdict = classify(handFeatures(shape), model, config.gesture)
    if (role === 'right') {
      debug.margin = verdict.margin
      debug.distance = verdict.distance
      debug.radius = verdict.radius
    }
    return verdict.mask
  }

  return {
    debug,

    setCalibration(next) {
      calibration = next
      debug.calibrated = next.right !== null
    },

    update(frame, fresh = true) {
      if (!fresh) return last

      const { stabilityFrames, handLostFrames } = config.gesture

      if (frame.right !== null) {
        // Shape from the 3D world landmarks, screen-space readings from the flat ones.
        const shape = config.vision.use3d ? frame.right.world : frame.right.landmarks
        const mask = read(shape, 'right')
        debug.rightMask = mask
        debug.rightTilt = tiltMagnitude(frame.right.landmarks)
        debug.rightReach = fingerReach(shape)

        // An unrecognised shape yields null, which holds the last degree instead of
        // committing a stray one. This is what makes rearranging fingers silent: the
        // in-between shapes simply are not in the table.
        degree.push(mask === null ? null : (DEGREE_BY_MASK.get(mask) ?? null), stabilityFrames)

        rightLostFrames = 0
      } else {
        debug.rightMask = null
        rightLostFrames = Math.min(rightLostFrames + 1, handLostFrames)
      }

      if (frame.left !== null) {
        const shape = config.vision.use3d ? frame.left.world : frame.left.landmarks
        const mask = read(shape, 'left')
        debug.leftMask = mask
        debug.leftTilt = tiltMagnitude(frame.left.landmarks)
        debug.leftThumb = thumbAngle(shape)

        // Thumb out is major, tucked is minor, with a dead band between so a thumb resting
        // near the boundary does not flip the chord several times a second. It gets more
        // frames to settle than the notes do: nobody minds the quality arriving a moment
        // after the chord, and everybody minds it wavering.
        major.push(debug.leftThumb, config.quality.minorBelowDeg, config.quality.majorAboveDeg)

        const fingers = mask === null ? null : shapedFingers(mask)
        const voicing = fingers === null ? null : (DENSITY_BY_MASK.get(fingers) ?? null)
        density.push(voicing, stabilityFrames)

        // A fist mutes and any recognised voicing unmutes. Anything else holds, so the
        // shapes passed through on the way in or out of a fist change nothing.
        gate.push(fingers === FIST ? false : voicing !== null ? true : null, stabilityFrames)

        tilt.push(tiltAmount(frame.left.landmarks, config), config.smoothing.alpha)
        volume.push(volumeLevel(frame.left.landmarks, config), config.smoothing.alpha)
      } else {
        debug.leftMask = null
        // Its readings are held rather than reset — a hand that drops out for a moment
        // should not slam the volume or the tilt to a default.
      }

      debug.rightLostFrames = rightLostFrames

      // Losing the right hand for longer than the tolerance fades the sound out. This is
      // a safety net for walking away, not the gate — the gate is the left fist.
      const rightPresent = rightLostFrames < handLostFrames

      last = {
        gate: rightPresent && (gate.value ?? true),
        degree: degree.value,
        quality: major.value ? 'major' : 'minor',
        density: density.value ?? 3,
        tilt: tilt.value,
        volume: volume.value,
      }
      return last
    },

    reset() {
      degree.reset()
      density.reset()
      gate.reset()
      major.reset()
      tilt.reset()
      volume.reset()
      rightLostFrames = 0
    },
  }
}
