import './style.css'
import { createAudioEngine, type AudioEngine } from './audio/engine'
import { chordNotes } from './audio/voicing'
import { loadConfig } from './config'
import { describeMask } from './gesture/fingers'
import { createInterpreter } from './gesture/interpret'
import type { PerformanceState } from './types'
import { createTuningPanel } from './ui/tuning'
import { startCamera } from './vision/camera'
import { createHandTracker } from './vision/handTracker'
import { createOverlay } from './visual/overlay'
import { createVisualizer } from './visual/scene'

const video = document.querySelector<HTMLVideoElement>('#video')!
const sceneCanvas = document.querySelector<HTMLCanvasElement>('#scene')!
const overlayCanvas = document.querySelector<HTMLCanvasElement>('#overlay')!
const startScreen = document.querySelector<HTMLDivElement>('#start-screen')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const startError = document.querySelector<HTMLParagraphElement>('#start-error')!
const hud = document.querySelector<HTMLDivElement>('#hud')!

const config = loadConfig()

const ROMAN = ['—', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const

// Held across attempts: if the camera fails and the user retries, rebuilding this would
// leave the first synth and its AudioContext running behind the second.
let audio: AudioEngine | null = null

function bar(value: number, width = 12): string {
  const filled = Math.round(value * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

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

  // Audio first: the AudioContext may only start inside the click that triggered this,
  // and awaiting the camera before it would lose that permission.
  audio ??= await createAudioEngine(config)
  const engine = audio
  await engine.resume()

  const camera = await startCamera(video)
  const tracker = await createHandTracker(config)
  const overlay = createOverlay(overlayCanvas, camera.video)
  const visualizer = createVisualizer(sceneCanvas)
  const interpreter = createInterpreter(config)

  // The very first inference compiles the GPU shaders and takes around four seconds.
  // Spending it here, while the button still reads "Starting…", keeps it from freezing
  // the first frame of the instrument after the start screen has already gone.
  startButton.textContent = 'Warming up…'
  await new Promise((resolve) => requestAnimationFrame(resolve))
  tracker.detect(camera.video, performance.now())

  // Mutates config in place; the interpreter and engine both re-read it every frame, so
  // changes are audible as they are dragged.
  createTuningPanel(config)

  startScreen.hidden = true

  // Both readouts can be hidden so the instrument can be filmed without debug furniture
  // over it. The shader and the sound are unaffected.
  let showHud = true
  let showSkeleton = true

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    const key = event.key.toLowerCase()
    if (key === 'h') {
      showHud = !showHud
      if (!showHud) hud.textContent = ''
    }
    if (key === 's') showSkeleton = !showSkeleton
  })

  let fps = 0
  let detectMs = 0
  let previous = performance.now()

  function render(state: PerformanceState): void {
    const { rightMask, leftMask, rightTilt, leftTilt } = interpreter.debug
    const chord =
      state.degree === null ? '—' : chordNotes(state.degree, state.quality, state.density, config).join(' ')

    hud.textContent = [
      `fps ${fps.toFixed(0).padStart(3)}   detect ${detectMs.toFixed(1).padStart(5)} ms`,
      '',
      `RIGHT  ${rightMask === null ? '  —  ' : describeMask(rightMask)}   ${rightTilt.toFixed(0).padStart(3)}°`,
      `       ${ROMAN[state.degree ?? 0]} ${state.quality}`,
      '',
      `LEFT   ${leftMask === null ? '  —  ' : describeMask(leftMask)}   ${leftTilt.toFixed(0).padStart(3)}°`,
      `       ${state.gate ? 'sound' : 'muted'}   density ${state.density}`,
      '',
      `dist   ${bar(state.distortion)} ${(state.distortion * 100).toFixed(0).padStart(3)}%`,
      `vol    ${bar(state.volume)} ${(state.volume * 100).toFixed(0).padStart(3)}%`,
      '',
      `chord  ${chord}`,
      '',
      'T tune · H hide · S skeleton',
    ].join('\n')
  }

  function loop(now: number): void {
    const delta = now - previous
    previous = now
    if (delta > 0) fps += (1000 / delta - fps) * 0.1

    const before = performance.now()
    const frame = tracker.detect(camera.video, now)
    detectMs += (performance.now() - before - detectMs) * 0.1

    const state = interpreter.update(frame)
    engine.update(state)

    visualizer.update(state, engine.getLevel(), now)

    if (showSkeleton) overlay.draw(frame)
    else overlay.clear()
    if (showHud) render(state)

    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)
}

startButton.addEventListener('click', () => {
  start().catch((error: unknown) => {
    showError(error instanceof Error ? error.message : String(error))
  })
})
