import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config'
import { distortionAmount, heightFraction, tiltDegrees, tiltMagnitude } from './angles'
import { GESTURES, makeHand } from './testHands'

describe('tiltDegrees', () => {
  it('reads zero for an upright hand', () => {
    expect(tiltDegrees(makeHand(GESTURES.open))).toBeCloseTo(0, 6)
  })

  it('reports the angle the hand was rotated by', () => {
    for (const tilt of [-90, -45, -20, 0, 15, 30, 60, 90]) {
      expect(tiltDegrees(makeHand(GESTURES.open, { tilt }))).toBeCloseTo(tilt, 6)
    }
  })

  it('is unaffected by which fingers are up', () => {
    const open = tiltDegrees(makeHand(GESTURES.open, { tilt: 35 }))
    const fist = tiltDegrees(makeHand(GESTURES.fist, { tilt: 35 }))
    expect(fist).toBeCloseTo(open, 6)
  })

  it('is unaffected by distance from the camera', () => {
    const near = tiltDegrees(makeHand(GESTURES.open, { tilt: 42, scale: 0.4 }))
    const far = tiltDegrees(makeHand(GESTURES.open, { tilt: 42, scale: 0.08 }))
    expect(far).toBeCloseTo(near, 6)
  })

  it('returns zero rather than throwing on missing landmarks', () => {
    expect(tiltDegrees([])).toBe(0)
  })
})

describe('tiltMagnitude', () => {
  it('ignores which way the hand leans', () => {
    expect(tiltMagnitude(makeHand(GESTURES.open, { tilt: -37 }))).toBeCloseTo(37, 6)
    expect(tiltMagnitude(makeHand(GESTURES.open, { tilt: 37 }))).toBeCloseTo(37, 6)
  })
})

describe('heightFraction', () => {
  const { topY, bottomY } = defaultConfig.volume

  it('is 1 at the top of the usable band and 0 at the bottom', () => {
    const high = makeHand(GESTURES.open, { center: { x: 0.5, y: topY } })
    const low = makeHand(GESTURES.open, { center: { x: 0.5, y: bottomY } })
    expect(heightFraction(high, defaultConfig)).toBeCloseTo(1, 6)
    expect(heightFraction(low, defaultConfig)).toBeCloseTo(0, 6)
  })

  it('clamps rather than running past 0 and 1 outside the band', () => {
    const aboveFrame = makeHand(GESTURES.open, { center: { x: 0.5, y: -0.3 } })
    const belowFrame = makeHand(GESTURES.open, { center: { x: 0.5, y: 1.4 } })
    expect(heightFraction(aboveFrame, defaultConfig)).toBe(1)
    expect(heightFraction(belowFrame, defaultConfig)).toBe(0)
  })

  it('rises as the hand rises', () => {
    const readings = [0.8, 0.6, 0.4, 0.2].map((y) =>
      heightFraction(makeHand(GESTURES.open, { center: { x: 0.5, y } }), defaultConfig),
    )
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i]!).toBeGreaterThan(readings[i - 1]!)
    }
  })
})

describe('distortionAmount', () => {
  it('is silent-clean with an upright hand and full at the far end of the range', () => {
    expect(distortionAmount(makeHand(GESTURES.three), defaultConfig)).toBeCloseTo(0, 6)

    const beyond = makeHand(GESTURES.three, { tilt: defaultConfig.distortion.maxDeg + 20 })
    expect(distortionAmount(beyond, defaultConfig)).toBe(1)
  })

  it('rises with tilt in either direction', () => {
    const left = distortionAmount(makeHand(GESTURES.three, { tilt: -28 }), defaultConfig)
    const right = distortionAmount(makeHand(GESTURES.three, { tilt: 28 }), defaultConfig)
    const upright = distortionAmount(makeHand(GESTURES.three, { tilt: 0 }), defaultConfig)

    expect(left).toBeCloseTo(right, 6)
    expect(left).toBeGreaterThan(upright)
  })

  it('never leaves 0..1', () => {
    for (let tilt = -180; tilt <= 180; tilt += 5) {
      const amount = distortionAmount(makeHand(GESTURES.three, { tilt }), defaultConfig)
      expect(amount).toBeGreaterThanOrEqual(0)
      expect(amount).toBeLessThanOrEqual(1)
    }
  })
})
