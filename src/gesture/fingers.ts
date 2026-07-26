import type { Config } from '../config'
import type { FingerMask, Landmarks } from '../types'
import { FINGER_BIT, HINGED_FINGERS, LANDMARK } from './landmarks'

type Point = { x: number; y: number }

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Wrist to middle knuckle — the reference length every other measurement is divided by.
 * Working in these units is what makes thresholds independent of how far the hand is
 * from the camera.
 */
export function handScale(landmarks: Landmarks): number {
  const wrist = landmarks[LANDMARK.WRIST]
  const middle = landmarks[LANDMARK.MIDDLE_MCP]
  if (wrist === undefined || middle === undefined) return 0
  return distance(wrist, middle)
}

/**
 * Works out which fingers are extended, as a 5-bit mask.
 *
 * The obvious test — is the fingertip above the knuckle — falls apart the moment the
 * hand rotates, and rotation is a control here rather than an accident. So a finger is
 * judged extended when its tip has moved further from the wrist than its middle joint
 * has. That comparison depends only on the hand's own geometry, so it survives both
 * rotation and distance from the camera.
 *
 * The thumb folds across a different axis than the other four, so it gets its own test:
 * how far its tip sits from the pinky knuckle. Tucked across the palm that distance
 * collapses; held out to the side it roughly doubles.
 */
export function fingerMask(landmarks: Landmarks, config: Config): FingerMask {
  const wrist = landmarks[LANDMARK.WRIST]
  const scale = handScale(landmarks)
  if (wrist === undefined || scale === 0) return 0

  let mask = 0

  for (const finger of HINGED_FINGERS) {
    const tip = landmarks[finger.tip]
    const pip = landmarks[finger.pip]
    if (tip === undefined || pip === undefined) continue
    if (distance(wrist, tip) > distance(wrist, pip) * config.gesture.extendedRatio) {
      mask |= finger.bit
    }
  }

  const thumbTip = landmarks[LANDMARK.THUMB_TIP]
  const pinkyMcp = landmarks[LANDMARK.PINKY_MCP]
  if (thumbTip !== undefined && pinkyMcp !== undefined) {
    if (distance(thumbTip, pinkyMcp) > scale * config.gesture.thumbSpread) {
      mask |= FINGER_BIT.THUMB
    }
  }

  return mask
}

/** Renders a mask as `T-IMRP` style text for the debug HUD. */
export function describeMask(mask: FingerMask): string {
  const letters = [
    [FINGER_BIT.THUMB, 'T'],
    [FINGER_BIT.INDEX, 'I'],
    [FINGER_BIT.MIDDLE, 'M'],
    [FINGER_BIT.RING, 'R'],
    [FINGER_BIT.PINKY, 'P'],
  ] as const

  return letters.map(([bit, letter]) => ((mask & bit) !== 0 ? letter : '·')).join('')
}
