import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Config } from '../config'
import type { Hand, HandFrame } from '../types'

export type Detection = {
  frame: HandFrame
  /** False when the camera has not produced a new picture since the last call, so this
   *  is the previous result handed back rather than a fresh observation. Callers holding
   *  per-frame state must not advance it on a repeat. */
  fresh: boolean
}

export type HandTracker = {
  /** Runs synchronously. Re-uses the previous result if the video has not advanced, so
   *  calling this faster than the camera produces frames costs nothing. */
  detect: (video: HTMLVideoElement, timestampMs: number) => Detection
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

  // Scratch canvas the camera picture is shrunk into before detection. The model works at
  // 192×192 whatever it is handed, so a 1280×720 frame spends most of its cost being
  // uploaded and resized — a third of a million pixels of it thrown away immediately. The
  // display still gets the full-size video; only the detector sees this.
  const scratch = document.createElement('canvas')
  const paint = scratch.getContext('2d', { willReadFrequently: false, alpha: false })

  function source(video: HTMLVideoElement): HTMLVideoElement | HTMLCanvasElement {
    const width = config.vision.inferenceWidth
    if (paint === null || width <= 0 || video.videoWidth === 0 || width >= video.videoWidth) {
      return video
    }

    const height = Math.round((width * video.videoHeight) / video.videoWidth)
    if (scratch.width !== width || scratch.height !== height) {
      scratch.width = width
      scratch.height = height
    }

    paint.drawImage(video, 0, 0, width, height)
    return scratch
  }

  return {
    detect(video, timestampMs) {
      if (video.currentTime === lastVideoTime) return { frame: lastFrame, fresh: false }
      lastVideoTime = video.currentTime

      const result = landmarker.detectForVideo(source(video), timestampMs)
      lastFrame = route(result, config.vision.swapHands)
      return { frame: lastFrame, fresh: true }
    },

    close() {
      landmarker.close()
    },
  }
}

type Routed = { hand: Hand; label: string; x: number }

/**
 * Assigns detections to the user's left and right hands.
 *
 * MediaPipe documents that it labels handedness *assuming the input image is mirrored*,
 * the way a selfie camera shows you, and we feed it the raw camera stream — CSS mirrors
 * only the display. That reasoning says every label arrives inverted. In practice it
 * does not: playing the thing showed the labels already matching the physical hands, and
 * inverting them put chords on the wrong hand.
 *
 * So the labels are taken at face value and `swapHands` exists to flip them. Which way
 * round this lands appears to depend on the browser and the camera, and one setting is
 * worth more than a confident derivation that the instrument disagrees with.
 *
 * When both detections carry the same label, which MediaPipe does occasionally emit, the
 * labels are useless and screen position decides instead.
 */
function route(
  result: { landmarks: unknown[]; worldLandmarks: unknown[]; handedness: unknown[] },
  swap: boolean,
): HandFrame {
  const detections: Routed[] = []

  for (let i = 0; i < result.landmarks.length; i++) {
    const landmarks = result.landmarks[i] as Hand['landmarks']
    const world = result.worldLandmarks[i] as Hand['world'] | undefined
    const categories = result.handedness[i] as { categoryName: string; score: number }[] | undefined
    const top = categories?.[0]
    if (landmarks === undefined || landmarks.length === 0 || top === undefined) continue

    const wrist = landmarks[0]
    if (wrist === undefined) continue

    detections.push({
      // Falling back to the flat landmarks keeps the instrument playable if world
      // coordinates ever go missing, at the cost of the depth correction.
      hand: { landmarks, world: world ?? landmarks, score: top.score },
      label: top.categoryName,
      x: wrist.x,
    })
  }

  if (detections.length === 0) return EMPTY

  if (detections.length === 2) {
    const [a, b] = detections as [Routed, Routed]
    if (a.label === b.label) {
      // Landmark x runs left to right across the raw, unmirrored image.
      const [leftmost, rightmost] = a.x <= b.x ? [a, b] : [b, a]
      return swap
        ? { left: leftmost.hand, right: rightmost.hand }
        : { right: leftmost.hand, left: rightmost.hand }
    }
  }

  const frame: HandFrame = { left: null, right: null }
  for (const detection of detections) {
    const isLeft = (detection.label === 'Left') !== swap
    if (isLeft) frame.left = detection.hand
    else frame.right = detection.hand
  }
  return frame
}
