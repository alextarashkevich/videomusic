import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Config } from '../config'
import type { Hand, HandFrame } from '../types'

export type HandTracker = {
  /** Runs synchronously. Returns the previous frame's result if the video has not
   *  advanced, so calling this faster than the camera produces frames costs nothing. */
  detect: (video: HTMLVideoElement, timestampMs: number) => HandFrame
  close: () => void
}

const EMPTY: HandFrame = { left: null, right: null }

export async function createHandTracker(config: Config): Promise<HandTracker> {
  const base = import.meta.env.BASE_URL

  // Both are served from our own origin — see scripts/copy-wasm.mjs and
  // scripts/fetch-model.mjs. Nothing is fetched from a CDN at runtime.
  const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`)

  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: `${base}models/hand_landmarker.task`,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: config.vision.minHandDetectionConfidence,
    minHandPresenceConfidence: config.vision.minHandPresenceConfidence,
    minTrackingConfidence: config.vision.minTrackingConfidence,
  })

  let lastVideoTime = -1
  let lastFrame: HandFrame = EMPTY

  return {
    detect(video, timestampMs) {
      if (video.currentTime === lastVideoTime) return lastFrame
      lastVideoTime = video.currentTime

      const result = landmarker.detectForVideo(video, timestampMs)
      lastFrame = route(result)
      return lastFrame
    },

    close() {
      landmarker.close()
    },
  }
}

type Detection = { hand: Hand; label: string; x: number }

/**
 * Assigns detections to the user's left and right hands.
 *
 * MediaPipe labels handedness *assuming the input image is mirrored*, the way a selfie
 * camera shows you. We feed it the raw camera stream — CSS mirrors only the display —
 * so every label arrives inverted and has to be flipped back.
 *
 * When both detections carry the same label, which MediaPipe does occasionally emit,
 * the labels are useless and we fall back to screen position: in the raw image the
 * user's right hand is the one further left.
 */
function route(result: { landmarks: unknown[]; handedness: unknown[] }): HandFrame {
  const detections: Detection[] = []

  for (let i = 0; i < result.landmarks.length; i++) {
    const landmarks = result.landmarks[i] as Hand['landmarks']
    const categories = result.handedness[i] as { categoryName: string; score: number }[] | undefined
    const top = categories?.[0]
    if (landmarks === undefined || landmarks.length === 0 || top === undefined) continue

    const wrist = landmarks[0]
    if (wrist === undefined) continue

    detections.push({
      hand: { landmarks, score: top.score },
      label: top.categoryName,
      x: wrist.x,
    })
  }

  if (detections.length === 0) return EMPTY

  if (detections.length === 2) {
    const [a, b] = detections as [Detection, Detection]
    if (a.label === b.label) {
      const [leftmost, rightmost] = a.x <= b.x ? [a, b] : [b, a]
      return { right: leftmost.hand, left: rightmost.hand }
    }
  }

  const frame: HandFrame = { left: null, right: null }
  for (const detection of detections) {
    // The inversion described above.
    if (detection.label === 'Left') frame.right = detection.hand
    else frame.left = detection.hand
  }
  return frame
}
