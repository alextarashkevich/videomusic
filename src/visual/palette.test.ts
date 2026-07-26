import { describe, expect, it } from 'vitest'
import type { ScaleDegree } from '../types'
import { approach, approachHue, hueDelta, hueForDegree, wrapHue } from './palette'

const DEGREES: ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7]

describe('hueForDegree', () => {
  it('stays inside the colour wheel', () => {
    for (const degree of DEGREES) {
      const hue = hueForDegree(degree)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(1)
    }
  })

  it('gives every degree a visibly different colour', () => {
    const hues = DEGREES.map(hueForDegree)
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(Math.abs(hueDelta(hues[i]!, hues[j]!))).toBeGreaterThan(0.05)
      }
    }
  })

  it('does not bring the seventh back round to the tonic', () => {
    expect(Math.abs(hueDelta(hueForDegree(1), hueForDegree(7)))).toBeGreaterThan(0.1)
  })
})

describe('wrapHue', () => {
  it('brings any value into 0..1', () => {
    for (const value of [-2.3, -0.25, 0, 0.5, 1, 1.75, 4.2]) {
      const wrapped = wrapHue(value)
      expect(wrapped).toBeGreaterThanOrEqual(0)
      expect(wrapped).toBeLessThan(1)
    }
  })

  it('maps negatives onto the far side of the wheel', () => {
    expect(wrapHue(-0.25)).toBeCloseTo(0.75, 9)
  })
})

describe('hueDelta', () => {
  it('takes the short way across the wrap point', () => {
    expect(hueDelta(0.95, 0.05)).toBeCloseTo(0.1, 9)
    expect(hueDelta(0.05, 0.95)).toBeCloseTo(-0.1, 9)
  })

  it('never asks for more than half a turn', () => {
    for (let from = 0; from < 1; from += 0.05) {
      for (let to = 0; to < 1; to += 0.05) {
        expect(Math.abs(hueDelta(from, to))).toBeLessThanOrEqual(0.5 + 1e-9)
      }
    }
  })

  it('is zero between a hue and itself', () => {
    expect(hueDelta(0.3, 0.3)).toBeCloseTo(0, 9)
  })
})

describe('approachHue', () => {
  it('converges on the target', () => {
    let hue = 0.9
    for (let i = 0; i < 300; i++) hue = approachHue(hue, 0.1, 0.1)
    expect(hueDelta(hue, 0.1)).toBeCloseTo(0, 6)
  })

  // Naive interpolation from 0.95 to 0.05 sweeps backwards through the whole spectrum.
  it('crosses the wrap point without touring the rest of the wheel', () => {
    let hue = 0.95
    const visited: number[] = []
    for (let i = 0; i < 40; i++) {
      hue = approachHue(hue, 0.05, 0.2)
      visited.push(hue)
    }

    // Everything on the short path is either just under 1 or just over 0.
    for (const value of visited) {
      expect(value > 0.9 || value < 0.1).toBe(true)
    }
  })

  it('stays in range throughout', () => {
    let hue = 0.5
    for (const target of [0.99, 0.01, 0.4, 0.8]) {
      for (let i = 0; i < 30; i++) {
        hue = approachHue(hue, target, 0.15)
        expect(hue).toBeGreaterThanOrEqual(0)
        expect(hue).toBeLessThan(1)
      }
    }
  })
})

describe('approach', () => {
  it('converges without overshooting', () => {
    let value = 0
    for (let i = 0; i < 200; i++) value = approach(value, 1, 0.1)
    expect(value).toBeCloseTo(1, 6)
    expect(value).toBeLessThanOrEqual(1)
  })
})
