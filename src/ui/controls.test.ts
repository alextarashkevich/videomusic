import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config'
import { CONTROLS, repairConfig } from './controls'

describe('repairConfig', () => {
  // The failure that prompted this: a stored extension threshold of 1.27 — above 1.0, which
  // the measurement can never reach — so every finger read as folded, no gesture ever
  // matched, the chord held for ever, and the slider could not reach the value to correct
  // it because the value was outside the slider's own range.
  it('puts a threshold that no finger could ever pass back to the default', () => {
    const config = structuredClone(defaultConfig)
    config.gesture.extendedProjection = 1.27

    repairConfig(config)

    expect(config.gesture.extendedProjection).toBe(defaultConfig.gesture.extendedProjection)
  })

  // Clamping instead of resetting lands on the strictest setting the slider allows, which
  // for a threshold is very nearly the same failure it was rescuing from.
  it('does not merely clamp to the nearest bound', () => {
    const config = structuredClone(defaultConfig)
    const control = CONTROLS.find((entry) => entry.label === 'Finger extension')!
    config.gesture.extendedProjection = 1.27

    repairConfig(config)

    expect(config.gesture.extendedProjection).not.toBe(control.max)
  })

  it('leaves anything a person could actually have set alone', () => {
    const config = structuredClone(defaultConfig)
    config.gesture.thumbAngleDeg = 16
    config.quality.minorBelowDeg = 15
    config.gesture.extendedProjection = 0.7

    repairConfig(config)

    expect(config.gesture.thumbAngleDeg).toBe(16)
    expect(config.quality.minorBelowDeg).toBe(15)
    expect(config.gesture.extendedProjection).toBe(0.7)
  })

  it('repairs anything that is not a number at all', () => {
    const config = structuredClone(defaultConfig)
    config.smoothing.alpha = Number.NaN
    config.volume.floor = Number.POSITIVE_INFINITY

    repairConfig(config)

    expect(config.smoothing.alpha).toBe(defaultConfig.smoothing.alpha)
    expect(config.volume.floor).toBe(defaultConfig.volume.floor)
  })

  // Every default has to be reachable from its own slider, or the panel shows one number
  // while the instrument uses another the moment anything is dragged.
  it('finds every default already inside its control’s range', () => {
    const config = structuredClone(defaultConfig)
    repairConfig(config)
    expect(config).toEqual(defaultConfig)
  })
})
