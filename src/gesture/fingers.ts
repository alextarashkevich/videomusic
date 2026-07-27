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
 * How far one finger reaches *outward*: 1 fully extended, 0 folded away, negative in a fist.
 *
 * How far the tip has travelled from its knuckle **in the direction that knuckle points**,
 * divided by the length of that finger's own bones. Two ideas, and both are load-bearing:
 *
 * - **Along the knuckle's own line**, not just any direction. This is the correction to the
 *   version before it, which measured the plain distance from knuckle to tip — how *straight*
 *   the finger is. Those are not the same question. A finger folded at its base while staying
 *   straight along its length is still straight: it read 0.88 against a 0.85 threshold and
 *   counted as up, which is how three fingers came out as four. Projecting onto the knuckle's
 *   direction sees where the finger is pointing, and a finger folded at the base points across
 *   the palm rather than out of it, so it lands near zero.
 * - **Divided by the finger's own bones**, not by palm width. A pinky is a quarter shorter
 *   than a middle finger, so a palm-relative threshold sat two and a half times closer to the
 *   line for the pinky — which is why коза, the one gesture that needs the pinky, was the one
 *   that failed.
 *
 * Together they leave every finger reading about 1.0 when it is out and about 0 when it is
 * not, whichever finger it is and however it was folded.
 */
export function fingerExtension(
  landmarks: Landmarks,
  finger: (typeof HINGED_FINGERS)[number],
): number {
  const wrist = landmarks[LANDMARK.WRIST]
  const mcp = landmarks[finger.mcp]
  const pip = landmarks[finger.pip]
  const dip = landmarks[finger.dip]
  const tip = landmarks[finger.tip]
  if (wrist === undefined || mcp === undefined) return 0
  if (pip === undefined || dip === undefined || tip === undefined) return 0

  const bones = distance(mcp, pip) + distance(pip, dip) + distance(dip, tip)
  if (bones === 0) return 0

  // Wrist to this knuckle: the direction this particular finger points when it is out.
  // Per finger rather than one axis up the palm, because fingers splay — a shared axis
  // would quietly penalise the outer two for pointing outward, which is what they do.
  const ox = mcp.x - wrist.x
  const oy = mcp.y - wrist.y
  const oz = mcp.z - wrist.z
  const outward = Math.hypot(ox, oy, oz)
  if (outward === 0) return 0

  const reach =
    ((tip.x - mcp.x) * ox + (tip.y - mcp.y) * oy + (tip.z - mcp.z) * oz) / outward

  return reach / bones
}

/**
 * The raw numbers the mask is derived from, exposed so the readout can show them.
 *
 * Four fingers report extension, 0 to 1. The thumb reports its angle in degrees, because
 * it does not curl like the others. Holding up one gesture and then another and reading
 * these tells you exactly where a threshold belongs, which beats guessing at it.
 */
export function fingerReach(landmarks: Landmarks): Record<string, number> {
  const reach: Record<string, number> = {}

  for (const finger of HINGED_FINGERS) {
    reach[finger.name] = fingerExtension(landmarks, finger)
  }

  reach['thumb'] = thumbAngle(landmarks)
  return reach
}

/**
 * How far the thumb is swung away from the line of the palm, in degrees.
 *
 * The test this replaced measured how far the thumb tip sat from the pinky knuckle, which
 * fails in two ways: it moves with how spread the other fingers are, and it shrinks under
 * perspective. An angle between two directions on the same hand does neither — it is
 * unchanged by rotation, by hand size, and by what the rest of the fingers are doing.
 *
 * Measuring the swing from the thumb's own base joint instead of from the wrist was tried,
 * on the theory that it would not depend on the wrist landmark, the noisiest point on the
 * hand. It measured worse: a 26° gap between out and tucked against this one's 47°, on the
 * same modelled hand. So the wrist stays. What will really settle the thumb is calibration,
 * not a better angle.
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
 * Everything is measured within the hand itself, so the result survives rotation, hand
 * size and distance from the camera.
 *
 * A finger counts as extended when it is straight enough — see `fingerExtension`, which is
 * where the interesting reasoning lives. The thumb is judged by angle instead, because it
 * swings rather than curls.
 *
 * Feed this the *world* landmarks. In the flat image a hand turned away from the camera
 * has its fingers foreshortened, and they read as folded when they are not.
 */
export function fingerMask(landmarks: Landmarks, config: Config): FingerMask {
  if (handScale(landmarks) === 0) return 0

  let mask = 0

  for (const finger of HINGED_FINGERS) {
    if (fingerExtension(landmarks, finger) > config.gesture.extendedProjection) {
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
