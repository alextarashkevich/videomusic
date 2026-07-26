import type { ScaleDegree } from '../types'

/** Where degree I sits on the colour wheel. Chosen to match the interface accent. */
const TONIC_HUE = 0.52

/** How much of the wheel the seven degrees span. Less than a full turn so the octave
 *  does not land back on the tonic's colour and read as the same chord. */
const SPREAD = 0.82

/** Hue in 0..1 for a scale degree. */
export function hueForDegree(degree: ScaleDegree): number {
  return wrapHue(TONIC_HUE + ((degree - 1) / 7) * SPREAD)
}

export function wrapHue(hue: number): number {
  return ((hue % 1) + 1) % 1
}

/**
 * Signed distance from one hue to another the short way round the wheel, in -0.5..0.5.
 *
 * Interpolating hues naively makes a move from 0.95 to 0.05 sweep backwards through
 * every colour there is; this keeps it to the one step it actually is.
 */
export function hueDelta(from: number, to: number): number {
  const raw = wrapHue(to) - wrapHue(from)
  if (raw > 0.5) return raw - 1
  if (raw < -0.5) return raw + 1
  return raw
}

/** Moves `from` toward `to` by `amount` of the remaining distance, the short way. */
export function approachHue(from: number, to: number, amount: number): number {
  return wrapHue(from + hueDelta(from, to) * amount)
}

/** Plain exponential approach for values that do not wrap. */
export function approach(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}
