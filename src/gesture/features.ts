/**
 * Turning a hand into a list of numbers that says only what shape it is.
 *
 * Every landmark is re-expressed in a frame built from the hand itself — across the
 * knuckles, up the palm, out through it — and divided by the palm's own length. What
 * survives is shape. What is thrown away is where the hand is in frame, how far it is from
 * the camera, how big it is, and, most importantly, **which way it is turned**.
 *
 * That last one is the point. The instrument asks you to tilt the chord hand to reach
 * minor, so every gesture has to be recognised while it is rotated — and a tilted коза was
 * exactly what it could not read. Rules could be written to survive rotation one at a time,
 * and were; a classifier fed these numbers gets it for free, because a tilted коза and an
 * upright коза produce the same vector.
 */
import type { Landmarks } from '../types'
import { LANDMARK } from './landmarks'

type Vec = { x: number; y: number; z: number }

/** 20 landmarks — the wrist is dropped, being the origin — times three axes. */
export const FEATURE_LENGTH = 60

function subtract(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec, b: Vec): Vec {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function normalize(v: Vec): Vec | null {
  const length = Math.hypot(v.x, v.y, v.z)
  if (length < 1e-9) return null
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

/**
 * The hand's own set of axes, or null if the landmarks are too degenerate to build one.
 *
 * `up` runs the palm, `across` runs the knuckles square to it, and `normal` comes out
 * through the palm. All three are anatomical, so they turn with the hand.
 */
function handFrame(landmarks: Landmarks): { up: Vec; across: Vec; normal: Vec; scale: number } | null {
  const wrist = landmarks[LANDMARK.WRIST]
  const middle = landmarks[LANDMARK.MIDDLE_MCP]
  const index = landmarks[LANDMARK.INDEX_MCP]
  const pinky = landmarks[LANDMARK.PINKY_MCP]
  if (wrist === undefined || middle === undefined || index === undefined || pinky === undefined) {
    return null
  }

  const alongPalm = subtract(middle, wrist)
  const scale = Math.hypot(alongPalm.x, alongPalm.y, alongPalm.z)
  const up = normalize(alongPalm)
  if (up === null || scale < 1e-9) return null

  // Squared off against `up` rather than used raw: the knuckle line is not quite
  // perpendicular to the palm axis on a real hand, and a frame whose axes are not at right
  // angles quietly leaks rotation back into the numbers.
  const knuckles = subtract(index, pinky)
  const projection = dot(knuckles, up)
  const across = normalize({
    x: knuckles.x - up.x * projection,
    y: knuckles.y - up.y * projection,
    z: knuckles.z - up.z * projection,
  })
  if (across === null) return null

  return { up, across, normal: cross(up, across), scale }
}

/**
 * The 60 numbers describing one hand's shape.
 *
 * Note that these are chiral: a left hand and a right hand making the same gesture do not
 * produce the same vector, because a left hand is a reflection of a right one and a
 * reflection flips the handedness of the frame built from it. Rather than correct for that
 * — which would mean trusting the tracker's Left/Right label, and the comment in
 * vision/handTracker.ts explains why that is not something to build on — each hand is
 * calibrated for the gestures it actually plays. The chord hand learns seven shapes and the
 * shaping hand learns four, which is fewer captures than mirroring one model would have
 * saved, and gives each of them an easier question to answer.
 */
export function handFeatures(landmarks: Landmarks): number[] | null {
  const frame = handFrame(landmarks)
  if (frame === null) return null

  const wrist = landmarks[LANDMARK.WRIST]
  if (wrist === undefined) return null

  const { up, across, normal, scale } = frame
  const features: number[] = []

  for (let index = 1; index <= 20; index++) {
    const point = landmarks[index]
    if (point === undefined) return null

    const offset = subtract(point, wrist)
    features.push(dot(offset, across) / scale, dot(offset, up) / scale, dot(offset, normal) / scale)
  }

  return features
}

/** Straight-line distance between two feature vectors. */
export function featureDistance(a: readonly number[], b: readonly number[]): number {
  let sum = 0
  for (let index = 0; index < a.length; index++) {
    const difference = a[index]! - (b[index] ?? 0)
    sum += difference * difference
  }
  return Math.sqrt(sum)
}
