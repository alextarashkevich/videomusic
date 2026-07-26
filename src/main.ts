import './style.css'
import { loadConfig } from './config'
import { startCamera } from './vision/camera'
import { createHandTracker } from './vision/handTracker'
import { createOverlay } from './visual/overlay'

const video = document.querySelector<HTMLVideoElement>('#video')!
const overlayCanvas = document.querySelector<HTMLCanvasElement>('#overlay')!
const startScreen = document.querySelector<HTMLDivElement>('#start-screen')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const startError = document.querySelector<HTMLParagraphElement>('#start-error')!
const hud = document.querySelector<HTMLDivElement>('#hud')!

const config = loadConfig()

function showError(message: string): void {
  startError.textContent = message
  startError.hidden = false
  startButton.disabled = false
  startButton.textContent = 'Try again'
}

async function start(): Promise<void> {
  startButton.disabled = true
  startButton.textContent = 'Starting…'
  startError.hidden = true

  const camera = await startCamera(video)
  const tracker = await createHandTracker(config)
  const overlay = createOverlay(overlayCanvas, camera.video)

  startScreen.hidden = true

  // Smoothed so the readout is legible rather than twitching every frame.
  let fps = 0
  let detectMs = 0
  let previous = performance.now()

  function loop(now: number): void {
    const delta = now - previous
    previous = now
    if (delta > 0) fps += (1000 / delta - fps) * 0.1

    const before = performance.now()
    const frame = tracker.detect(camera.video, now)
    detectMs += (performance.now() - before - detectMs) * 0.1

    overlay.draw(frame)

    hud.textContent = [
      `fps      ${fps.toFixed(0).padStart(3)}`,
      `detect   ${detectMs.toFixed(1).padStart(5)} ms`,
      `right    ${frame.right === null ? '—' : frame.right.score.toFixed(2)}`,
      `left     ${frame.left === null ? '—' : frame.left.score.toFixed(2)}`,
    ].join('\n')

    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)
}

startButton.addEventListener('click', () => {
  start().catch((error: unknown) => {
    showError(error instanceof Error ? error.message : String(error))
  })
})
