import { describe, expect, it } from 'vitest'
import type { PerformanceState } from '../types'
import { createTransitionLog, spell } from './transitions'

function state(over: Partial<PerformanceState> = {}): PerformanceState {
  return { gate: true, degree: 1, quality: 'major', density: 3, tilt: 0, volume: 0.7, ...over }
}

/** Feeds a script of [state, time] and closes anything still open. */
function play(script: [PerformanceState, number][]) {
  const log = createTransitionLog()
  for (const [next, at] of script) log.push(next, at)
  const last = script[script.length - 1]?.[1] ?? 0
  log.push(state({ degree: null }), last + 10_000)
  log.flush(last + 10_000)
  return log
}

describe('transition log', () => {
  it('records nothing while the chord is held', () => {
    const log = createTransitionLog()
    for (let at = 0; at < 3000; at += 33) log.push(state(), at)
    log.flush(3000)
    expect(log.transitions).toEqual([])
  })

  /**
   * The case that needs no fixing: both hands read on the same frame. A span of zero means
   * nothing unintended was ever played, and no amount of debouncing would improve it.
   */
  it('gives a clean change a span of zero and nothing passed through', () => {
    const log = play([
      [state({ degree: 1, quality: 'major' }), 0],
      [state({ degree: 6, quality: 'minor' }), 100],
      [state({ degree: 6, quality: 'minor' }), 600],
    ])

    const [first] = log.transitions
    expect(first?.spanMs).toBe(0)
    expect(first?.through).toEqual([])
    expect(first?.from).toBe('1/3')
    expect(first?.to).toBe('6m/3')
  })

  /**
   * The case the whole thing exists to measure: C to A minor with the chord hand arriving
   * first, so A *major* sounds for 120 ms on the way past.
   */
  it('measures the gap when one hand lands before the other', () => {
    const log = play([
      [state({ degree: 1, quality: 'major' }), 0],
      [state({ degree: 6, quality: 'major' }), 100],
      [state({ degree: 6, quality: 'minor' }), 220],
      [state({ degree: 6, quality: 'minor' }), 700],
    ])

    const [first] = log.transitions
    expect(first?.spanMs).toBe(120)
    expect(first?.order).toEqual(['degree', 'quality'])
    expect(first?.through).toEqual(['6/3'])
  })

  it('reads the same gap the other way round', () => {
    const log = play([
      [state({ degree: 1, quality: 'major' }), 0],
      [state({ degree: 1, quality: 'minor' }), 100],
      [state({ degree: 6, quality: 'minor' }), 190],
      [state({ degree: 6, quality: 'minor' }), 700],
    ])

    const [first] = log.transitions
    expect(first?.spanMs).toBe(90)
    expect(first?.order).toEqual(['quality', 'degree'])
    expect(first?.through).toEqual(['1m/3'])
  })

  /**
   * A move that ends where it began is recognition flicker, not two hands failing to agree.
   * It is recorded — a wrong chord really did sound — but marked, because it has a different
   * cause and a different fix, and averaging the two together would produce a number that
   * describes neither.
   */
  it('marks a wobble back to where it started rather than calling it a change', () => {
    const log = play([
      [state({ degree: 1 }), 0],
      [state({ degree: 2 }), 100],
      [state({ degree: 1 }), 150],
      [state({ degree: 1 }), 700],
    ])

    const [first] = log.transitions
    expect(first?.wobble).toBe(true)
    expect(first?.through).toEqual(['2/3'])
    expect(log.summary()).toContain('wobbles 1')
  })

  it('keeps wobbles out of the span statistics', () => {
    const log = play([
      // A wobble with a long span, which would drag the median if it were counted.
      [state({ degree: 1 }), 0],
      [state({ degree: 2 }), 100],
      [state({ degree: 1 }), 500],
      [state({ degree: 1 }), 1000],
      // A real change with a short one.
      [state({ degree: 4, quality: 'major' }), 1700],
      [state({ degree: 4, quality: 'minor' }), 1740],
      [state({ degree: 4, quality: 'minor' }), 2300],
    ])

    expect(log.transitions.filter((t) => t.wobble)).toHaveLength(1)
    expect(log.summary()).toContain('changes   1')
    expect(log.summary()).toContain('span med  40')
  })

  // Two chords played one after the other are two transitions, not one long one.
  it('closes a move once the chord has been still long enough', () => {
    const log = play([
      [state({ degree: 1 }), 0],
      [state({ degree: 2 }), 100],
      [state({ degree: 2 }), 700],
      [state({ degree: 4 }), 1400],
      [state({ degree: 4 }), 2000],
    ])

    expect(log.transitions).toHaveLength(2)
    expect(log.transitions.map((t) => t.to)).toEqual(['2/3', '4/3'])
  })

  it('counts the mute as a chord of its own', () => {
    expect(spell({ gate: false, degree: 1, quality: 'major', density: 3 })).toBe('muted')
    expect(spell({ gate: true, degree: 6, quality: 'minor', density: 2 })).toBe('6m/2')
  })

  it('summarises what it has seen', () => {
    const log = play([
      [state({ degree: 1 }), 0],
      [state({ degree: 6, quality: 'major' }), 100],
      [state({ degree: 6, quality: 'minor' }), 240],
      [state({ degree: 6, quality: 'minor' }), 800],
    ])

    const summary = log.summary()
    expect(summary).toContain('changes')
    expect(summary).toContain('140')
    expect(summary).toContain('wrong chord 100%')
  })

  it('says so plainly before anything has happened', () => {
    expect(createTransitionLog().summary()).toContain('none yet')
  })
})
