/**
 * Where a calibration lives between sessions.
 *
 * Kept out of the config object and in its own key: the config is a couple of dozen numbers
 * a person might reasonably read, and a model is thousands they never would. Mixing them
 * would also mean "Reset to defaults" quietly threw away a calibration, which is not what
 * anybody pressing it is asking for.
 */
import { MODEL_VERSION, type GestureModel } from './classifier'

/** One model per role rather than one shared between them — see gesture/features.ts for
 *  why a left hand cannot simply borrow a right hand's. */
export type Calibration = {
  right: GestureModel | null
  left: GestureModel | null
}

export const EMPTY_CALIBRATION: Calibration = { right: null, left: null }

const STORAGE_KEY = 'gesture-synth.calibration'

function usable(model: unknown): model is GestureModel {
  if (model === null || typeof model !== 'object') return false
  const candidate = model as GestureModel
  return candidate.version === MODEL_VERSION && Array.isArray(candidate.classes)
}

/** Anything saved by an older build, or anything that does not look like a model, is
 *  dropped rather than half-trusted — the rules are a working fallback, and a subtly wrong
 *  model would be far harder to notice than none at all. */
export function loadCalibration(): Calibration {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return { ...EMPTY_CALIBRATION }

  try {
    const stored = JSON.parse(raw) as Partial<Calibration>
    return {
      right: usable(stored.right) ? stored.right : null,
      left: usable(stored.left) ? stored.left : null,
    }
  } catch {
    return { ...EMPTY_CALIBRATION }
  }
}

export function saveCalibration(calibration: Calibration): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration))
}

export function clearCalibration(): void {
  localStorage.removeItem(STORAGE_KEY)
}
