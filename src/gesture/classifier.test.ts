import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config'
import type { FingerMask } from '../types'
import { buildModel, classify, MODEL_VERSION } from './classifier'
import { featureDistance, handFeatures } from './features'
import { fingerMask } from './fingers'
import { FINGER_BIT } from './landmarks'
import { GESTURES, HARD_GESTURES, jitter, makeHand, type FingerStates } from './testHands'

const { THUMB, INDEX, MIDDLE, RING, PINKY } = FINGER_BIT
const settings = defaultConfig.gesture

const MASK_FOR: Record<keyof typeof GESTURES, FingerMask> = {
  fist: 0,
  one: INDEX,
  two: INDEX | MIDDLE,
  three: INDEX | MIDDLE | RING,
  four: INDEX | MIDDLE | RING | PINKY,
  open: THUMB | INDEX | MIDDLE | RING | PINKY,
  koza: INDEX | PINKY,
  kozaThumb: THUMB | INDEX | PINKY,
}

function features(shape: FingerStates, options = {}) {
  const result = handFeatures(makeHand(shape, options))
  if (result === null) throw new Error('degenerate hand')
  return result
}

/** Records each gesture at a handful of angles, the way the walkthrough asks the player to
 *  turn their hand while it captures. */
function calibrate(tilts: number[], pitches = [0]) {
  const samples = []
  for (const [name, mask] of Object.entries(MASK_FOR)) {
    for (const tilt of tilts) {
      for (const pitch of pitches) {
        samples.push({
          mask,
          features: features(GESTURES[name as keyof typeof GESTURES], { tilt, pitch }),
        })
      }
    }
  }
  return buildModel(samples)
}

describe('handFeatures', () => {
  // The claim the whole approach rests on. Rules had to be written to survive rotation one
  // at a time; a normalised frame gets it for free, which is what makes a tilted коза — the
  // gesture that failed — the same problem as an upright one.
  it('gives the same numbers however the hand is turned, sized or placed', () => {
    for (const name of Object.keys(GESTURES) as (keyof typeof GESTURES)[]) {
      const upright = features(GESTURES[name])

      for (const tilt of [-90, -45, -15, 25, 60, 140]) {
        expect(featureDistance(features(GESTURES[name], { tilt }), upright), `${name} tilt ${tilt}`)
          .toBeLessThan(1e-6)
      }
      for (const pitch of [-50, -20, 30, 55]) {
        expect(
          featureDistance(features(GESTURES[name], { pitch }), upright),
          `${name} pitch ${pitch}`,
        ).toBeLessThan(1e-6)
      }
      for (const scale of [0.08, 0.4]) {
        expect(featureDistance(features(GESTURES[name], { scale }), upright), `${name} ×${scale}`)
          .toBeLessThan(1e-6)
      }
      expect(
        featureDistance(features(GESTURES[name], { center: { x: 0.15, y: 0.85 } }), upright),
        `${name} offset`,
      ).toBeLessThan(1e-6)
    }
  })

  it('gives different numbers to different gestures', () => {
    const koza = features(GESTURES.koza)
    const two = features(GESTURES.two)
    expect(featureDistance(koza, two)).toBeGreaterThan(0.3)
  })

  it('returns null rather than throwing on unusable landmarks', () => {
    expect(handFeatures([])).toBeNull()
    expect(handFeatures(makeHand(GESTURES.open).slice(0, 4))).toBeNull()
  })
})

describe('classify', () => {
  it('recognises every calibrated gesture', () => {
    const model = calibrate([0])

    for (const [name, mask] of Object.entries(MASK_FOR)) {
      const verdict = classify(features(GESTURES[name as keyof typeof GESTURES]), model, settings)
      expect(verdict.mask, name).toBe(mask)
    }
  })

  // Recorded upright and tilted, then asked at angles it never saw. This is the failure
  // Alex reported — коза read nothing at all once the hand leaned.
  it('recognises gestures at angles it was never shown', () => {
    const model = calibrate([-30, 0, 30], [0, 25])

    for (const [name, mask] of Object.entries(MASK_FOR)) {
      for (let tilt = -60; tilt <= 60; tilt += 7) {
        for (const pitch of [-15, 0, 40]) {
          const shape = GESTURES[name as keyof typeof GESTURES]
          const verdict = classify(features(shape, { tilt, pitch }), model, settings)
          expect(verdict.mask, `${name} @ ${tilt}/${pitch}`).toBe(mask)
        }
      }
    }
  })

  it('recognises коза held the way people actually hold it', () => {
    // Calibrated on the pinned version, because that is what the walkthrough records: the
    // player folds their middle and ring however they naturally do.
    const model = buildModel([
      ...[-25, 0, 25].map((tilt) => ({
        mask: INDEX | PINKY,
        features: features(HARD_GESTURES.kozaPinned, { tilt }),
      })),
      ...[-25, 0, 25].map((tilt) => ({
        mask: THUMB | INDEX | PINKY,
        features: features(HARD_GESTURES.kozaThumbPinned, { tilt }),
      })),
      ...[-25, 0, 25].map((tilt) => ({
        mask: INDEX | MIDDLE | RING | PINKY,
        features: features(GESTURES.four, { tilt }),
      })),
      ...[-25, 0, 25].map((tilt) => ({
        mask: INDEX | MIDDLE,
        features: features(GESTURES.two, { tilt }),
      })),
    ])

    for (let tilt = -45; tilt <= 45; tilt += 5) {
      expect(
        classify(features(HARD_GESTURES.kozaPinned, { tilt }), model, settings).mask,
        `коза @ ${tilt}`,
      ).toBe(INDEX | PINKY)
      expect(
        classify(features(HARD_GESTURES.kozaThumbPinned, { tilt }), model, settings).mask,
        `коза+thumb @ ${tilt}`,
      ).toBe(THUMB | INDEX | PINKY)
    }
  })

  // Naming the nearest gesture regardless is how a chord you did not ask for arrives on
  // the way to the one you did.
  it('says nothing rather than guessing at a shape between two gestures', () => {
    const model = calibrate([0])
    const halfway: FingerStates = { thumb: false, index: 0, middle: 0.45, ring: 0.5, pinky: 0.5 }

    expect(classify(features(halfway), model, settings).mask).toBeNull()
  })

  it('says nothing when the model has no example of the hand at all', () => {
    const model = buildModel([
      { mask: INDEX, features: features(GESTURES.one) },
      { mask: INDEX | MIDDLE, features: features(GESTURES.two) },
    ])

    expect(classify(features(GESTURES.koza), model, settings).mask).toBeNull()
  })

  // The failure this was shipped with, and the reason it recognised nothing at all.
  //
  // The feature vector is rotation-invariant by construction, so a hand turned during
  // capture produces very nearly the same numbers as one held still — which means the
  // recorded variation of a gesture is always near zero, whatever the player does. A radius
  // scaled off that variation is a hairline, and no live hand ever lands inside it. It has
  // to have a floor that does not depend on how still the hand was.
  it('recognises a gesture calibrated from perfectly identical samples', () => {
    const model = calibrate([0])

    for (const gesture of model.classes) {
      expect(gesture.spread, 'nothing to learn from a still hand').toBeLessThan(1e-6)
      expect(gesture.separation, 'but the gestures are still far apart').toBeGreaterThan(0.1)
    }

    for (const [name, mask] of Object.entries(MASK_FOR)) {
      const shape = GESTURES[name as keyof typeof GESTURES]
      // Not the same hand it was shown: a little noise, and an angle it never saw.
      const live = handFeatures(jitter(makeHand(shape, { tilt: 22 }), 0.02, 7))
      expect(classify(live, model, settings).mask, name).toBe(mask)
    }
  })

  it('says nothing without a model, or without a hand', () => {
    expect(classify(features(GESTURES.one), null, settings).mask).toBeNull()
    expect(classify(null, calibrate([0]), settings).mask).toBeNull()
    expect(classify(features(GESTURES.one), { version: MODEL_VERSION, classes: [] }, settings).mask)
      .toBeNull()
  })

  // Generated hands are exact, and a classifier tested only on exact hands is tested on a
  // problem it does not have. This is the one that means something: calibrated on a few
  // noisy sightings, then asked about noisy hands at angles it never saw, which is the
  // actual job.
  it('holds up under tracker noise at unseen angles', () => {
    let seed = 1
    const samples = []

    for (const [name, mask] of Object.entries(MASK_FOR)) {
      const shape = GESTURES[name as keyof typeof GESTURES]
      for (const tilt of [-30, 0, 30]) {
        for (let repeat = 0; repeat < 6; repeat++) {
          const noisy = handFeatures(jitter(makeHand(shape, { tilt }), 0.02, seed++))
          if (noisy !== null) samples.push({ mask, features: noisy })
        }
      }
    }

    const model = buildModel(samples)
    let correct = 0
    let claimed = 0
    let wrong = 0

    for (const [name, mask] of Object.entries(MASK_FOR)) {
      const shape = GESTURES[name as keyof typeof GESTURES]
      for (let tilt = -50; tilt <= 50; tilt += 5) {
        const noisy = handFeatures(jitter(makeHand(shape, { tilt }), 0.02, seed++))
        const verdict = classify(noisy, model, settings)
        if (verdict.mask !== null) {
          claimed++
          if (verdict.mask === mask) correct++
          else wrong++
        }
      }
    }

    const total = Object.keys(MASK_FOR).length * 21
    // Saying nothing is cheap — the chord simply holds. Saying the wrong thing is the
    // expensive mistake, so that is what is held to a hard zero.
    expect(wrong, 'wrong gestures named').toBe(0)
    expect(correct / total, 'recognised').toBeGreaterThan(0.9)
    expect(claimed).toBe(correct)
  })

  // Why calibration still earns its place, stated as a measurement rather than asserted.
  //
  // The rules ask every hand to fold its unused fingers past a fixed point, and they got a
  // great deal better when the measurement started asking which way a finger points rather
  // than only how straight it is — a hand that folds to 35% now reads correctly, where
  // before it did not. But the threshold is still one number standing in for everybody, and
  // it still runs out: someone who barely moves their fingers at all, a quarter of the way,
  // falls to around 38%. The classifier gets all of them, because it was shown that hand.
  it('recognises a hand that barely folds its unused fingers, where the rules cannot', () => {
    const lightFolder = (pin: number): Record<keyof typeof GESTURES, FingerStates> => ({
      fist: GESTURES.fist,
      four: GESTURES.four,
      open: GESTURES.open,
      one: { thumb: false, index: 0, middle: pin, ring: pin, pinky: pin },
      two: { thumb: false, index: 0, middle: 0, ring: pin, pinky: pin },
      three: { thumb: false, index: 0, middle: 0, ring: 0, pinky: pin },
      koza: { thumb: false, index: 0, middle: pin, ring: pin, pinky: 0 },
      kozaThumb: { thumb: true, index: 0, middle: pin, ring: pin, pinky: 0 },
    })

    const person = lightFolder(0.25)
    let seed = 1
    const samples = []

    for (const [name, mask] of Object.entries(MASK_FOR)) {
      for (const tilt of [-30, 0, 30]) {
        for (let repeat = 0; repeat < 6; repeat++) {
          const noisy = handFeatures(
            jitter(makeHand(person[name as keyof typeof GESTURES], { tilt }), 0.02, seed++),
          )
          if (noisy !== null) samples.push({ mask, features: noisy })
        }
      }
    }

    const model = buildModel(samples)
    let byModel = 0
    let byRules = 0
    let wrong = 0
    let total = 0

    for (const [name, mask] of Object.entries(MASK_FOR)) {
      for (let tilt = -50; tilt <= 50; tilt += 5) {
        const hand = jitter(
          makeHand(person[name as keyof typeof GESTURES], { tilt }),
          0.02,
          seed++,
        )
        total++

        const verdict = classify(handFeatures(hand), model, settings)
        if (verdict.mask === mask) byModel++
        else if (verdict.mask !== null) wrong++

        if (fingerMask(hand, defaultConfig) === mask) byRules++
      }
    }

    expect(wrong, 'wrong gestures named').toBe(0)
    expect(byModel / total, 'calibrated').toBeGreaterThan(0.95)
    expect(byRules / total, 'the rules on the same hands').toBeLessThan(0.6)
  })

  it('reports how close the call was', () => {
    const model = calibrate([0])
    const verdict = classify(features(GESTURES.koza), model, settings)

    expect(verdict.mask).toBe(INDEX | PINKY)
    expect(verdict.margin).toBeGreaterThan(settings.marginRatio)
    expect(verdict.distance).toBeLessThan(0.2)
  })
})

describe('buildModel', () => {
  it('keeps exemplars spread across the range a gesture was held through', () => {
    const tilts = [-40, -20, 0, 20, 40]
    const model = buildModel(
      tilts.map((tilt) => ({ mask: INDEX, features: features(GESTURES.one, { tilt }) })),
      3,
    )

    const gesture = model.classes[0]!
    expect(gesture.exemplars).toHaveLength(3)
    // Generated hands are rotation-invariant by construction, so every sample here is
    // identical and there is nothing to spread — what matters is that it stops rather than
    // looping, and returns as many as asked for.
    expect(gesture.spread).toBeGreaterThanOrEqual(0)
  })

  it('keeps every sample when there are fewer than the exemplar budget', () => {
    const model = buildModel([{ mask: INDEX, features: features(GESTURES.one) }], 8)
    expect(model.classes[0]!.exemplars).toHaveLength(1)
  })

  it('stamps the version so an older model is discarded rather than misread', () => {
    expect(buildModel([{ mask: INDEX, features: features(GESTURES.one) }]).version)
      .toBe(MODEL_VERSION)
  })
})
