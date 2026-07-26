/**
 * Every number that has to be found by feel rather than derived.
 *
 * Distances are expressed in *hand units* — multiples of the wrist-to-middle-knuckle
 * span — so thresholds hold whether the hand is near the camera or far from it.
 * Angles are degrees from vertical, positive clockwise on screen.
 *
 * The tuning panel mutates this object live and persists it to localStorage.
 */
export type Config = {
  gesture: {
    /** A finger counts as extended when its tip is this much further from the wrist
     *  than its middle joint. Above 1 so a slightly curled finger reads as folded. */
    extendedRatio: number
    /** The thumb folds across a different axis, so it is judged by how far its tip sits
     *  from the pinky knuckle, in hand units. */
    thumbSpread: number
    /** Frames a new hand shape must persist before it takes effect. At ~30 fps this is
     *  the delay between moving your fingers and hearing it. */
    stabilityFrames: number
    /** Frames the right hand may go missing before the sound fades out. Tracking drops
     *  the odd frame; without this tolerance those blink through as dropouts. This is a
     *  safety net, not the gate — the gate is the left fist. */
    handLostFrames: number
  }
  quality: {
    /** Below this tilt the chord is major. */
    majorBelowDeg: number
    /** Above this tilt it is minor. The gap between the two is hysteresis — without it
     *  a hand held near the boundary flickers between major and minor. */
    minorAboveDeg: number
  }
  distortion: {
    /** Left-hand tilt mapped onto 0..1 distortion. */
    minDeg: number
    maxDeg: number
  }
  volume: {
    /** Wrist height mapped onto 0..1, as a fraction of frame height. Insets from the
     *  very top and bottom, where tracking is least reliable. */
    topY: number
    bottomY: number
  }
  smoothing: {
    /** Exponential moving average weight for continuous controls, 0..1. Lower is
     *  smoother but laggier. */
    alpha: number
    /** Seconds to ramp audio parameters, long enough to avoid zipper noise. */
    rampSeconds: number
    /** Seconds to glide between scale degrees. */
    glideSeconds: number
    /** Seconds to fade in and out when the gate opens or closes. */
    gateFadeSeconds: number
  }
  music: {
    /** Tonic of the scale the seven degrees are built on. */
    root: string
    /** Semitones from the root for degrees I..VII. Major scale by default. */
    scale: readonly number[]
  }
  vision: {
    minHandDetectionConfidence: number
    minHandPresenceConfidence: number
    minTrackingConfidence: number
  }
}

export const defaultConfig: Config = {
  gesture: {
    extendedRatio: 1.12,
    thumbSpread: 1.0,
    stabilityFrames: 3,
    handLostFrames: 8,
  },
  quality: {
    majorBelowDeg: 20,
    minorAboveDeg: 30,
  },
  distortion: {
    minDeg: 0,
    maxDeg: 55,
  },
  volume: {
    topY: 0.15,
    bottomY: 0.85,
  },
  smoothing: {
    alpha: 0.25,
    rampSeconds: 0.05,
    glideSeconds: 0.05,
    gateFadeSeconds: 0.18,
  },
  music: {
    root: 'C3',
    scale: [0, 2, 4, 5, 7, 9, 11],
  },
  vision: {
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },
}

const STORAGE_KEY = 'gesture-synth.config'

/** Deep-merges stored overrides onto the defaults, so a config saved by an older build
 *  never leaves a newly added key undefined. */
export function loadConfig(): Config {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return structuredClone(defaultConfig)

  try {
    const stored = JSON.parse(raw) as Partial<Config>
    const merged = structuredClone(defaultConfig)
    for (const key of Object.keys(merged) as (keyof Config)[]) {
      Object.assign(merged[key], stored[key] ?? {})
    }
    return merged
  } catch {
    return structuredClone(defaultConfig)
  }
}

export function saveConfig(config: Config): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}
