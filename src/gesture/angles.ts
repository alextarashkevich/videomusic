import type { Config } from '../config'
import type { Landmarks } from '../types'
import { LANDMARK } from './landmarks'

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * How far the palm leans from vertical, in degrees, in *landmark* space.
 *
 * Measured along the wrist-to-middle-knuckle axis, which is the most stable line on the
 * hand — it barely moves as the fingers open and close, so tilt stays readable whatever
 * gesture is being held.
 */
export function tiltDegrees(landmarks: Landmarks): number {
  const wrist = landmarks[LANDMARK.WRIST]
  const middle = landmarks[LANDMARK.MIDDLE_MCP]
  if (wrist === undefined || middle === undefined) return 0

  const dx = middle.x - wrist.x
  // Screen y grows downward, so an upright hand has a negative dy. Negating it puts
  // "straight up" at zero degrees.
  const dy = -(middle.y - wrist.y)

  return (Math.atan2(dx, dy) * 180) / Math.PI
}

/** Tilt away from vertical regardless of direction, 0..180. */
export function tiltMagnitude(landmarks: Landmarks): number {
  return Math.abs(tiltDegrees(landmarks))
}

/**
 * Where the hand sits vertically, as 0 at the bottom of the usable band and 1 at the top.
 *
 * The band insets from the very top and bottom of the frame, where a hand is half out of
 * shot and tracking is least trustworthy — so the loudest and quietest settings are both
 * reachable without leaving the camera's view.
 */
export function heightFraction(landmarks: Landmarks, config: Config): number {
  const wrist = landmarks[LANDMARK.WRIST]
  if (wrist === undefined) return 0

  const { topY, bottomY } = config.volume
  if (bottomY === topY) return 0

  return clamp01((bottomY - wrist.y) / (bottomY - topY))
}

/**
 * Playing level for the left hand: its height across the band, lifted so the bottom is
 * quiet rather than silent.
 *
 * Dropping your hand should thin the sound out, not end it. Silence is the fist — a
 * deliberate gesture you can hold — and giving the bottom of the frame the same power
 * makes the instrument cut out whenever a hand strays low.
 */
export function volumeLevel(landmarks: Landmarks, config: Config): number {
  const { floor } = config.volume
  return floor + (1 - floor) * heightFraction(landmarks, config)
}

/** Maps how far the wrist is turned onto 0..1 across the configured range. */
export function tiltAmount(landmarks: Landmarks, config: Config): number {
  const { minDeg, maxDeg } = config.tilt
  if (maxDeg === minDeg) return 0

  return clamp01((tiltMagnitude(landmarks) - minDeg) / (maxDeg - minDeg))
}
