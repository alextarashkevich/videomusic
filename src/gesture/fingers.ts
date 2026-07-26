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
 * hand rotates, and rotation is a control here rather than an accident. So everything is
 * measured as distances within the hand, divided by the wrist-to-middle-knuckle span,
 * which survives both rotation and distance from the camera.
 *
 * A finger counts as extended when its tip has reached far enough from *its own knuckle*.
 * Comparing against the middle joint instead is tempting and worse: curling a finger
 * pushes that joint outward, so it chases the tip and narrows the gap between open and
 * closed to almost nothing — which is what made one finger and two hard to tell apart.
 * The knuckle is fixed to the palm and does not move at all.
 *
 * The thumb folds across a different axis than the other four, so it gets its own test:
 * how far its tip sits from the pinky knuckle. Tucked across the palm that distance
 * collapses; held out to the side it roughly doubles.
 */
/**
 * How far each fingertip has reached away from its own knuckle, in hand widths.
 *
 * This is the raw measurement the mask is derived from, exposed so the readout can show
 * it: holding up one finger and then two and reading the numbers tells you exactly where
 * the threshold belongs, which is worth more than any amount of guessing at it.
 */
export function fingerReach(landmarks: Landmarks): Record<string, number> {
  const scale = handScale(landmarks)
  const reach: Record<string, number> = {}
  if (scale === 0) return reach

  for (const finger of HINGED_FINGERS) {
    const tip = landmarks[finger.tip]
    const mcp = landmarks[finger.mcp]
    if (tip === undefined || mcp === undefined) continue
    reach[finger.name] = distance(mcp, tip) / scale
  }

  const thumbTip = landmarks[LANDMARK.THUMB_TIP]
  const pinkyMcp = landmarks[LANDMARK.PINKY_MCP]
  if (thumbTip !== undefined && pinkyMcp !== undefined) {
    reach['thumb'] = distance(thumbTip, pinkyMcp) / scale
  }

  return reach
}

export function fingerMask(landmarks: Landmarks, config: Config): FingerMask {
  const scale = handScale(landmarks)
  if (scale === 0) return 0

  let mask = 0

  for (const finger of HINGED_FINGERS) {
    const tip = landmarks[finger.tip]
    const mcp = landmarks[finger.mcp]
    if (tip === undefined || mcp === undefined) continue
    if (distance(mcp, tip) > scale * config.gesture.extendedReach) {
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
