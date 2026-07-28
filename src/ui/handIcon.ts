/**
 * A hand, drawn from a finger mask.
 *
 * One drawing routine rather than a folder of pictures, because the instrument already
 * describes every gesture as a mask — so the diagram is generated from the same fact the
 * recogniser is matching against and cannot drift away from it. Adding a gesture to
 * `DEGREE_BY_MASK` gives you its picture for free.
 *
 * Four places show hands: the chord display, the tutorial, the song guide and the song
 * writer. They all come through here so a gesture looks the same wherever it appears — a
 * player learning a shape from the tutorial should recognise it in the song list without
 * having to translate.
 *
 * Everything is built from **capsules**: a line with a round cap at each end. Rounded
 * rectangles were tried first and the thumb had to be rotated into place, which swung its
 * corner outside the viewBox and clipped it. A capsule is positioned by its two endpoints,
 * so an angled finger needs no rotation and its extent is arithmetic rather than a hope.
 */
import { FINGER_BIT } from '../gesture/landmarks'
import type { FingerMask } from '../types'

const { THUMB, INDEX, MIDDLE, RING, PINKY } = FINGER_BIT

const SVG_NS = 'http://www.w3.org/2000/svg'

const WIDTH = 110
const HEIGHT = 128

/** Palm, and the line the fingers grow out of. Fingers are drawn first and the palm over
 *  them, so their roots disappear behind it instead of showing as seams. */
const PALM = { x: 26, y: 60, width: 60, height: 54, radius: 18 }
const KNUCKLE_Y = 72

/** Thickness of every finger. One number, because fingers on a diagram that differ in width
 *  read as a deformity rather than as detail. */
const THICKNESS = 13

/**
 * Each finger's column, how far it reaches when it is up, and where it sits when it is not.
 *
 * The extended heights are the real proportions — middle tallest, then index, ring, pinky.
 * A diagram where all four match reads as a rake, and it makes коза, the one gesture that
 * turns on the pinky, hard to tell from two fingers at a glance.
 *
 * Folded stops just above the palm's own edge, so a folded finger is a knuckle showing over
 * the top of a fist rather than a stub floating above it.
 */
const FINGERS = [
  { bit: INDEX, x: 34, up: 32, down: 64 },
  { bit: MIDDLE, x: 49, up: 22, down: 62 },
  { bit: RING, x: 64, up: 30, down: 64 },
  { bit: PINKY, x: 78, up: 44, down: 68 },
] as const

/** Swung clear of the palm, and folded across it. Both stay inside the viewBox with the cap
 *  radius allowed for, which the rotated rectangle these replaced did not. */
const THUMB_OUT = { x1: 32, y1: 100, x2: 14, y2: 66 } as const
const THUMB_IN = { x1: 35, y1: 97, x2: 67, y2: 93 } as const

/**
 * Which hand this is. The chord hand is the player's right and the shaping hand their left,
 * so they are drawn as a mirrored pair.
 *
 * **Which way round is settled from a camera frame, not from reasoning about anatomy.** It
 * was got wrong twice by arguing about chirality, so here is the observation instead: with
 * the feed flipped the way it is, the player sees both palms facing them and both thumbs
 * pointing *inward*, toward the middle of the picture. The chord hand sits on the right of
 * the screen, so its thumb is on its own left — which is the drawing unmirrored. The shaping
 * hand sits on the left with its thumb on its right, so that one is mirrored.
 *
 * See `HAND_ORDER` for the other half of the same fact.
 */
export type HandRole = 'chord' | 'shaping'

const MIRRORED: Record<HandRole, boolean> = { chord: false, shaping: true }

/**
 * Where each hand belongs when both are shown: shaping on the left, chord on the right.
 *
 * The same fact as the mirroring, and just as easy to get backwards. The camera picture is
 * flipped, so the player's left hand appears on the left of the screen — and a panel that
 * lists them the other way round asks the reader to cross their arms mentally every time
 * they glance at it.
 */
export const HAND_ORDER: readonly HandRole[] = ['shaping', 'chord']

/** Sorts anything carrying a role into the order the hands appear on screen. */
export function inHandOrder<T extends { role: HandRole }>(hands: readonly T[]): T[] {
  return [...hands].sort((a, b) => HAND_ORDER.indexOf(a.role) - HAND_ORDER.indexOf(b.role))
}

export type HandIconOptions = {
  /** Defaults to the chord hand, which is the one shown most often. */
  role?: HandRole
  /** Rendered size in pixels. The drawing itself is resolution-independent. */
  size?: number
  /** Marks the icon as the one being asked for, for the tutorial and song list to highlight. */
  target?: boolean
}

function capsule(x1: number, y1: number, x2: number, y2: number, className: string): SVGElement {
  const node = document.createElementNS(SVG_NS, 'line')
  node.setAttribute('x1', String(x1))
  node.setAttribute('y1', String(y1))
  node.setAttribute('x2', String(x2))
  node.setAttribute('y2', String(y2))
  node.setAttribute('stroke-width', String(THICKNESS))
  node.setAttribute('stroke-linecap', 'round')
  node.setAttribute('class', className)
  return node
}

/**
 * Draws the hand showing `mask`.
 *
 * Fingers that are up reach their full length, folded ones show as knuckles over the top of
 * the palm, and the thumb is either swung out to the side or folded across the palm — which
 * is the distinction the shaping hand uses for major and minor, so it has to stay legible at
 * the size of a list item.
 */
export function handIcon(mask: FingerMask, options: HandIconOptions = {}): SVGSVGElement {
  const { role = 'chord', size = 44, target = false } = options

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(Math.round((size * HEIGHT) / WIDTH)))
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('hand-icon')
  if (target) svg.classList.add('is-target')

  const group = document.createElementNS(SVG_NS, 'g')
  if (MIRRORED[role]) group.setAttribute('transform', `translate(${WIDTH} 0) scale(-1 1)`)
  svg.append(group)

  for (const finger of FINGERS) {
    const up = (mask & finger.bit) !== 0
    group.append(
      capsule(finger.x, KNUCKLE_Y, finger.x, up ? finger.up : finger.down, up ? 'finger is-up' : 'finger'),
    )
  }

  const palm = document.createElementNS(SVG_NS, 'rect')
  palm.setAttribute('x', String(PALM.x))
  palm.setAttribute('y', String(PALM.y))
  palm.setAttribute('width', String(PALM.width))
  palm.setAttribute('height', String(PALM.height))
  palm.setAttribute('rx', String(PALM.radius))
  palm.setAttribute('class', 'palm')
  group.append(palm)

  // Over the palm, because that is where a folded thumb lies. Out or in are two different
  // silhouettes rather than the same shape in two places: on the shaping hand this is the
  // entire difference between major and minor.
  const out = (mask & THUMB) !== 0
  const thumb = out ? THUMB_OUT : THUMB_IN
  group.append(
    capsule(thumb.x1, thumb.y1, thumb.x2, thumb.y2, out ? 'finger thumb is-up' : 'finger thumb is-tucked'),
  )

  return svg
}

/** Reverse of `DEGREE_BY_MASK`, so a degree can be drawn. Built from that map rather than
 *  written out again, because two lists of the same thing is one list that goes stale. */
export function maskForDegree(degree: number, byMask: ReadonlyMap<FingerMask, number>): FingerMask {
  for (const [mask, value] of byMask) if (value === degree) return mask
  return 0
}

/**
 * What the shaping hand looks like for a given voicing.
 *
 * Fingers are counted rather than matched on this hand — see `densityFor` — so any shape
 * with the right number would do. The picture shows the plainest one: index first, then
 * middle, then ring, which is how nearly everyone counts on their fingers.
 */
export function maskForDensity(density: number, major: boolean): FingerMask {
  const fingers = [INDEX, MIDDLE, RING]
  let mask = major ? THUMB : 0
  for (let index = 0; index < Math.min(density, fingers.length); index++) {
    mask |= fingers[index]!
  }
  return mask
}
