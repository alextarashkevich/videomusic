import type { Config } from '../config'
import type { FingerMask, Landmark, Landmarks } from '../types'
import { FINGER_BIT, HINGED_FINGERS, LANDMARK } from './landmarks'

/**
 * Distance in three dimensions.
 *
 * These measurements run on MediaPipe's world landmarks, where depth is real. Measuring
 * shape in the flat image instead means a hand turned away from the camera has its
 * fingers foreshortened — a fully extended finger projects short and reads as folded,
 * which is precisely why tilting the hand broke recognition.
 */
function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Angle between two points as seen from a third, in degrees. */
function angleAt(origin: Landmark, a: Landmark, b: Landmark): number {
  const ax = a.x - origin.x
  const ay = a.y - origin.y
  const az = a.z - origin.z
  const bx = b.x - origin.x
  const by = b.y - origin.y
  const bz = b.z - origin.z

  const lengths = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)
  if (lengths === 0) return 0

  const cosine = (ax * bx + ay * by + az * bz) / lengths
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI
}

/**
 * Wrist to middle knuckle — the reference length every other measurement is divided by.
 * Working in these units is what makes thresholds independent of hand size.
 */
export function handScale(landmarks: Landmarks): number {
  const wrist = landmarks[LANDMARK.WRIST]
  const middle = landmarks[LANDMARK.MIDDLE_MCP]
  if (wrist === undefined || middle === undefined) return 0
  return distance(wrist, middle)
}

/**
 * The raw numbers the mask is derived from, exposed so the readout can show them.
 *
 * Four fingers report reach — how far the tip has come from its own knuckle, in hand
 * widths. The thumb reports its angle in degrees, because it does not curl like the
 * others. Holding up one gesture and then another and reading these tells you exactly
 * where a threshold belongs, which beats guessing at it.
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

  reach['thumb'] = thumbAngle(landmarks)
  return reach
}

/**
 * How far the thumb is swung away from the line of the palm, in degrees.
 *
 * The old test measured how far the thumb tip sat from the pinky knuckle, which fails in
 * two ways: it moves with how spread the other fingers are, and it shrinks under
 * perspective. An angle between two directions on the same hand does neither — it is
 * unchanged by rotation, by hand size, and by what the rest of the fingers are doing.
 */
export function thumbAngle(landmarks: Landmarks): number {
  const wrist = landmarks[LANDMARK.WRIST]
  const middle = landmarks[LANDMARK.MIDDLE_MCP]
  const thumbTip = landmarks[LANDMARK.THUMB_TIP]
  if (wrist === undefined || middle === undefined || thumbTip === undefined) return 0

  return angleAt(wrist, middle, thumbTip)
}

/**
 * Works out which fingers are extended, as a 5-bit mask.
 *
 * Everything is measured as distances and angles within the hand itself, so the result
 * survives rotation, hand size and distance from the camera.
 *
 * A finger counts as extended when its tip has reached far enough from *its own knuckle*.
 * Comparing against the middle joint instead is tempting and worse: curling a finger
 * pushes that joint outward, so it chases the tip and narrows the gap between open and
 * closed to almost nothing — which is what made one finger and two hard to tell apart.
 * The knuckle is fixed to the palm and does not move at all.
 *
 * Feed this the *world* landmarks. In the flat image a hand turned away from the camera
 * has its fingers foreshortened, and they read as folded when they are not.
 */
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

  if (thumbAngle(landmarks) > config.gesture.thumbAngleDeg) {
    mask |= FINGER_BIT.THUMB
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
