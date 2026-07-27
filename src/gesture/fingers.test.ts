import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config'
import {
  describeMask,
  fingerExtension,
  fingerMask,
  fingerReach,
  handScale,
  thumbAngle,
} from './fingers'
import { FINGER_BIT, HINGED_FINGERS } from './landmarks'
import {
  flatten,
  GESTURES,
  HARD_GESTURE_TWIN,
  HARD_GESTURES,
  makeHand,
  type FingerStates,
} from './testHands'

const { THUMB, INDEX, MIDDLE, RING, PINKY } = FINGER_BIT

const MASK_FOR: Record<keyof typeof GESTURES, number> = {
  fist: 0,
  one: INDEX,
  two: INDEX | MIDDLE,
  three: INDEX | MIDDLE | RING,
  four: INDEX | MIDDLE | RING | PINKY,
  open: THUMB | INDEX | MIDDLE | RING | PINKY,
  koza: INDEX | PINKY,
  kozaThumb: THUMB | INDEX | PINKY,
}

/** Textbook shapes and the way people actually hold them, together. Every invariance
 *  claim has to survive both — the realistic ones are where recognition broke. */
const EVERY: Record<string, FingerStates> = { ...GESTURES, ...HARD_GESTURES }
const ALL_GESTURES = Object.keys(EVERY)

describe('fingerMask', () => {
  for (const [name, expected] of Object.entries(MASK_FOR)) {
    it(`reads ${name} as ${describeMask(expected)}`, () => {
      expect(fingerMask(makeHand(GESTURES[name as keyof typeof GESTURES]), defaultConfig)).toBe(
        expected,
      )
    })
  }

  // The bug this whole layer was rebuilt around. Nobody folds the middle and ring fingers
  // all the way down to make a коза — the thumb pins them about two thirds, and two thirds
  // down still reached far enough from the knuckle to pass the old palm-relative threshold.
  // So коза came out as four fingers, which is degree IV, which is why it "did not work".
  for (const [name, twin] of Object.entries(HARD_GESTURE_TWIN)) {
    it(`reads ${name} the same as ${twin}`, () => {
      const shape = HARD_GESTURES[name as keyof typeof HARD_GESTURES]
      expect(fingerMask(makeHand(shape), defaultConfig)).toBe(MASK_FOR[twin])
    })
  }

  it('holds коза through the tilts it is played at', () => {
    for (const name of ['koza', 'kozaPinned'] as const) {
      const shape = EVERY[name]!
      for (let tilt = -60; tilt <= 60; tilt += 15) {
        for (const scale of [0.1, 0.25, 0.4]) {
          expect(
            fingerMask(makeHand(shape, { tilt, scale }), defaultConfig),
            `${name} @ ${tilt}° ×${scale}`,
          ).toBe(INDEX | PINKY)
        }
      }
    }
  })

  it('holds коза with the thumb through the same tilts', () => {
    for (const name of ['kozaThumb', 'kozaThumbPinned'] as const) {
      const shape = EVERY[name]!
      for (let tilt = -60; tilt <= 60; tilt += 15) {
        expect(fingerMask(makeHand(shape, { tilt }), defaultConfig), `${name} @ ${tilt}°`).toBe(
          THUMB | INDEX | PINKY,
        )
      }
    }
  })

  // The whole reason for measuring distances within the hand: the right hand is rolled
  // on purpose to choose major or minor, and the gesture underneath must read the same.
  it('reads the same gesture identically through a full roll', () => {
    for (const name of ALL_GESTURES) {
      const upright = fingerMask(makeHand(EVERY[name]!), defaultConfig)

      for (let tilt = -180; tilt <= 180; tilt += 15) {
        expect(
          fingerMask(makeHand(EVERY[name]!, { tilt }), defaultConfig),
          `${name} @ ${tilt}°`,
        ).toBe(upright)
      }
    }
  })

  // Turning the hand away from the camera leaves it the same shape in space, and the
  // depth-aware measurement should agree.
  it('reads the same gesture identically when the hand turns away from the camera', () => {
    for (const name of ALL_GESTURES) {
      const facing = fingerMask(makeHand(EVERY[name]!), defaultConfig)

      for (const pitch of [-60, -40, -20, 20, 40, 60]) {
        expect(
          fingerMask(makeHand(EVERY[name]!, { pitch }), defaultConfig),
          `${name} @ ${pitch}°`,
        ).toBe(facing)
      }
    }
  })

  it('survives roll and pitch together', () => {
    for (const name of ALL_GESTURES) {
      const facing = fingerMask(makeHand(EVERY[name]!), defaultConfig)
      expect(
        fingerMask(makeHand(EVERY[name]!, { tilt: 40, pitch: 45 }), defaultConfig),
        name,
      ).toBe(facing)
    }
  })

  it('reads the same gesture identically at any distance from the camera', () => {
    for (const name of ALL_GESTURES) {
      const expected = fingerMask(makeHand(EVERY[name]!), defaultConfig)

      for (const scale of [0.08, 0.15, 0.25, 0.4]) {
        expect(fingerMask(makeHand(EVERY[name]!, { scale }), defaultConfig), name).toBe(expected)
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
    const names = Object.keys(GESTURES) as (keyof typeof GESTURES)[]
    const masks = names.map((name) => fingerMask(makeHand(GESTURES[name]), defaultConfig))
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
        for (const [plain, thumbed] of [
          ['koza', 'kozaThumb'],
          ['kozaPinned', 'kozaThumbPinned'],
        ] as const) {
          const without = fingerMask(makeHand(EVERY[plain]!, { tilt, pitch }), defaultConfig)
          const with_ = fingerMask(makeHand(EVERY[thumbed]!, { tilt, pitch }), defaultConfig)
          expect(without & THUMB, `${plain} @ ${tilt}/${pitch}`).toBe(0)
          expect(with_ & THUMB, `${thumbed} @ ${tilt}/${pitch}`).toBe(THUMB)
        }
      }
    }
  })

  it('returns zero rather than throwing on missing landmarks', () => {
    expect(thumbAngle([])).toBe(0)
  })
})

// The claim the whole rebuild rests on: dividing by the finger's own bones makes every
// finger read the same number, so one threshold can cover all four. The measurement this
// replaced divided by palm length, where a pinky is a quarter shorter than a middle finger
// and had two and a half times less room above the threshold.
describe('fingerExtension', () => {
  it('reads the same for a short finger as for a long one', () => {
    for (const curl of [0, 0.3, 0.6, 1]) {
      const hand = makeHand({ thumb: false, index: curl, middle: curl, ring: curl, pinky: curl })
      const readings = HINGED_FINGERS.map((finger) => fingerExtension(hand, finger))

      for (const reading of readings) {
        expect(reading, `curl ${curl}`).toBeCloseTo(readings[0]!, 6)
      }
    }
  })

  it('separates a pinned finger from an extended one, on the pinky, at any angle', () => {
    for (let tilt = -60; tilt <= 60; tilt += 20) {
      for (const pitch of [0, 30, -30, 55]) {
        for (const scale of [0.08, 0.25, 0.4]) {
          const where = `${tilt}/${pitch} ×${scale}`
          const pinky = HINGED_FINGERS[3]!
          expect(pinky.name).toBe('pinky')

          const out = fingerExtension(makeHand(GESTURES.koza, { tilt, pitch, scale }), pinky)
          const pinned = fingerExtension(
            makeHand({ thumb: false, index: 0, middle: 0, ring: 0, pinky: 0.6 }, { tilt, pitch, scale }),
            pinky,
          )

          expect(out, `pinky out @ ${where}`).toBeGreaterThan(defaultConfig.gesture.extendedProjection)
          expect(pinned, `pinky pinned @ ${where}`).toBeLessThan(defaultConfig.gesture.extendedProjection)
        }
      }
    }
  })

  it('falls as a finger closes, and is well under the threshold once it is', () => {
    const index = HINGED_FINGERS[0]!
    const reading = (curl: number) =>
      fingerExtension(makeHand({ thumb: false, index: curl, middle: 0, ring: 0, pinky: 0 }), index)

    let previous = Infinity
    for (const curl of [0, 0.2, 0.4, 0.6, 0.8]) {
      const value = reading(curl)
      expect(value, `curl ${curl}`).toBeLessThan(previous)
      previous = value
    }

    // A tight fist curls the tip back under its own knuckle, so the reading turns up again
    // slightly at the very end. It is far below the threshold either way, and monotonicity
    // out there is not a property worth claiming.
    expect(reading(1)).toBeLessThan(0)
  })

  // Alex's camera, three fingers held up, pinky dropped: the pinky read 0.88 against a 0.85
  // threshold and counted as raised, so three fingers played as four. The finger was folded
  // at its base and straight along its length, which the measurement then in use — how
  // straight is this finger — is blind to by construction. Asking which way it points sees it.
  it('reads a straight finger dropped at its base as down', () => {
    const pinky = HINGED_FINGERS[3]!
    expect(pinky.name).toBe('pinky')

    for (let tilt = -50; tilt <= 50; tilt += 25) {
      for (const pitch of [0, 30, -30]) {
        const hand = makeHand(HARD_GESTURES.threeStraightPinky, { tilt, pitch })
        expect(fingerExtension(hand, pinky), `${tilt}/${pitch}`).toBeLessThan(
          defaultConfig.gesture.extendedProjection,
        )
        expect(fingerMask(hand, defaultConfig), `${tilt}/${pitch}`).toBe(INDEX | MIDDLE | RING)
      }
    }
  })

  it('returns zero rather than throwing on missing landmarks', () => {
    expect(fingerExtension([], HINGED_FINGERS[0]!)).toBe(0)
  })
})

describe('fingerReach', () => {
  it('puts every extended finger above the threshold and every folded one below', () => {
    const threshold = defaultConfig.gesture.extendedProjection

    for (const name of ALL_GESTURES) {
      const fingers = EVERY[name]!
      const reach = fingerReach(makeHand(fingers))

      for (const finger of ['index', 'middle', 'ring', 'pinky'] as const) {
        const value = reach[finger]!
        const curl = fingers[finger]
        // Straight fingers are 0; everything else in the fixtures is folded far enough to
        // be down, whether by curling or by dropping at the base.
        if (curl === 0) expect(value, `${name}.${finger}`).toBeGreaterThan(threshold)
        else expect(value, `${name}.${finger}`).toBeLessThan(threshold)
      }
    }
  })

  it('reports the thumb as an angle, not an extension', () => {
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
