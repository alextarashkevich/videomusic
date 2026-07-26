/**
 * Synthetic hands for tests.
 *
 * Generating landmarks rather than recording them is what makes the rotation- and
 * scale-invariance claims testable: the *same* gesture can be produced at any angle and
 * any distance from the camera, and the mask must come out identical every time.
 *
 * The hand is built in a local frame where the wrist sits at the origin and the middle
 * knuckle one unit above it — so hand scale is 1 by construction — then rotated, scaled
 * and moved into normalised image coordinates.
 */
import type { Landmark, Landmarks } from '../types'
import { LANDMARK } from './landmarks'

export type FingerStates = {
  thumb: boolean
  index: boolean
  middle: boolean
  ring: boolean
  pinky: boolean
}

export type HandOptions = {
  /** Degrees of tilt from vertical, positive clockwise on screen. */
  tilt?: number
  /** Multiplier on the whole hand — stands in for distance from the camera. */
  scale?: number
  /** Where the wrist lands in normalised image coordinates. */
  center?: { x: number; y: number }
}

type Vec = { x: number; y: number }

const KNUCKLES = {
  index: { x: -0.34, y: -0.92 },
  middle: { x: 0, y: -1 },
  ring: { x: 0.3, y: -0.95 },
  pinky: { x: 0.56, y: -0.86 },
} as const

// Thumb tip positions: out to the side, versus tucked across the palm.
const THUMB_TIP_EXTENDED = { x: -1.05, y: -0.62 }
const THUMB_TIP_FOLDED = { x: 0.02, y: -0.72 }

function unit(v: Vec): Vec {
  const length = Math.hypot(v.x, v.y)
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length }
}

function along(base: Vec, direction: Vec, distance: number): Vec {
  return { x: base.x + direction.x * distance, y: base.y + direction.y * distance }
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** An extended finger reaches outward; a folded one curls back so its tip ends up
 *  closer to the wrist than its middle joint. */
function fingerJoints(knuckle: Vec, extended: boolean): [Vec, Vec, Vec] {
  const direction = unit(knuckle)
  if (extended) {
    return [
      along(knuckle, direction, 0.32),
      along(knuckle, direction, 0.55),
      along(knuckle, direction, 0.75),
    ]
  }
  return [
    along(knuckle, direction, 0.3),
    along(knuckle, direction, 0.2),
    along(knuckle, direction, 0.05),
  ]
}

export function makeHand(fingers: FingerStates, options: HandOptions = {}): Landmarks {
  const { tilt = 0, scale = 0.25, center = { x: 0.5, y: 0.6 } } = options

  const points: Vec[] = new Array<Vec>(21).fill({ x: 0, y: 0 })
  points[LANDMARK.WRIST] = { x: 0, y: 0 }

  const thumbTip = fingers.thumb ? THUMB_TIP_EXTENDED : THUMB_TIP_FOLDED
  points[LANDMARK.THUMB_CMC] = lerp({ x: 0, y: 0 }, thumbTip, 0.3)
  points[LANDMARK.THUMB_MCP] = lerp({ x: 0, y: 0 }, thumbTip, 0.55)
  points[LANDMARK.THUMB_IP] = lerp({ x: 0, y: 0 }, thumbTip, 0.8)
  points[LANDMARK.THUMB_TIP] = thumbTip

  const hinged = [
    ['index', LANDMARK.INDEX_MCP, fingers.index],
    ['middle', LANDMARK.MIDDLE_MCP, fingers.middle],
    ['ring', LANDMARK.RING_MCP, fingers.ring],
    ['pinky', LANDMARK.PINKY_MCP, fingers.pinky],
  ] as const

  for (const [name, mcpIndex, extended] of hinged) {
    const knuckle = KNUCKLES[name]
    points[mcpIndex] = knuckle
    const [pip, dip, tip] = fingerJoints(knuckle, extended)
    points[mcpIndex + 1] = pip
    points[mcpIndex + 2] = dip
    points[mcpIndex + 3] = tip
  }

  const radians = (tilt * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  return points.map((point): Landmark => {
    // Rotate clockwise on screen, where y grows downward.
    const x = point.x * cos - point.y * sin
    const y = point.x * sin + point.y * cos
    return { x: center.x + x * scale, y: center.y + y * scale, z: 0 }
  })
}

export const GESTURES = {
  fist: { thumb: false, index: false, middle: false, ring: false, pinky: false },
  one: { thumb: false, index: true, middle: false, ring: false, pinky: false },
  two: { thumb: false, index: true, middle: true, ring: false, pinky: false },
  three: { thumb: false, index: true, middle: true, ring: true, pinky: false },
  four: { thumb: false, index: true, middle: true, ring: true, pinky: true },
  open: { thumb: true, index: true, middle: true, ring: true, pinky: true },
  koza: { thumb: false, index: true, middle: false, ring: false, pinky: true },
  kozaThumb: { thumb: true, index: true, middle: false, ring: false, pinky: true },
} as const satisfies Record<string, FingerStates>
