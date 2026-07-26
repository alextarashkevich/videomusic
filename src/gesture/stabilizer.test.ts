import { describe, expect, it } from 'vitest'
import { createLatch, createSmoother, createStabilizer } from './stabilizer'

describe('createStabilizer', () => {
  it('holds its initial value until a reading has repeated enough times', () => {
    const stabilizer = createStabilizer<string>('start')

    expect(stabilizer.push('next', 3)).toBe('start')
    expect(stabilizer.push('next', 3)).toBe('start')
    expect(stabilizer.push('next', 3)).toBe('next')
  })

  // The core claim: brushing past a valid gesture on the way to another one must not
  // commit it. Going from one finger to three passes through two, which is itself a
  // real gesture — only the stability requirement keeps it from sounding.
  it('ignores a gesture passed through on the way to another', () => {
    const stabilizer = createStabilizer<number>()
    const frames = 3

    for (let i = 0; i < 5; i++) stabilizer.push(1, frames)
    expect(stabilizer.value).toBe(1)

    // Two frames of the in-between shape — less than the hand takes to settle.
    stabilizer.push(2, frames)
    stabilizer.push(2, frames)
    expect(stabilizer.value).toBe(1)

    for (let i = 0; i < 5; i++) stabilizer.push(3, frames)
    expect(stabilizer.value).toBe(3)
  })

  it('holds the last value while readings are null', () => {
    const stabilizer = createStabilizer<string>()
    for (let i = 0; i < 3; i++) stabilizer.push('held', 3)

    for (let i = 0; i < 50; i++) expect(stabilizer.push(null, 3)).toBe('held')
  })

  it('restarts the count when a run of readings is interrupted', () => {
    const stabilizer = createStabilizer<string>()

    stabilizer.push('a', 3)
    stabilizer.push('a', 3)
    stabilizer.push('b', 3)
    stabilizer.push('a', 3)
    stabilizer.push('a', 3)
    expect(stabilizer.value).toBeNull()

    stabilizer.push('a', 3)
    expect(stabilizer.value).toBe('a')
  })

  it('commits immediately when only one frame is required', () => {
    const stabilizer = createStabilizer<string>()
    expect(stabilizer.push('now', 1)).toBe('now')
  })

  it('follows a threshold changed between frames', () => {
    const stabilizer = createStabilizer<string>()

    stabilizer.push('x', 10)
    stabilizer.push('x', 10)
    expect(stabilizer.value).toBeNull()

    // The tuning panel lowers the requirement mid-performance.
    expect(stabilizer.push('x', 3)).toBe('x')
  })

  it('returns to its initial value on reset', () => {
    const stabilizer = createStabilizer<string>('initial')
    for (let i = 0; i < 5; i++) stabilizer.push('changed', 2)
    stabilizer.reset()
    expect(stabilizer.value).toBe('initial')
  })
})

describe('createSmoother', () => {
  it('takes its first sample whole instead of sliding up from the initial value', () => {
    const smoother = createSmoother(0)
    expect(smoother.push(0.8, 0.25)).toBe(0.8)
  })

  it('converges on a held value', () => {
    const smoother = createSmoother(0)
    smoother.push(0, 0.25)
    for (let i = 0; i < 200; i++) smoother.push(1, 0.25)
    expect(smoother.value).toBeCloseTo(1, 6)
  })

  it('damps a spike instead of passing it through', () => {
    const smoother = createSmoother(0)
    smoother.push(0.5, 0.25)
    expect(smoother.push(1, 0.25)).toBeCloseTo(0.625, 6)
  })

  it('moves faster at a higher alpha', () => {
    const slow = createSmoother(0)
    const fast = createSmoother(0)
    slow.push(0, 0.1)
    fast.push(0, 0.1)

    for (let i = 0; i < 5; i++) {
      slow.push(1, 0.1)
      fast.push(1, 0.5)
    }
    expect(fast.value).toBeGreaterThan(slow.value)
  })
})

describe('createLatch', () => {
  it('switches on above the high threshold and off below the low one', () => {
    const latch = createLatch()
    expect(latch.push(35, 20, 30)).toBe(true)
    expect(latch.push(10, 20, 30)).toBe(false)
  })

  it('holds its state inside the dead band', () => {
    const latch = createLatch()

    latch.push(35, 20, 30)
    expect(latch.push(25, 20, 30)).toBe(true)

    latch.push(5, 20, 30)
    expect(latch.push(25, 20, 30)).toBe(false)
  })

  // Without the dead band, a hand held right at the boundary flips many times a second.
  it('does not flip when a reading jitters around the boundary', () => {
    const latch = createLatch()
    latch.push(0, 20, 30)

    const flips: boolean[] = []
    let previous = latch.value
    for (const reading of [24, 26, 25, 27, 24, 26, 25, 23, 26, 24]) {
      const next = latch.push(reading, 20, 30)
      if (next !== previous) flips.push(next)
      previous = next
    }

    expect(flips).toEqual([])
  })
})
