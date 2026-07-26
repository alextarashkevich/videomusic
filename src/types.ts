/** One of the 21 hand landmarks. x and y are normalised to [0,1] over the *raw*,
 *  unmirrored camera image. z is depth relative to the wrist. */
export type Landmark = { x: number; y: number; z: number }

/** Exactly 21 landmarks, in MediaPipe's canonical order — see LANDMARK in gesture/landmarks.ts. */
export type Landmarks = readonly Landmark[]

export type Hand = {
  landmarks: Landmarks
  /** Detector confidence, 0..1. */
  score: number
}

/** What the vision layer produces each frame: whichever of the user's hands are visible. */
export type HandFrame = {
  left: Hand | null
  right: Hand | null
}

/** Which fingers are extended, ordered [thumb, index, middle, ring, pinky].
 *  Encoded as a 5-bit number so gestures can be compared by identity rather than count —
 *  "коза" (index+pinky) and "two fingers" (index+middle) are both two fingers. */
export type FingerMask = number

export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type ChordQuality = 'major' | 'minor'
export type Density = 1 | 2 | 3

/** The single interface between seeing and hearing. The vision side produces it, the
 *  audio side consumes it, the visuals read it. Neither side knows about the other. */
export type PerformanceState = {
  /** False while the left hand is a fist. The synth fades out rather than cutting. */
  gate: boolean
  /** Null only before the first recognised right-hand gesture. */
  degree: ScaleDegree | null
  quality: ChordQuality
  density: Density
  /** 0..1, smoothed. */
  distortion: number
  /** 0..1, smoothed. */
  volume: number
}
