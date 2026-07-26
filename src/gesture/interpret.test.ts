import { beforeEach, describe, expect, it } from 'vitest'
import { defaultConfig, type Config } from '../config'
import type { HandFrame, Landmarks, PerformanceState } from '../types'
import { createInterpreter, type Interpreter } from './interpret'
import { GESTURES, makeHand, type FingerStates, type HandOptions } from './testHands'

let config: Config
let interpreter: Interpreter

beforeEach(() => {
  config = structuredClone(defaultConfig)
  interpreter = createInterpreter(config)
})

function hand(fingers: FingerStates, options?: HandOptions) {
  return { landmarks: makeHand(fingers, options), score: 0.95 }
}

/** Feeds the same frame repeatedly, the way a held gesture arrives. */
function hold(frame: HandFrame, frames = 6): PerformanceState {
  let state = interpreter.update(frame)
  for (let i = 1; i < frames; i++) state = interpreter.update(frame)
  return state
}

/** A left hand showing three fingers: sound on, full triad, upright so no distortion. */
function openLeft(options?: HandOptions) {
  return hand(GESTURES.three, options)
}

describe('right hand chooses the degree', () => {
  const expected: [keyof typeof GESTURES, number][] = [
    ['one', 1],
    ['two', 2],
    ['three', 3],
    ['four', 4],
    ['open', 5],
    ['koza', 6],
    ['kozaThumb', 7],
  ]

  for (const [gesture, degree] of expected) {
    it(`plays degree ${degree} for ${gesture}`, () => {
      const state = hold({ right: hand(GESTURES[gesture]), left: openLeft() })
      expect(state.degree).toBe(degree)
    })
  }

  it('plays nothing until a recognised gesture has been held', () => {
    const state = interpreter.update({ right: hand(GESTURES.one), left: openLeft() })
    expect(state.degree).toBeNull()
  })

  it('holds the last degree through an unrecognised shape', () => {
    hold({ right: hand(GESTURES.koza), left: openLeft() })

    // A right fist maps to no degree at all.
    const state = hold({ right: hand(GESTURES.fist), left: openLeft() }, 30)
    expect(state.degree).toBe(6)
  })

  // The design claim that makes sustained mode playable: rearranging the fingers must
  // not sound the shapes passed through on the way.
  it('does not sound the two-finger degree while moving from one finger to three', () => {
    const degrees: (number | null)[] = []

    for (let i = 0; i < 8; i++) {
      degrees.push(interpreter.update({ right: hand(GESTURES.one), left: openLeft() }).degree)
    }
    // Two frames in the in-between shape, fewer than the hand needs to settle.
    for (let i = 0; i < 2; i++) {
      degrees.push(interpreter.update({ right: hand(GESTURES.two), left: openLeft() }).degree)
    }
    for (let i = 0; i < 8; i++) {
      degrees.push(interpreter.update({ right: hand(GESTURES.three), left: openLeft() }).degree)
    }

    expect(degrees).not.toContain(2)
    expect(degrees.at(-1)).toBe(3)
  })
})

describe('right hand tilt chooses major or minor', () => {
  it('is major with the hand upright', () => {
    const state = hold({ right: hand(GESTURES.one), left: openLeft() })
    expect(state.quality).toBe('major')
  })

  it('is minor past the tilt threshold', () => {
    const tilt = config.quality.minorAboveDeg + 10
    const state = hold({ right: hand(GESTURES.one, { tilt }), left: openLeft() })
    expect(state.quality).toBe('minor')
  })

  it('turns minor whichever way the hand leans', () => {
    const tilt = -(config.quality.minorAboveDeg + 10)
    const state = hold({ right: hand(GESTURES.one, { tilt }), left: openLeft() })
    expect(state.quality).toBe('minor')
  })

  it('holds its choice inside the dead band rather than flickering', () => {
    const between = (config.quality.majorBelowDeg + config.quality.minorAboveDeg) / 2

    hold({ right: hand(GESTURES.one, { tilt: config.quality.minorAboveDeg + 5 }), left: openLeft() })
    expect(hold({ right: hand(GESTURES.one, { tilt: between }), left: openLeft() }).quality)
      .toBe('minor')

    hold({ right: hand(GESTURES.one, { tilt: 0 }), left: openLeft() })
    expect(hold({ right: hand(GESTURES.one, { tilt: between }), left: openLeft() }).quality)
      .toBe('major')
  })
})

describe('left hand shapes the sound', () => {
  it('sets density from one, two and three fingers', () => {
    for (const [gesture, density] of [
      ['one', 1],
      ['two', 2],
      ['three', 3],
    ] as const) {
      interpreter.reset()
      const state = hold({ right: hand(GESTURES.one), left: hand(GESTURES[gesture]) })
      expect(state.density).toBe(density)
    }
  })

  it('mutes on a fist', () => {
    expect(hold({ right: hand(GESTURES.one), left: openLeft() }).gate).toBe(true)
    expect(hold({ right: hand(GESTURES.one), left: hand(GESTURES.fist) }).gate).toBe(false)
  })

  it('unmutes again when the fist opens', () => {
    hold({ right: hand(GESTURES.one), left: hand(GESTURES.fist) })
    expect(hold({ right: hand(GESTURES.one), left: openLeft() }).gate).toBe(true)
  })

  it('keeps the fist muted through unrecognised shapes', () => {
    hold({ right: hand(GESTURES.one), left: hand(GESTURES.fist) })
    const state = hold({ right: hand(GESTURES.one), left: hand(GESTURES.koza) }, 30)
    expect(state.gate).toBe(false)
  })

  it('raises volume as the hand rises', () => {
    const atBottom = openLeft({ center: { x: 0.3, y: config.volume.bottomY } })
    const atTop = openLeft({ center: { x: 0.3, y: config.volume.topY } })

    const low = hold({ right: hand(GESTURES.one), left: atBottom }, 60)
    interpreter.reset()
    const high = hold({ right: hand(GESTURES.one), left: atTop }, 60)

    expect(high.volume).toBeGreaterThan(low.volume)
    expect(high.volume).toBeCloseTo(1, 2)
  })

  // Dropping the hand should thin the sound out, not end it. Silence is the fist —
  // a deliberate gesture you can hold — and a hand that strays low is not that.
  it('never falls below the floor, however low the hand goes', () => {
    const belowFrame = openLeft({ center: { x: 0.3, y: 1.4 } })
    const state = hold({ right: hand(GESTURES.one), left: belowFrame }, 60)

    expect(state.volume).toBeCloseTo(config.volume.floor, 3)
    expect(state.volume).toBeGreaterThan(0)
    expect(state.gate).toBe(true)
  })

  it('still reaches true silence through the fist', () => {
    const state = hold({ right: hand(GESTURES.one), left: hand(GESTURES.fist) })
    expect(state.gate).toBe(false)
  })

  it('raises distortion as the hand tilts', () => {
    const upright = hold({ right: hand(GESTURES.one), left: openLeft({ tilt: 0 }) }, 60)
    interpreter.reset()
    const tilted = hold({ right: hand(GESTURES.one), left: openLeft({ tilt: 50 }) }, 60)

    expect(upright.distortion).toBeLessThan(0.05)
    expect(tilted.distortion).toBeGreaterThan(upright.distortion)
  })

  it('smooths volume rather than jumping to it', () => {
    hold({ right: hand(GESTURES.one), left: openLeft({ center: { x: 0.3, y: 0.8 } }) }, 40)
    const first = interpreter.update({
      right: hand(GESTURES.one),
      left: openLeft({ center: { x: 0.3, y: 0.15 } }),
    })
    expect(first.volume).toBeLessThan(0.5)
  })
})

describe('missing hands', () => {
  it('holds volume and distortion when the left hand disappears', () => {
    const before = hold(
      { right: hand(GESTURES.one), left: openLeft({ center: { x: 0.3, y: 0.25 }, tilt: 40 }) },
      60,
    )
    const after = hold({ right: hand(GESTURES.one), left: null }, 30)

    expect(after.volume).toBeCloseTo(before.volume, 10)
    expect(after.distortion).toBeCloseTo(before.distortion, 10)
    expect(after.density).toBe(before.density)
  })

  it('tolerates the right hand blinking out for a frame or two', () => {
    hold({ right: hand(GESTURES.koza), left: openLeft() })

    let state = interpreter.update({ right: null, left: openLeft() })
    state = interpreter.update({ right: null, left: openLeft() })

    expect(state.gate).toBe(true)
    expect(state.degree).toBe(6)
  })

  it('fades out once the right hand has been gone too long', () => {
    hold({ right: hand(GESTURES.koza), left: openLeft() })

    let state = interpreter.update({ right: null, left: openLeft() })
    for (let i = 1; i < config.gesture.handLostFrames; i++) {
      state = interpreter.update({ right: null, left: openLeft() })
    }

    expect(state.gate).toBe(false)
  })

  it('comes back when the right hand returns', () => {
    hold({ right: hand(GESTURES.koza), left: openLeft() })
    for (let i = 0; i < 40; i++) interpreter.update({ right: null, left: openLeft() })

    const state = hold({ right: hand(GESTURES.koza), left: openLeft() })
    expect(state.gate).toBe(true)
    expect(state.degree).toBe(6)
  })

  it('produces a usable state with no hands at all', () => {
    const state = interpreter.update({ right: null, left: null })
    expect(state.degree).toBeNull()
    expect(state.density).toBe(3)
    expect(state.volume).toBeGreaterThan(0)
  })
})

// The render loop runs at 60 Hz while the camera delivers about 30, so roughly every
// other call hands back the same picture. Counting a repeat toward the stability
// requirement is the same evidence counted twice, and it made the gate half as strong
// as it was configured to be.
describe('repeated camera frames', () => {
  it('does not let a repeat count toward the stability requirement', () => {
    const frame = { right: hand(GESTURES.koza), left: openLeft() }

    for (let i = 0; i < 20; i++) interpreter.update(frame, false)
    expect(interpreter.update(frame, false).degree).toBeNull()
  })

  it('needs the configured number of genuinely new frames', () => {
    const frame = { right: hand(GESTURES.koza), left: openLeft() }

    for (let i = 0; i < config.gesture.stabilityFrames - 1; i++) {
      interpreter.update(frame, true)
      interpreter.update(frame, false)
      interpreter.update(frame, false)
    }
    expect(interpreter.debug.rightMask).not.toBeNull()

    const state = interpreter.update(frame, true)
    expect(state.degree).toBe(6)
  })

  it('hands back the previous state unchanged on a repeat', () => {
    const before = hold({ right: hand(GESTURES.one), left: openLeft() })
    const repeated = interpreter.update({ right: null, left: null }, false)
    expect(repeated).toEqual(before)
  })

  it('does not let repeats age out a hand that has gone missing', () => {
    hold({ right: hand(GESTURES.koza), left: openLeft() })

    for (let i = 0; i < config.gesture.handLostFrames * 4; i++) {
      interpreter.update({ right: null, left: openLeft() }, false)
    }
    expect(interpreter.update({ right: null, left: openLeft() }, false).gate).toBe(true)
  })
})

describe('live config changes', () => {
  it('picks up a new stability requirement without being rebuilt', () => {
    config.gesture.stabilityFrames = 1
    const state = interpreter.update({ right: hand(GESTURES.koza), left: openLeft() })
    expect(state.degree).toBe(6)
  })

  it('picks up new tilt thresholds without being rebuilt', () => {
    const frame = { right: hand(GESTURES.one, { tilt: 25 }), left: openLeft() }
    expect(hold(frame).quality).toBe('major')

    config.quality.majorBelowDeg = 5
    config.quality.minorAboveDeg = 10
    expect(hold(frame).quality).toBe('minor')
  })
})

describe('debug readout', () => {
  it('reports the masks and tilts behind the current state', () => {
    hold({ right: hand(GESTURES.koza, { tilt: 40 }), left: openLeft() })

    expect(interpreter.debug.rightTilt).toBeCloseTo(40, 4)
    expect(interpreter.debug.rightMask).not.toBeNull()
    expect(interpreter.debug.leftMask).not.toBeNull()
  })

  it('clears a hand mask when that hand is not visible', () => {
    hold({ right: hand(GESTURES.one), left: openLeft() })
    interpreter.update({ right: null, left: openLeft() })
    expect(interpreter.debug.rightMask).toBeNull()
  })
})

describe('landmark safety', () => {
  it('does not throw on empty landmark arrays', () => {
    const empty: Landmarks = []
    expect(() =>
      interpreter.update({ right: { landmarks: empty, score: 0 }, left: { landmarks: empty, score: 0 } }),
    ).not.toThrow()
  })
})
