export type CameraHandle = {
  video: HTMLVideoElement
  /** What the camera actually agreed to, which is rarely what was asked for. Shown in the
   *  readout because the frame period is the largest single term in the instrument's
   *  latency and there was previously no way to find out what it was. */
  settings: MediaTrackSettings
  /**
   * Runs `callback` once per delivered camera frame.
   *
   * Uses `requestVideoFrameCallback`, which fires when a picture actually arrives, rather
   * than an animation frame, which fires when the display is ready and has to be asked
   * every time whether anything new has turned up. At 30 fps against a 60 Hz screen that
   * polling added up to half a frame of latency for nothing, and ran the detector's
   * bookkeeping twice as often as there was anything to detect.
   *
   * Falls back to `requestAnimationFrame` where the callback is unavailable.
   */
  onFrame: (callback: (timestampMs: number) => void) => void
  stop: () => void
}

/** Turns the browser's camera errors into something a person can act on. */
function describe(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : String(error)
  }

  switch (error.name) {
    case 'NotAllowedError':
      return 'Camera access was blocked. Allow it in your browser’s site settings, then try again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found. Connect one and try again.'
    case 'NotReadableError':
      return 'The camera is already in use by another app. Close it and try again.'
    default:
      return `Could not start the camera: ${error.name}.`
  }
}

/**
 * Requests the front camera and plays it into `video`.
 *
 * The stream is *not* mirrored here — CSS mirrors the display, and MediaPipe is fed the
 * raw frames. See handTracker.ts for why that distinction matters for handedness.
 */
export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'This browser cannot access the camera. Note that camera access needs HTTPS or localhost.',
    )
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // Asked for, not required. A camera that can do 60 halves the wait between moving
        // your hand and the picture of it existing — 33 ms down to 16 — which is the
        // biggest single saving available anywhere in the chain. One that cannot will
        // quietly give 30 instead, so there is nothing to lose by asking.
        frameRate: { ideal: 60 },
      },
      audio: false,
    })
  } catch (error) {
    throw new Error(describe(error))
  }

  video.srcObject = stream
  await video.play()

  // Landmarks are normalised against the video's intrinsic size, which is only known
  // once metadata has loaded. Everything downstream depends on it, so wait for it.
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
    })
  }

  let running = true

  return {
    video,
    settings: stream.getVideoTracks()[0]?.getSettings() ?? {},

    onFrame(callback) {
      const perFrame = 'requestVideoFrameCallback' in video

      const step = (now: number): void => {
        if (!running) return
        callback(now)
        if (perFrame) video.requestVideoFrameCallback(step)
        else requestAnimationFrame(step)
      }

      if (perFrame) video.requestVideoFrameCallback(step)
      else requestAnimationFrame(step)
    },

    stop: () => {
      running = false
      for (const track of stream.getTracks()) track.stop()
      video.srcObject = null
    },
  }
}
