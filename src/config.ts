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
    /** How far a fingertip must sit from its own knuckle to count as extended, in hand
     *  widths. Measured from the knuckle rather than the middle joint because the joint
     *  moves outward as a finger curls, chasing the tip and hiding the difference. */
    extendedReach: number
    /** The thumb does not curl like the others, so it is judged by how far it is swung
     *  away from the line of the palm, in degrees. An angle between two directions on
     *  the same hand is unaffected by hand size, by rotation, or by what the other
     *  fingers are doing — none of which was true of the distance it replaced. */
    thumbAngleDeg: number
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
  tilt: {
    /** Left-hand wrist angle mapped onto 0..1. Drives the visuals; there is no audio
     *  effect on it at the moment. */
    minDeg: number
    maxDeg: number
  }
  volume: {
    /** Wrist height mapped onto 0..1, as a fraction of frame height. Insets from the
     *  very top and bottom, where tracking is least reliable. */
    topY: number
    bottomY: number
    /** Level at the bottom of the band. Above zero on purpose: dropping the hand should
     *  thin the sound, not end it. Silence belongs to the fist, which is deliberate and
     *  can be held — a hand at the bottom of frame is neither. */
    floor: number
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
  sound: {
    /** Name of the synth preset — see audio/presets.ts. */
    preset: string
  }
  vision: {
    minHandDetectionConfidence: number
    minHandPresenceConfidence: number
    minTrackingConfidence: number
    /** Exchanges which physical hand plays chords and which shapes them. Exists because
     *  which way round MediaPipe reports handedness is not reliably predictable — see
     *  vision/handTracker.ts. Flip it if the wrong hand is choosing notes. */
    swapHands: boolean
    /**
     * Measure hand shape from the tracker's 3D world coordinates rather than the flat
     * image.
     *
     * In principle this is the right input: depth is real there, so turning your hand
     * away from the camera cannot foreshorten a finger into reading as folded. In
     * practice the depth estimate is noisier than x and y, so if recognition gets
     * jumpier rather than steadier, turn it off and the flat measurement comes back.
     */
    use3d: boolean
  }
}

export const defaultConfig: Config = {
  gesture: {
    extendedReach: 0.45,
    thumbAngleDeg: 35,
    stabilityFrames: 2,
    handLostFrames: 8,
  },
  quality: {
    majorBelowDeg: 20,
    minorAboveDeg: 30,
  },
  tilt: {
    minDeg: 8,
    maxDeg: 55,
  },
  volume: {
    topY: 0.15,
    bottomY: 0.95,
    floor: 0.1,
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
  sound: {
    preset: 'Organ',
  },
  vision: {
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    swapHands: false,
    use3d: true,
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
