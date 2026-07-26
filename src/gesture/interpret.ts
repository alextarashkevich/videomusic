import type { Config } from '../config'
import type { Density, FingerMask, HandFrame, PerformanceState, ScaleDegree } from '../types'
import { distortionAmount, tiltMagnitude, volumeLevel } from './angles'
import { fingerMask } from './fingers'
import { FINGER_BIT } from './landmarks'
import { createLatch, createSmoother, createStabilizer } from './stabilizer'

const { THUMB, INDEX, MIDDLE, RING, PINKY } = FINGER_BIT

/**
 * Right hand: which fingers are up picks the degree of the scale.
 *
 * Keyed by identity rather than count, which is the only way "коза" (index + pinky) and
 * "two fingers" (index + middle) can be told apart — both are two fingers.
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

/** Left hand: how thickly the chord is voiced. */
export const DENSITY_BY_MASK: ReadonlyMap<FingerMask, Density> = new Map([
  [INDEX, 1],
  [INDEX | MIDDLE, 2],
  [INDEX | MIDDLE | RING, 3],
] as [FingerMask, Density][])

/** A closed left hand is the mute. */
export const FIST: FingerMask = 0

/** Everything the HUD and tuning panel need to show why the instrument is doing what it
 *  is doing. Not used to make sound. */
export type InterpreterDebug = {
  rightMask: FingerMask | null
  leftMask: FingerMask | null
  rightTilt: number
  leftTilt: number
  rightLostFrames: number
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
  const minor = createLatch()
  const distortion = createSmoother(0)
  const volume = createSmoother(0.7)

  let rightLostFrames = 0
  let last: PerformanceState = {
    gate: true,
    degree: null,
    quality: 'major',
    density: 3,
    distortion: 0,
    volume: 0.7,
  }

  const debug: InterpreterDebug = {
    rightMask: null,
    leftMask: null,
    rightTilt: 0,
    leftTilt: 0,
    rightLostFrames: 0,
  }

  return {
    debug,

    update(frame, fresh = true) {
      if (!fresh) return last

      const { stabilityFrames, handLostFrames } = config.gesture

      if (frame.right !== null) {
        const mask = fingerMask(frame.right.landmarks, config)
        debug.rightMask = mask
        debug.rightTilt = tiltMagnitude(frame.right.landmarks)

        // An unrecognised shape yields null, which holds the last degree instead of
        // committing a stray one. This is what makes rearranging fingers silent: the
        // in-between shapes simply are not in the table.
        degree.push(DEGREE_BY_MASK.get(mask) ?? null, stabilityFrames)
        minor.push(debug.rightTilt, config.quality.majorBelowDeg, config.quality.minorAboveDeg)

        rightLostFrames = 0
      } else {
        debug.rightMask = null
        rightLostFrames = Math.min(rightLostFrames + 1, handLostFrames)
      }

      if (frame.left !== null) {
        const mask = fingerMask(frame.left.landmarks, config)
        debug.leftMask = mask
        debug.leftTilt = tiltMagnitude(frame.left.landmarks)

        const voicing = DENSITY_BY_MASK.get(mask) ?? null
        density.push(voicing, stabilityFrames)

        // A fist mutes and any recognised voicing unmutes. Anything else holds, so the
        // shapes passed through on the way in or out of a fist change nothing.
        gate.push(mask === FIST ? false : voicing !== null ? true : null, stabilityFrames)

        distortion.push(distortionAmount(frame.left.landmarks, config), config.smoothing.alpha)
        volume.push(volumeLevel(frame.left.landmarks, config), config.smoothing.alpha)
      } else {
        debug.leftMask = null
        // Its readings are held rather than reset — a hand that drops out for a moment
        // should not slam the volume or distortion to a default.
      }

      debug.rightLostFrames = rightLostFrames

      // Losing the right hand for longer than the tolerance fades the sound out. This is
      // a safety net for walking away, not the gate — the gate is the left fist.
      const rightPresent = rightLostFrames < handLostFrames

      last = {
        gate: rightPresent && (gate.value ?? true),
        degree: degree.value,
        quality: minor.value ? 'minor' : 'major',
        density: density.value ?? 3,
        distortion: distortion.value,
        volume: volume.value,
      }
      return last
    },

    reset() {
      degree.reset()
      density.reset()
      gate.reset()
      minor.reset()
      distortion.reset()
      volume.reset()
      rightLostFrames = 0
    },
  }
}
