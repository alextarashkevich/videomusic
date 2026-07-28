import { describe, expect, it } from 'vitest'
import { DEGREE_BY_MASK, shapedFingers } from '../gesture/interpret'
import { FINGER_BIT } from '../gesture/landmarks'
import { HAND_ORDER, inHandOrder, maskForDegree, maskForDensity, type HandRole } from './handIcon'

const { THUMB, INDEX, MIDDLE, RING } = FINGER_BIT

describe('hand order', () => {
  /**
   * Got backwards twice, so it is written down as a test rather than left to be re-derived.
   *
   * The camera picture is flipped, so the player's left hand — the shaping one — appears on
   * the left of the screen. A panel that lists them the other way round makes you cross your
   * arms mentally every time you glance between it and your own hands.
   */
  it('puts the shaping hand on the left and the chord hand on the right', () => {
    expect([...HAND_ORDER]).toEqual(['shaping', 'chord'])
  })

  it('sorts a pair whichever way round it was given', () => {
    const chord = { role: 'chord' as HandRole, id: 'c' }
    const shaping = { role: 'shaping' as HandRole, id: 's' }

    expect(inHandOrder([chord, shaping]).map((hand) => hand.id)).toEqual(['s', 'c'])
    expect(inHandOrder([shaping, chord]).map((hand) => hand.id)).toEqual(['s', 'c'])
  })

  it('leaves the caller’s array alone', () => {
    const hands = [{ role: 'chord' as HandRole }, { role: 'shaping' as HandRole }]
    inHandOrder(hands)
    expect(hands[0]?.role).toBe('chord')
  })
})

describe('maskForDegree', () => {
  // Every degree the instrument plays must have a shape, or the guide would show a blank
  // hand for a chord it is asking for.
  it('finds a shape for all seven degrees', () => {
    for (let degree = 1; degree <= 7; degree++) {
      expect(maskForDegree(degree, DEGREE_BY_MASK), `degree ${degree}`).toBeGreaterThan(0)
    }
  })

  it('round-trips through the gesture table', () => {
    for (const [mask, degree] of DEGREE_BY_MASK) {
      expect(maskForDegree(degree, DEGREE_BY_MASK)).toBe(mask)
    }
  })

  it('draws nothing recognisable for a degree that does not exist', () => {
    expect(maskForDegree(99, DEGREE_BY_MASK)).toBe(0)
  })
})

describe('maskForDensity', () => {
  it('shows one finger per voicing, counting up from the index', () => {
    expect(shapedFingers(maskForDensity(1, false))).toBe(INDEX)
    expect(shapedFingers(maskForDensity(2, false))).toBe(INDEX | MIDDLE)
    expect(shapedFingers(maskForDensity(3, false))).toBe(INDEX | MIDDLE | RING)
  })

  // The thumb is the whole difference between major and minor on this hand, so the picture
  // has to carry it — and it must not change the finger count, which is the voicing.
  it('adds the thumb for major without changing the count', () => {
    for (const density of [1, 2, 3]) {
      const major = maskForDensity(density, true)
      const minor = maskForDensity(density, false)

      expect(major & THUMB, `density ${density}`).toBeGreaterThan(0)
      expect(minor & THUMB, `density ${density}`).toBe(0)
      expect(shapedFingers(major), `density ${density}`).toBe(shapedFingers(minor))
    }
  })

  it('does not run off the end of the hand', () => {
    expect(shapedFingers(maskForDensity(9, false))).toBe(INDEX | MIDDLE | RING)
  })
})
