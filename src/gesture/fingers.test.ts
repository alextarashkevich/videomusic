import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config'
import { describeMask, fingerMask, handScale } from './fingers'
import { FINGER_BIT } from './landmarks'
import { GESTURES, makeHand } from './testHands'

const { THUMB, INDEX, MIDDLE, RING, PINKY } = FINGER_BIT

describe('fingerMask', () => {
  const cases: [keyof typeof GESTURES, number][] = [
    ['fist', 0],
    ['one', INDEX],
    ['two', INDEX | MIDDLE],
    ['three', INDEX | MIDDLE | RING],
    ['four', INDEX | MIDDLE | RING | PINKY],
    ['open', THUMB | INDEX | MIDDLE | RING | PINKY],
    ['koza', INDEX | PINKY],
    ['kozaThumb', THUMB | INDEX | PINKY],
  ]

  for (const [name, expected] of cases) {
    it(`reads ${name} as ${describeMask(expected)}`, () => {
      expect(fingerMask(makeHand(GESTURES[name]), defaultConfig)).toBe(expected)
    })
  }

  // The whole reason for measuring distances from the wrist rather than comparing
  // y coordinates: the right hand is rotated on purpose to choose major or minor, and
  // the gesture underneath it has to keep reading the same.
  it('reads the same gesture identically through a full rotation', () => {
    for (const name of Object.keys(GESTURES) as (keyof typeof GESTURES)[]) {
      const upright = fingerMask(makeHand(GESTURES[name]), defaultConfig)

      for (let tilt = -180; tilt <= 180; tilt += 15) {
        const rotated = fingerMask(makeHand(GESTURES[name], { tilt }), defaultConfig)
        expect(rotated, `${name} at ${tilt}°`).toBe(upright)
      }
    }
  })

  // Thresholds are expressed in hand widths, so moving toward or away from the camera
  // must not change what is recognised.
  it('reads the same gesture identically at any distance from the camera', () => {
    for (const name of Object.keys(GESTURES) as (keyof typeof GESTURES)[]) {
      const expected = fingerMask(makeHand(GESTURES[name]), defaultConfig)

      for (const scale of [0.08, 0.15, 0.25, 0.4]) {
        const scaled = fingerMask(makeHand(GESTURES[name], { scale }), defaultConfig)
        expect(scaled, `${name} at scale ${scale}`).toBe(expected)
      }
    }
  })

  it('reads the same gesture anywhere in frame', () => {
    const expected = fingerMask(makeHand(GESTURES.koza), defaultConfig)

    for (const center of [
      { x: 0.15, y: 0.2 },
      { x: 0.85, y: 0.2 },
      { x: 0.5, y: 0.8 },
    ]) {
      expect(fingerMask(makeHand(GESTURES.koza, { center }), defaultConfig)).toBe(expected)
    }
  })

  it('gives every mapped gesture a distinct mask', () => {
    const masks = Object.values(GESTURES).map((fingers) =>
      fingerMask(makeHand(fingers), defaultConfig),
    )
    expect(new Set(masks).size).toBe(masks.length)
  })

  it('does not throw on truncated landmark data', () => {
    expect(fingerMask([], defaultConfig)).toBe(0)
    expect(fingerMask(makeHand(GESTURES.open).slice(0, 5), defaultConfig)).toBeTypeOf('number')
  })
})

describe('handScale', () => {
  it('scales linearly with the size of the hand in frame', () => {
    const near = handScale(makeHand(GESTURES.open, { scale: 0.4 }))
    const far = handScale(makeHand(GESTURES.open, { scale: 0.1 }))
    expect(near / far).toBeCloseTo(4, 5)
  })

  it('is unchanged by rotation', () => {
    const upright = handScale(makeHand(GESTURES.open))
    expect(handScale(makeHand(GESTURES.open, { tilt: 73 }))).toBeCloseTo(upright, 10)
  })
})

describe('describeMask', () => {
  it('renders which fingers are up', () => {
    expect(describeMask(INDEX | PINKY)).toBe('·I··P')
    expect(describeMask(0)).toBe('·····')
    expect(describeMask(THUMB | INDEX | MIDDLE | RING | PINKY)).toBe('TIMRP')
  })
})
