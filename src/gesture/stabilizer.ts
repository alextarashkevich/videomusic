/**
 * The four pieces of state that stand between raw per-frame readings and something
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

export type Settler<T> = {
  /**
   * Feed what is being shown right now, against a monotonic clock in seconds.
   *
   * Returns the value that has stood still for `settleSeconds` — which is the previous
   * one while a new reading is still settling, and null until anything has settled at
   * all. `settleSeconds` of zero commits on sight.
   */
  push: (value: T, nowSeconds: number, settleSeconds: number) => T | null
  readonly value: T | null
  reset: () => void
}

/**
 * Commits a value only once it has stopped changing for a while.
 *
 * The time-based twin of `createStabilizer`, and it exists because the thing it has to
 * wait out is not measured in frames. Changing chord means rearranging both hands, and
 * they do not finish together: measured on a real camera, the degree can land up to
 * 300 ms before the quality does. For that gap the instrument is being shown a chord
 * nobody meant — going from C to A minor it reads A *major* on the way past — and a
 * struck preset strikes it. Half of all chord changes played one.
 *
 * Frames cannot express this. The camera runs at about 30 Hz and the gap is anywhere
 * from one frame to ten, so a frame count tight enough to catch the long ones costs a
 * third of a second on every chord, including the half that already arrive clean.
 * Seconds are the honest unit, and a single number in seconds is something a player can
 * be handed a slider for and set by ear.
 *
 * Every change restarts the wait, so a hand still moving commits nothing — and, equally
 * important, a hand that has stopped commits regardless of how it got there.
 */
export function createSettler<T>(): Settler<T> {
  let committed: T | null = null
  let candidate: T | null = null
  let since = 0

  return {
    push(value, nowSeconds, settleSeconds) {
      if (value !== candidate) {
        candidate = value
        since = nowSeconds
      }

      if (nowSeconds - since >= settleSeconds) committed = value
      return committed
    },

    get value() {
      return committed
    },

    reset() {
      committed = null
      candidate = null
      since = 0
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
