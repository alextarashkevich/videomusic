export type CameraHandle = {
  video: HTMLVideoElement
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

  return {
    video,
    stop: () => {
      for (const track of stream.getTracks()) track.stop()
      video.srcObject = null
    },
  }
}
