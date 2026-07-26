import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config'
import { describeMask, fingerMask, fingerReach, handScale, thumbAngle } from './fingers'
import { FINGER_BIT } from './landmarks'
import { flatten, GESTURES, makeHand } from './testHands'

const { THUMB, INDEX, MIDDLE, RING, PINKY } = FINGER_BIT
const ALL_GESTURES = Object.keys(GESTURES) as (keyof typeof GESTURES)[]

describe('fingerMask', () => {
  const cases: [keyof typeof GESTURES, number][] = [
    ['fist', 0],
    ['one', INDEX],
    ['two', INDEX | MIDDLE],
    ['three', INDEX | MIDDLE | RING],
    ['threeGerman', THUMB | INDEX | MIDDLE],
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

  // The whole reason for measuring distances within the hand: the right hand is rolled
  // on purpose to choose major or minor, and the gesture underneath must read the same.
  it('reads the same gesture identically through a full roll', () => {
    for (const name of ALL_GESTURES) {
      const upright = fingerMask(makeHand(GESTURES[name]), defaultConfig)

      for (let tilt = -180; tilt <= 180; tilt += 15) {
        expect(fingerMask(makeHand(GESTURES[name], { tilt }), defaultConfig), `${name} @ ${tilt}°`)
          .toBe(upright)
      }
    }
  })

  // Turning the hand away from the camera leaves it the same shape in space, and the
  // depth-aware measurement should agree.
  it('reads the same gesture identically when the hand turns away from the camera', () => {
    for (const name of ALL_GESTURES) {
      const facing = fingerMask(makeHand(GESTURES[name]), defaultConfig)

      for (const pitch of [-60, -40, -20, 20, 40, 60]) {
        expect(fingerMask(makeHand(GESTURES[name], { pitch }), defaultConfig), `${name} @ ${pitch}°`)
          .toBe(facing)
      }
    }
  })

  it('survives roll and pitch together', () => {
    for (const name of ALL_GESTURES) {
      const facing = fingerMask(makeHand(GESTURES[name]), defaultConfig)
      expect(fingerMask(makeHand(GESTURES[name], { tilt: 40, pitch: 45 }), defaultConfig), name)
        .toBe(facing)
    }
  })

  it('reads the same gesture identically at any distance from the camera', () => {
    for (const name of ALL_GESTURES) {
      const expected = fingerMask(makeHand(GESTURES[name]), defaultConfig)

      for (const scale of [0.08, 0.15, 0.25, 0.4]) {
        expect(fingerMask(makeHand(GESTURES[name], { scale }), defaultConfig), name).toBe(expected)
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
    const masks = ALL_GESTURES.map((name) => fingerMask(makeHand(GESTURES[name]), defaultConfig))
    expect(new Set(masks).size).toBe(masks.length)
  })

  it('does not throw on truncated landmark data', () => {
    expect(fingerMask([], defaultConfig)).toBe(0)
    expect(fingerMask(makeHand(GESTURES.open).slice(0, 5), defaultConfig)).toBeTypeOf('number')
  })
})

// The thumb does not curl like the other four — it swings across the palm — so it needs
// its own test. The one this replaced measured the gap between the thumb tip and the
// pinky knuckle: a line straight across the palm, and so the single measurement on the
// hand most distorted by viewing angle.
describe('thumbAngle', () => {
  it('separates a thumb held out from one tucked across the palm', () => {
    const out = thumbAngle(makeHand(GESTURES.open))
    const tucked = thumbAngle(makeHand(GESTURES.four))

    expect(out).toBeGreaterThan(defaultConfig.gesture.thumbAngleDeg)
    expect(tucked).toBeLessThan(defaultConfig.gesture.thumbAngleDeg)
    // Wide enough that the threshold is not balanced on a knife edge.
    expect(out - tucked).toBeGreaterThan(30)
  })

  it('is unchanged by rolling the hand', () => {
    const upright = thumbAngle(makeHand(GESTURES.open))
    for (const tilt of [-90, -45, 45, 90, 180]) {
      expect(thumbAngle(makeHand(GESTURES.open, { tilt })), `${tilt}°`).toBeCloseTo(upright, 6)
    }
  })

  it('is unchanged by turning the hand away from the camera', () => {
    const facing = thumbAngle(makeHand(GESTURES.open))
    for (const pitch of [-50, -25, 25, 50]) {
      expect(thumbAngle(makeHand(GESTURES.open, { pitch })), `${pitch}°`).toBeCloseTo(facing, 6)
    }
  })

  it('is unchanged by hand size', () => {
    const near = thumbAngle(makeHand(GESTURES.open, { scale: 0.4 }))
    expect(thumbAngle(makeHand(GESTURES.open, { scale: 0.08 }))).toBeCloseTo(near, 6)
  })

  // коза and коза-with-thumb differ only in the thumb, and the tilted version of that
  // pair is what the instrument was getting wrong.
  it('tells коза from коза with the thumb at any angle', () => {
    for (const tilt of [0, 30, 45, -45]) {
      for (const pitch of [0, 30, -30]) {
        const without = fingerMask(makeHand(GESTURES.koza, { tilt, pitch }), defaultConfig)
        const with_ = fingerMask(makeHand(GESTURES.kozaThumb, { tilt, pitch }), defaultConfig)
        expect(without & THUMB, `коза @ ${tilt}/${pitch}`).toBe(0)
        expect(with_ & THUMB, `коза+thumb @ ${tilt}/${pitch}`).toBe(THUMB)
      }
    }
  })

  it('returns zero rather than throwing on missing landmarks', () => {
    expect(thumbAngle([])).toBe(0)
  })
})

describe('fingerReach', () => {
  it('puts every extended finger above the threshold and every folded one below', () => {
    for (const name of ALL_GESTURES) {
      const fingers = GESTURES[name]
      const reach = fingerReach(makeHand(fingers))

      for (const finger of ['index', 'middle', 'ring', 'pinky'] as const) {
        const value = reach[finger]!
        if (fingers[finger]) expect(value, `${name}.${finger}`).toBeGreaterThan(0.45)
        else expect(value, `${name}.${finger}`).toBeLessThan(0.45)
      }
    }
  })

  it('reports the thumb as an angle, not a reach', () => {
    expect(fingerReach(makeHand(GESTURES.open))['thumb']).toBeGreaterThan(10)
  })
})

describe('handScale', () => {
  it('scales linearly with the size of the hand in frame', () => {
    const near = handScale(makeHand(GESTURES.open, { scale: 0.4 }))
    const far = handScale(makeHand(GESTURES.open, { scale: 0.1 }))
    expect(near / far).toBeCloseTo(4, 5)
  })

  it('is unchanged by rotation in any direction', () => {
    const upright = handScale(makeHand(GESTURES.open))
    expect(handScale(makeHand(GESTURES.open, { tilt: 73 }))).toBeCloseTo(upright, 10)
    expect(handScale(makeHand(GESTURES.open, { pitch: 50 }))).toBeCloseTo(upright, 10)
  })

  // What the depth-aware measurement is protecting against: flatten the same hand and
  // the palm itself measures shorter, because the camera cannot see the part of it that
  // points away.
  it('shrinks once depth is thrown away', () => {
    const solid = handScale(makeHand(GESTURES.open, { pitch: 55 }))
    const flat = handScale(flatten(makeHand(GESTURES.open, { pitch: 55 })))
    expect(flat).toBeLessThan(solid * 0.7)
  })
})

describe('describeMask', () => {
  it('renders which fingers are up', () => {
    expect(describeMask(INDEX | PINKY)).toBe('·I··P')
    expect(describeMask(0)).toBe('·····')
    expect(describeMask(THUMB | INDEX | MIDDLE | RING | PINKY)).toBe('TIMRP')
  })
})
