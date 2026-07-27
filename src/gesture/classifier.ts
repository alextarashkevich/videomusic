/**
 * Recognising a hand by comparing it to your own hands, rather than by measuring it against
 * numbers someone guessed.
 *
 * The rules in `fingers.ts` are the fallback and they are decent, but they are still a
 * person's theory of what a finger does, with thresholds that have to be right for
 * everybody. This is the other approach: hold each gesture once, and afterwards the closest
 * match wins. It learns your hands, your camera and your angles, and it does not care
 * whether your pinky is short.
 *
 * Deliberately not a neural network. Eight classes and a few dozen examples each is a
 * problem nearest-neighbour solves outright, in a few microseconds, with a model small
 * enough to keep in localStorage and simple enough to be read and argued with.
 */
import type { FingerMask } from '../types'
import { featureDistance } from './features'

export type GestureClass = {
  mask: FingerMask
  /** Average of every sample taken for this gesture. */
  centroid: number[]
  /** A spread-out handful of the actual samples, kept so a gesture that was held at
   *  several angles is matched at all of them rather than only at their average — which
   *  can be a shape the hand never made. */
  exemplars: number[][]
  /**
   * The furthest any recorded sample sat from this class's own centroid and exemplars —
   * measured the same way classification measures, so the two are comparable.
   *
   * It used to be the *mean* distance to the centroid, which was wrong twice over. It
   * compared an average against a minimum, and it assumed a gesture recorded over a range
   * of angles would show real variation — when the whole point of the feature vector is
   * that rotating a hand does not change it. So the spread stayed at the noise floor, the
   * radius built from it was a hairline, and nothing ever landed inside.
   */
  spread: number
  /**
   * Distance to the nearest other gesture in the model.
   *
   * The floor under the radius. However still a hand was held while being recorded, a shape
   * that is closer to this gesture than to any other, by some margin, is this gesture — and
   * saying so cannot be wrong in a way the margin test would not already have caught.
   */
  separation: number
}

export type GestureModel = {
  /** Bumped when the feature layout changes, so a model recorded by an older build is
   *  discarded rather than silently misread. */
  version: number
  classes: GestureClass[]
}

/** Bumped when a model recorded by an older build would be read wrongly rather than merely
 *  read differently. Version 1 had no `separation`, so its radius would come out as zero
 *  and it would recognise nothing at all — better discarded, and recalibrated. */
export const MODEL_VERSION = 2

export type Verdict = {
  mask: FingerMask | null
  /**
   * Distance to the winner, how much further the runner-up sat, and how far out the winner
   * would still have been accepted.
   *
   * All three go in the readout. When this rejects a hand it does so silently — the chord
   * simply holds — which is right for playing and terrible for working out why nothing is
   * happening. Showing the numbers the decision was made from is the difference between a
   * diagnosable instrument and one that has to be guessed at.
   */
  distance: number
  margin: number
  radius: number
}

const UNRECOGNISED: Verdict = { mask: null, distance: Infinity, margin: 0, radius: 0 }

export type ClassifierSettings = {
  radiusFactor: number
  marginRatio: number
}

/**
 * Which gesture this hand is, or null for "not sure".
 *
 * Two ways to answer null, and both matter more than being right often:
 *
 * - **Too far from anything.** A hand rearranging itself between two gestures passes
 *   through shapes that are not gestures. Naming the nearest one anyway is how you get a
 *   chord you did not ask for on the way to the one you did.
 * - **Too close to call.** If the runner-up is nearly as good a match, the honest answer
 *   is that it does not know.
 *
 * Null flows into the stabiliser as "hold what was playing", which is silence rather than
 * a wrong note — the same contract the rules had.
 */
export function classify(
  features: readonly number[] | null,
  model: GestureModel | null,
  settings: ClassifierSettings,
): Verdict {
  if (features === null || model === null || model.classes.length === 0) return UNRECOGNISED

  let best: GestureClass | null = null
  let bestDistance = Infinity
  let runnerUp = Infinity

  for (const gesture of model.classes) {
    // The centroid is the general case; the exemplars catch the corners of a gesture that
    // was held over a range of angles, where the average is not a hand anyone made.
    let distance = featureDistance(features, gesture.centroid)
    for (const exemplar of gesture.exemplars) {
      const alternative = featureDistance(features, exemplar)
      if (alternative < distance) distance = alternative
    }

    if (distance < bestDistance) {
      runnerUp = bestDistance
      bestDistance = distance
      best = gesture
    } else if (distance < runnerUp) {
      runnerUp = distance
    }
  }

  if (best === null) return UNRECOGNISED

  const margin = runnerUp === Infinity ? Infinity : runnerUp / Math.max(bestDistance, 1e-9)

  const radius = radiusOf(best, settings)
  if (bestDistance > radius) return { mask: null, distance: bestDistance, margin, radius }
  if (margin < settings.marginRatio) return { mask: null, distance: bestDistance, margin, radius }

  return { mask: best.mask, distance: bestDistance, margin, radius }
}

/**
 * How far from a gesture a hand may sit and still be called it.
 *
 * Whichever is larger of two things: the variation the gesture actually showed when it was
 * recorded, with room to spare — and half the way to the nearest *other* gesture.
 *
 * That second term is what stops this failing shut. Someone who holds very still while
 * calibrating leaves almost no recorded variation, and a radius built only from that is a
 * hairline no live hand ever lands inside — the instrument then recognises nothing, for
 * ever, with no hint as to why. Half the distance to the next gesture is a floor that
 * cannot collapse, and it is safe: inside it, this gesture is the nearest by a clear
 * margin, which is the same thing the margin test is already checking.
 */
function radiusOf(gesture: GestureClass, settings: ClassifierSettings): number {
  const recorded = gesture.spread * settings.radiusFactor
  const halfway = gesture.separation * 0.5
  return Math.max(recorded, halfway, 1e-3)
}

/**
 * Turns recorded samples into a model.
 *
 * Exemplars are chosen by repeatedly taking whichever remaining sample sits furthest from
 * everything already chosen. Taking the first eight instead would take eight samples from
 * the first quarter-second, all of the same still hand — the whole reason for asking the
 * player to move during capture is to see the gesture from more than one angle, and that
 * has to survive into the model.
 */
export function buildModel(
  samples: readonly { mask: FingerMask; features: number[] }[],
  exemplarsPerClass = 8,
): GestureModel {
  const byMask = new Map<FingerMask, number[][]>()
  for (const sample of samples) {
    const existing = byMask.get(sample.mask)
    if (existing === undefined) byMask.set(sample.mask, [sample.features])
    else existing.push(sample.features)
  }

  const classes: GestureClass[] = []

  for (const [mask, group] of byMask) {
    const first = group[0]
    if (first === undefined) continue

    const centroid = new Array<number>(first.length).fill(0)
    for (const features of group) {
      for (let index = 0; index < centroid.length; index++) {
        centroid[index]! += (features[index] ?? 0) / group.length
      }
    }

    const exemplars = pickSpread(group, exemplarsPerClass)

    // Measured exactly as classification measures — the furthest a recorded sample sat from
    // the model's own idea of this gesture. Comparing a mean against a minimum, which is
    // what this used to do, is not a comparison.
    let spread = 0
    for (const features of group) {
      const distance = nearestOf(features, centroid, exemplars)
      if (distance > spread) spread = distance
    }

    classes.push({ mask, centroid, exemplars, spread, separation: 0 })
  }

  // Second pass, because it takes every centroid to know how far apart any two of them are.
  for (const gesture of classes) {
    let nearest = Infinity
    for (const other of classes) {
      if (other === gesture) continue
      const distance = featureDistance(gesture.centroid, other.centroid)
      if (distance < nearest) nearest = distance
    }
    gesture.separation = nearest === Infinity ? 0 : nearest
  }

  return { version: MODEL_VERSION, classes }
}

/** Distance to whichever of a class's centroid and exemplars is closest — the quantity
 *  classification ranks on, so anything compared against it must be measured the same way. */
function nearestOf(
  features: readonly number[],
  centroid: readonly number[],
  exemplars: readonly number[][],
): number {
  let nearest = featureDistance(features, centroid)
  for (const exemplar of exemplars) {
    const distance = featureDistance(features, exemplar)
    if (distance < nearest) nearest = distance
  }
  return nearest
}

/** Farthest-point sampling: each pick is whichever candidate is furthest from everything
 *  picked so far. */
function pickSpread(group: readonly number[][], count: number): number[][] {
  if (group.length <= count) return group.map((features) => [...features])

  const chosen: number[][] = [[...group[0]!]]
  const nearest = group.map((features) => featureDistance(features, group[0]!))

  while (chosen.length < count) {
    let furthest = 0
    for (let index = 1; index < group.length; index++) {
      if (nearest[index]! > nearest[furthest]!) furthest = index
    }
    if (nearest[furthest] === 0) break

    const pick = group[furthest]!
    chosen.push([...pick])
    nearest[furthest] = 0

    for (let index = 0; index < group.length; index++) {
      const distance = featureDistance(group[index]!, pick)
      if (distance < nearest[index]!) nearest[index] = distance
    }
  }

  return chosen
}
