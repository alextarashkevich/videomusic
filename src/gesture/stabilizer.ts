/**
 * The three pieces of state that stand between raw per-frame readings and something
 * worth playing. Each is deliberately tiny and independent so it can be reasoned about
 * and tested on its own.
 *
 * None of them stores its own thresholds — those are passed in on every push, read
 * fresh from config. That is what lets the tuning panel change how the instrument
 * responds while it is being played, instead of only at startup.
 */

export type Stabilizer<T> = {
  /**
   * Feed one frame's reading.
   *
   * Pass null when there is nothing to report — the committed value is then held rather
   * than cleared, which is what keeps half-formed hand shapes silent while the fingers
   * are still moving. A new value takes effect only once it has been seen on `frames`
   * consecutive frames.
   */
  push: (value: T | null, frames: number) => T | null
  readonly value: T | null
  reset: () => void
}

export function createStabilizer<T>(initial: T | null = null): Stabilizer<T> {
  let committed: T | null = initial
  let candidate: T | null = null
  let streak = 0

  return {
    push(value, frames) {
      if (value === null) {
        candidate = null
        streak = 0
        return committed
      }

      if (value === candidate) streak += 1
      else {
        candidate = value
        streak = 1
      }

      if (streak >= frames) committed = value
      return committed
    },

    get value() {
      return committed
    },

    reset() {
      committed = initial
      candidate = null
      streak = 0
    },
  }
}

export type Smoother = {
  /** `alpha` is the weight given to the new sample, 0..1. Lower is smoother but laggier. */
  push: (value: number, alpha: number) => number
  readonly value: number
  reset: () => void
}

/**
 * Exponential moving average, seeded by its first sample.
 *
 * Seeding matters: without it every control would audibly slide up from its initial
 * value for the first half-second after a hand appears.
 */
export function createSmoother(initial = 0): Smoother {
  let current = initial
  let seeded = false

  return {
    push(value, alpha) {
      if (seeded) current += (value - current) * alpha
      else {
        current = value
        seeded = true
      }
      return current
    },

    get value() {
      return current
    },

    reset() {
      current = initial
      seeded = false
    },
  }
}

export type Latch = {
  push: (value: number, low: number, high: number) => boolean
  readonly value: boolean
  reset: () => void
}

/**
 * A threshold with a dead band: switches on above `high`, off below `low`, and holds
 * whatever it was in between.
 *
 * A single threshold would make a hand held near the boundary flip states many times a
 * second. The gap is what makes major and minor feel like two places rather than a
 * knife edge.
 */
export function createLatch(initial = false): Latch {
  let state = initial

  return {
    push(value, low, high) {
      if (value >= high) state = true
      else if (value <= low) state = false
      return state
    },

    get value() {
      return state
    },

    reset() {
      state = initial
    },
  }
}
