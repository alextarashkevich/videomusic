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
    /** How far out a finger must reach to count as up — how far its tip has travelled from
     *  its knuckle *in the direction that knuckle points*, over the finger's own bone
     *  lengths. See gesture/fingers.ts; asking which way a finger points rather than only
     *  how straight it is, is what stops a pinky dropped at its base from counting as
     *  raised. About 1.0 held out, near 0 folded away, negative in a fist. */
    extendedProjection: number
    /** The thumb does not curl like the others, so it is judged by how far it is swung
     *  away from the line of the palm, in degrees. An angle between two directions on
     *  the same hand is unaffected by hand size, by rotation, or by what the other
     *  fingers are doing — none of which was true of the distance it replaced. */
    thumbAngleDeg: number
    /** Camera frames a new hand shape must persist before it takes effect — directly, the
     *  delay between moving your fingers and hearing it. One frame is enough now that the
     *  shapes themselves are told apart cleanly; it was two to paper over a measurement
     *  that put коза and four fingers within a whisker of each other. */
    stabilityFrames: number
    /** Frames the right hand may go missing before the sound fades out. Tracking drops
     *  the odd frame; without this tolerance those blink through as dropouts. This is a
     *  safety net, not the gate — the gate is the left fist. */
    handLostFrames: number
    /** Calibrated recognition only. How far outside a gesture's own recorded spread a hand
     *  may sit and still be called that gesture. Lower is stricter: more shapes get called
     *  nothing at all, which means the chord holds rather than jumping somewhere wrong. */
    radiusFactor: number
    /** Calibrated recognition only. How much closer the best match must be than the second
     *  best before it is believed. At 1.0 it always commits to something; higher means it
     *  keeps quiet when two gestures look alike. */
    marginRatio: number
  }
  quality: {
    /**
     * Thumb on the *shaping* hand, in degrees off the palm. Out is major, tucked is minor.
     *
     * This used to be a lean of the chord hand, and it asked one hand to do two things at
     * once — where the second actively spoiled the first, because a rotated hand is a
     * harder hand for the tracker to read, exactly when it is being asked for a shape.
     * Putting the choice on the other hand separates them: the chord hand only ever has to
     * hold a shape square to the camera.
     */
    majorAboveDeg: number
    /** Below this the chord is minor. The gap between the two is hysteresis — without it a
     *  thumb resting near the boundary flickers the chord between major and minor several
     *  times a second. */
    minorBelowDeg: number
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
    /**
     * Seconds the whole chord must stand still before it is played.
     *
     * Changing chord rearranges both hands and they do not land together, so for a moment
     * the instrument is shown a chord nobody meant and plays it — C to A minor reads A
     * major on the way past. This is how long it waits to see whether the hands are
     * finished. Zero is the old behaviour exactly, which is what makes the slider an A/B
     * rather than a leap of faith.
     *
     * It is paid on every chord, so it trades directly against how responsive the
     * instrument feels; it is set in seconds rather than frames because the gap it waits
     * out is a property of hands, not of the camera's frame rate.
     */
    settleSeconds: number
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
     * Width the camera picture is shrunk to before the detector sees it, in pixels.
     *
     * The model resizes whatever it is given down to 192×192, so handing it the full
     * 1280×720 frame spends most of the per-frame cost uploading pixels that are discarded
     * a moment later. The picture on screen is unaffected — this is only what the detector
     * looks at. Set it at or above the camera's own width to turn it off; the `detect`
     * figure in the readout is how to tell whether it is earning its place.
     */
    inferenceWidth: number
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
    // Extended reads about 1.0 and folded lands at or below 0, whichever way it was folded,
    // so half way between them is a genuinely wide place to stand. The measurement this
    // replaced had 0.69 against 0.85 and no room at all.
    extendedProjection: 0.5,
    thumbAngleDeg: 35,
    stabilityFrames: 1,
    handLostFrames: 8,
    radiusFactor: 2.5,
    marginRatio: 1.15,
  },
  quality: {
    // Measured on Alex's camera: a tucked thumb reads about 25° and an out one about 39°,
    // so a single line at 30 sits between them. The two numbers being equal means no dead
    // band by default — a thumb parked exactly on the line can flicker, and widening them
    // apart in the tuning panel is the cure if it ever does.
    majorAboveDeg: 30,
    minorBelowDeg: 30,
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
    // Measured, not guessed. Over 61 chord changes on Alex's camera the median span from
    // the first hand landing to the last was 17 ms and half of them were zero — but the
    // tail ran to 300 ms and 51% of changes struck a chord that was never asked for. This
    // covers about two thirds of those — 21 of the 31 — and the rest of the tail runs out
    // to 400 ms, which costs more in feel than it buys back. Whether that last third is
    // worth the latency is a question for an ear, which is why it is a slider.
    settleSeconds: 0.12,
  },
  music: {
    root: 'C3',
    scale: [0, 2, 4, 5, 7, 9, 11],
  },
  sound: {
    preset: 'Clean synth',
  },
  vision: {
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    swapHands: false,
    inferenceWidth: 512,
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

    for (const group of Object.keys(merged) as (keyof Config)[]) {
      const saved = stored[group] as Record<string, unknown> | undefined
      if (saved === undefined) continue

      // Only settings this build still has, rather than everything that was ever written.
      // A key that has been renamed or dropped otherwise lives in localStorage for ever,
      // and a stale one carrying a value from when it meant something else is how a
      // threshold ends up somewhere nothing could have put it.
      const target = merged[group] as Record<string, unknown>
      for (const key of Object.keys(target)) {
        if (key in saved) target[key] = saved[key]
      }
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
