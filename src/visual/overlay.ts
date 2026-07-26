import { HAND_BONES } from '../gesture/landmarks'
import type { HandFrame, Landmarks } from '../types'

const COLOURS = {
  right: '#6ee7ff',
  left: '#ffb86e',
} as const

export type Overlay = {
  draw: (frame: HandFrame) => void
  clear: () => void
}

/**
 * Maps normalised landmark coordinates onto canvas pixels.
 *
 * Two corrections are needed. The video is drawn with `object-fit: cover`, so it is
 * scaled up and cropped rather than stretched — ignoring that puts the skeleton
 * visibly off the hand on any viewport whose aspect ratio differs from the camera's.
 * And the display is mirrored while the landmarks are not, so x has to be flipped.
 */
function projector(video: HTMLVideoElement, width: number, height: number) {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  const drawnWidth = video.videoWidth * scale
  const drawnHeight = video.videoHeight * scale
  const offsetX = (width - drawnWidth) / 2
  const offsetY = (height - drawnHeight) / 2

  return (x: number, y: number): [number, number] => [
    offsetX + (1 - x) * drawnWidth,
    offsetY + y * drawnHeight,
  ]
}

export function createOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement): Overlay {
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Could not get a 2D context for the hand overlay.')

  let width = 0
  let height = 0

  function resize(): void {
    const ratio = Math.min(window.devicePixelRatio, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context!.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  resize()
  window.addEventListener('resize', resize)

  function drawHand(landmarks: Landmarks, colour: string, project: ReturnType<typeof projector>) {
    context!.strokeStyle = colour
    context!.lineWidth = 2.5
    context!.lineCap = 'round'

    context!.beginPath()
    for (const [from, to] of HAND_BONES) {
      const a = landmarks[from]
      const b = landmarks[to]
      if (a === undefined || b === undefined) continue
      context!.moveTo(...project(a.x, a.y))
      context!.lineTo(...project(b.x, b.y))
    }
    context!.stroke()

    context!.fillStyle = colour
    for (const point of landmarks) {
      const [x, y] = project(point.x, point.y)
      context!.beginPath()
      context!.arc(x, y, 3.5, 0, Math.PI * 2)
      context!.fill()
    }
  }

  return {
    draw(frame) {
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize()
      context.clearRect(0, 0, width, height)
      if (video.videoWidth === 0) return

      const project = projector(video, width, height)
      if (frame.right !== null) drawHand(frame.right.landmarks, COLOURS.right, project)
      if (frame.left !== null) drawHand(frame.left.landmarks, COLOURS.left, project)
    },

    clear() {
      context.clearRect(0, 0, width, height)
    },
  }
}
