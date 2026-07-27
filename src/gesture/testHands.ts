/**
 * Synthetic hands for tests.
 *
 * Generating landmarks rather than recording them is what makes the rotation- and
 * scale-invariance claims testable: the *same* gesture can be produced at any angle and
 * any distance from the camera, and the mask must come out identical every time.
 *
 * The hand is built in a local frame where the wrist sits at the origin, the middle
 * knuckle one unit above it — so hand scale is 1 by construction — and +z points out of
 * the palm toward the camera. It is then turned, rolled, scaled and moved into normalised
 * image coordinates.
 *
 * The previous version of this model gave every finger the same length and only two
 * states, fully out or fully in. Both were wrong in the same direction: they made a single
 * palm-relative threshold look far safer than it is. See FINGER_LENGTH and Curl below.
 */
import type { Landmark, Landmarks } from '../types'
import { LANDMARK } from './landmarks'

/**
 * How far a finger is folded: 0 straight, 1 closed into a fist, and everything between.
 *
 * The in-between is not decoration. A коза does not fold the middle and ring fingers
 * away — the thumb pins them roughly two thirds down, and *that* is the shape recognition
 * was getting wrong. A model with only "out" and "in" cannot express the case that breaks.
 *
 * A triple gives each joint its own share — base, middle, tip — because *where* a finger
 * bends matters as much as how far. `[1, 0.15, 0.15]` is a finger swung down at its base
 * while staying straight along its length, which is how many people drop a pinky, and it
 * defeats any measurement that only asks how straight a finger is: it is perfectly straight.
 */
export type Curl = number | readonly [number, number, number]

export type FingerStates = {
  thumb: boolean
  index: Curl
  middle: Curl
  ring: Curl
  pinky: Curl
}

export type HandOptions = {
  /** Degrees of roll in the plane of the screen, positive clockwise. */
  tilt?: number
  /**
   * Degrees the hand is turned away from the camera, about the horizontal axis.
   *
   * This is the rotation that broke flat measurement: it leaves 3D distances untouched
   * while squashing everything vertically in the projected image, so extended fingers
   * measure short and read as folded.
   */
  pitch?: number
  /** Multiplier on the whole hand — stands in for distance from the camera. */
  scale?: number
  /** Where the wrist lands in normalised image coordinates. */
  center?: { x: number; y: number }
}

type Vec = { x: number; y: number; z: number }

/** Knuckle positions in the palm plane. The middle knuckle is one unit from the wrist,
 *  which is what makes hand scale 1. */
const KNUCKLES = {
  index: { x: -0.34, y: -0.92, z: 0 },
  middle: { x: 0, y: -1, z: 0 },
  ring: { x: 0.3, y: -0.95, z: 0 },
  pinky: { x: 0.56, y: -0.86, z: 0 },
} as const

/**
 * Finger lengths as a fraction of palm length.
 *
 * These are deliberately unequal, and it is the single most important number in this file.
 * The pinky is a quarter shorter than the middle finger, so a threshold expressed in palm
 * widths sits much closer to the boundary for the pinky than for anything else — which is
 * why коза, the one gesture that depends on the pinky, was the one that failed. Checked
 * against Alex's camera: an open palm reads 0.78 / 0.96 / 0.90 / 0.69, a pinky-to-middle
 * ratio of 0.72. These give 0.73.
 */
const FINGER_LENGTH = {
  index: 0.75,
  middle: 0.82,
  ring: 0.76,
  pinky: 0.6,
} as const

/** Proximal, middle and distal phalanx, as fractions of the finger's own length. */
const PHALANX = [0.45, 0.3, 0.25] as const

/** Flexion at each of the three joints in a closed fist, degrees. Curl scales all three. */
const FULL_FLEXION = [90, 110, 80] as const

/** Base of the thumb, and where its tip lands swung out versus tucked across the palm.
 *  The tucked tip sits slightly out of the palm plane because it lies *on* the folded
 *  fingers, not flat against the palm. */
const THUMB_CMC: Vec = { x: -0.3, y: -0.18, z: 0 }
const THUMB_TIP_EXTENDED: Vec = { x: -0.95, y: -0.5, z: 0 }
const THUMB_TIP_FOLDED: Vec = { x: -0.02, y: -0.6, z: -0.16 }

function add(a: Vec, b: Vec, distance: number): Vec {
  return { x: a.x + b.x * distance, y: a.y + b.y * distance, z: a.z + b.z * distance }
}

function normalize(v: Vec): Vec {
  const length = Math.hypot(v.x, v.y, v.z)
  return length === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / length, y: v.y / length, z: v.z / length }
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
}

/** Rodrigues rotation of `v` about the unit axis `a`. */
function rotate(v: Vec, a: Vec, radians: number): Vec {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dot = a.x * v.x + a.y * v.y + a.z * v.z
  const cross = {
    x: a.y * v.z - a.z * v.y,
    y: a.z * v.x - a.x * v.z,
    z: a.x * v.y - a.y * v.x,
  }
  return {
    x: v.x * cos + cross.x * sin + a.x * dot * (1 - cos),
    y: v.y * cos + cross.y * sin + a.y * dot * (1 - cos),
    z: v.z * cos + cross.z * sin + a.z * dot * (1 - cos),
  }
}

/**
 * The three joints of one finger, as a hinged chain.
 *
 * Each joint adds its share of the flexion, so the finger sweeps a real arc instead of
 * sliding along its own line — which is what the old model did, and no hand moves that
 * way. The knuckle hinges about an axis lying in the palm and square to the finger, so
 * curling carries the tip *out of the palm plane*, toward the camera when the palm faces
 * it. That is also what makes the middle joint end up further from the knuckle than the
 * tip does on a closed hand.
 */
function fingerChain(knuckle: Vec, length: number, curl: Curl): [Vec, Vec, Vec] {
  const straight = normalize(knuckle)
  const hinge = normalize({ x: -straight.y, y: straight.x, z: 0 })
  const perJoint = typeof curl === 'number' ? ([curl, curl, curl] as const) : curl

  const joints: Vec[] = []
  let point = knuckle
  let turned = 0

  for (let joint = 0; joint < 3; joint++) {
    turned += (FULL_FLEXION[joint]! * perJoint[joint]! * Math.PI) / 180
    point = add(point, rotate(straight, hinge, turned), length * PHALANX[joint]!)
    joints.push(point)
  }

  return joints as [Vec, Vec, Vec]
}

export function makeHand(fingers: FingerStates, options: HandOptions = {}): Landmarks {
  const { tilt = 0, pitch = 0, scale = 0.25, center = { x: 0.5, y: 0.6 } } = options

  const points: Vec[] = new Array<Vec>(21).fill({ x: 0, y: 0, z: 0 })
  points[LANDMARK.WRIST] = { x: 0, y: 0, z: 0 }

  // The thumb bends a little rather than running dead straight, so the joints between the
  // base and the tip are not collinear — a classifier reading all 21 points would
  // otherwise be learning from a hand no camera ever sees.
  const thumbTip = fingers.thumb ? THUMB_TIP_EXTENDED : THUMB_TIP_FOLDED
  const bend: Vec = { x: 0, y: 0, z: -0.05 }
  points[LANDMARK.THUMB_CMC] = THUMB_CMC
  points[LANDMARK.THUMB_MCP] = add(lerp(THUMB_CMC, thumbTip, 0.4), bend, 1)
  points[LANDMARK.THUMB_IP] = add(lerp(THUMB_CMC, thumbTip, 0.72), bend, 0.6)
  points[LANDMARK.THUMB_TIP] = thumbTip

  const hinged = [
    ['index', LANDMARK.INDEX_MCP, fingers.index],
    ['middle', LANDMARK.MIDDLE_MCP, fingers.middle],
    ['ring', LANDMARK.RING_MCP, fingers.ring],
    ['pinky', LANDMARK.PINKY_MCP, fingers.pinky],
  ] as const

  for (const [name, mcpIndex, curl] of hinged) {
    const knuckle = KNUCKLES[name]
    points[mcpIndex] = knuckle
    const [pip, dip, tip] = fingerChain(knuckle, FINGER_LENGTH[name], curl)
    points[mcpIndex + 1] = pip
    points[mcpIndex + 2] = dip
    points[mcpIndex + 3] = tip
  }

  const roll = (tilt * Math.PI) / 180
  const cosRoll = Math.cos(roll)
  const sinRoll = Math.sin(roll)

  const lean = (pitch * Math.PI) / 180
  const cosLean = Math.cos(lean)
  const sinLean = Math.sin(lean)

  return points.map((point): Landmark => {
    // Turn away from the camera first — a rotation about the horizontal axis. 3D lengths
    // survive it untouched while the projected image squashes vertically.
    const leanedY = point.y * cosLean - point.z * sinLean
    const leanedZ = point.y * sinLean + point.z * cosLean

    // Then roll in the plane of the screen, where y grows downward.
    const x = point.x * cosRoll - leanedY * sinRoll
    const y = point.x * sinRoll + leanedY * cosRoll

    return { x: center.x + x * scale, y: center.y + y * scale, z: leanedZ * scale }
  })
}

/** The same hand as the camera would flatten it — depth thrown away. */
export function flatten(landmarks: Landmarks): Landmarks {
  return landmarks.map((point) => ({ x: point.x, y: point.y, z: 0 }))
}

/**
 * The same hand as a tracker would report it: not quite right, and differently not quite
 * right every frame.
 *
 * A generated hand is exact, and a test built only on exact hands proves less than it
 * appears to — a measurement can be perfectly invariant on paper and still fall apart on a
 * camera, which is roughly the story of this file's previous version. `amount` is a
 * fraction of palm length; MediaPipe's landmarks wander by a couple of percent frame to
 * frame, more in depth than across.
 *
 * Seeded rather than random so a failure can be looked at twice.
 */
export function jitter(landmarks: Landmarks, amount: number, seed: number): Landmarks {
  let state = seed >>> 0

  // Park–Miller. Any small deterministic generator would do; this one is four characters
  // of arithmetic and has no state to get wrong.
  const next = (): number => {
    state = (state * 48271) % 2147483647
    return state / 2147483647 - 0.5
  }

  const scale = handScaleOf(landmarks)

  return landmarks.map((point) => ({
    x: point.x + next() * amount * scale,
    y: point.y + next() * amount * scale,
    // Depth is the noisiest thing a hand tracker produces, by some way.
    z: point.z + next() * amount * scale * 2.5,
  }))
}

function handScaleOf(landmarks: Landmarks): number {
  const wrist = landmarks[LANDMARK.WRIST]
  const middle = landmarks[LANDMARK.MIDDLE_MCP]
  if (wrist === undefined || middle === undefined) return 0
  return Math.hypot(middle.x - wrist.x, middle.y - wrist.y, middle.z - wrist.z)
}

/** The eight shapes the instrument plays, in their textbook form. */
export const GESTURES = {
  fist: { thumb: false, index: 1, middle: 1, ring: 1, pinky: 1 },
  one: { thumb: false, index: 0, middle: 1, ring: 1, pinky: 1 },
  two: { thumb: false, index: 0, middle: 0, ring: 1, pinky: 1 },
  three: { thumb: false, index: 0, middle: 0, ring: 0, pinky: 1 },
  four: { thumb: false, index: 0, middle: 0, ring: 0, pinky: 0 },
  open: { thumb: true, index: 0, middle: 0, ring: 0, pinky: 0 },
  koza: { thumb: false, index: 0, middle: 1, ring: 1, pinky: 0 },
  kozaThumb: { thumb: true, index: 0, middle: 1, ring: 1, pinky: 0 },
} as const satisfies Record<string, FingerStates>

/**
 * The same gestures as people actually hold them, which is where recognition failed.
 *
 * Nobody folds the middle and ring fingers all the way down to make a коза — the thumb
 * pins them about two thirds of the way, and a two-thirds-folded finger reaches far
 * enough from its knuckle to pass a palm-relative threshold. That is the whole bug, and
 * these fixtures are what hold the fix honest.
 *
 * They carry the same masks as their textbook counterparts on purpose, so they are kept
 * out of GESTURES — the "every gesture has a distinct mask" test must still mean something.
 */
export const HARD_GESTURES = {
  kozaPinned: { thumb: false, index: 0, middle: 0.6, ring: 0.6, pinky: 0 },
  kozaThumbPinned: { thumb: true, index: 0, middle: 0.6, ring: 0.6, pinky: 0 },
  twoPinned: { thumb: false, index: 0, middle: 0, ring: 0.6, pinky: 0.6 },
  onePinned: { thumb: false, index: 0, middle: 0.6, ring: 0.6, pinky: 0.6 },
  /**
   * Three fingers, with the pinky dropped at its base and straight along its length.
   *
   * This is how the pinky actually comes down for a lot of people, and it is invisible to
   * any measurement that asks how *straight* a finger is — it is completely straight. It
   * read 0.88 against a 0.85 threshold on Alex's camera, so three fingers came out as four.
   */
  threeStraightPinky: { thumb: false, index: 0, middle: 0, ring: 0, pinky: [1, 0.15, 0.15] },
  twoStraightRest: {
    thumb: false,
    index: 0,
    middle: 0,
    ring: [1, 0.15, 0.15],
    pinky: [1, 0.15, 0.15],
  },
  kozaStraightRest: {
    thumb: false,
    index: 0,
    middle: [1, 0.15, 0.15],
    ring: [1, 0.15, 0.15],
    pinky: 0,
  },
} as const satisfies Record<string, FingerStates>

/** What each hard fixture must be recognised as. */
export const HARD_GESTURE_TWIN: Record<keyof typeof HARD_GESTURES, keyof typeof GESTURES> = {
  kozaPinned: 'koza',
  kozaThumbPinned: 'kozaThumb',
  twoPinned: 'two',
  onePinned: 'one',
  threeStraightPinky: 'three',
  twoStraightRest: 'two',
  kozaStraightRest: 'koza',
}
