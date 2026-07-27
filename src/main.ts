import './style.css'
import { createAudioEngine, type AudioEngine } from './audio/engine'
import { PRESETS } from './audio/presets'
import { measureTrims } from './audio/trims'
import { chordLabel } from './audio/voicing'
import { loadConfig, saveConfig } from './config'
import { describeMask } from './gesture/fingers'
import { createInterpreter, type InterpreterDebug } from './gesture/interpret'
import { clearCalibration, loadCalibration, saveCalibration } from './gesture/modelStore'
import type { HandFrame, PerformanceState } from './types'
import { createCalibrator } from './ui/calibrate'
import { repairConfig } from './ui/controls'
import { createSongGuide } from './ui/songGuide'
import { createToolbar } from './ui/toolbar'
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

// A stored number that has drifted outside its slider's range cannot be corrected from the
// panel, because the slider cannot reach it. See repairConfig.
repairConfig(config)
saveConfig(config)

const ROMAN = ['—', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const

/** Ten readout rebuilds a second. Fast enough to watch a number settle, slow enough that
 *  it is not competing with the detector for the same milliseconds. */
const HUD_INTERVAL_MS = 100

// Held across attempts: if the camera fails and the user retries, rebuilding this would
// leave the first synth and its AudioContext running behind the second.
let audio: AudioEngine | null = null

/** Per-finger reach, so the extension threshold can be read off a real hand: hold up
 *  one finger, then two, and the boundary is plainly between the two sets of numbers. */
function reachOf(reach: Record<string, number>): string {
  const fingers = ['index', 'middle', 'ring', 'pinky']
    .map((finger) => (reach[finger] ?? 0).toFixed(2))
    .join(' ')
  return `${fingers}   ${(reach['thumb'] ?? 0).toFixed(0).padStart(2)}°`
}

function bar(value: number, width = 12): string {
  const filled = Math.round(value * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/**
 * Why a calibrated read did or did not name a gesture.
 *
 * A calibrated classifier that rejects everything looks exactly like one being shown
 * nothing — in both cases the chord simply holds and the readout says `—`. Printing the two
 * numbers the decision turns on makes the difference readable at a glance, which it was not
 * when this last silenced the instrument.
 */
function gateOf(debug: InterpreterDebug, marginRatio: number): string {
  if (!debug.calibrated) return 'rules — press C to calibrate'

  const why =
    debug.distance > debug.radius
      ? '  too far'
      : debug.margin < marginRatio
        ? '  too close to call'
        : ''

  return `calibrated  dist ${debug.distance.toFixed(2)}/${debug.radius.toFixed(2)}  margin ${debug.margin.toFixed(2)}${why}`
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
  const tuning = createTuningPanel(config)
  const guide = createSongGuide(config)
  const calibrator = createCalibrator(config)

  let calibration = loadCalibration()
  interpreter.setCalibration(calibration)

  calibrator.onDone((next) => {
    calibration = next
    interpreter.setCalibration(next)
    saveCalibration(next)
    toolbar.refresh()
  })

  // Both live on the right-hand side, and you do not need a song while dragging sliders.
  tuning.onToggle((open) => guide.setVisible(!open))

  startScreen.hidden = true

  // Both readouts can be hidden so the instrument can be filmed without debug furniture
  // over it. The shader and the sound are unaffected.
  let showHud = true
  let showSkeleton = true

  function cyclePreset(): void {
    const index = PRESETS.findIndex((preset) => preset.name === config.sound.preset)
    config.sound.preset = PRESETS[(index + 1) % PRESETS.length]!.name
    saveConfig(config)
  }

  function toggleGuide(): void {
    guide.toggle()
    guide.setVisible(!tuning.open)
  }

  function toggleHud(): void {
    showHud = !showHud
    if (!showHud) hud.textContent = ''
  }

  function swapHands(): void {
    config.vision.swapHands = !config.vision.swapHands
    saveConfig(config)

    // The models are keyed by role, and this changes which physical hand holds which role.
    // Swapping them along with it is what stops a calibration silently becoming wrong the
    // moment somebody presses X.
    calibration = { right: calibration.left, left: calibration.right }
    interpreter.setCalibration(calibration)
    saveCalibration(calibration)
  }

  function toggleCalibration(): void {
    if (calibrator.running) {
      calibrator.cancel()
    } else if (calibration.right !== null) {
      // A second press with one already recorded clears it, so there is a way back to the
      // rules without opening the console.
      calibration = { right: null, left: null }
      interpreter.setCalibration(calibration)
      clearCalibration()
    } else {
      calibrator.start()
    }
    toolbar.refresh()
  }

  const toolbar = createToolbar([
    { label: 'Tune', key: 'T', onClick: () => tuning.toggle() },
    { label: 'Songs', key: '⇧G', onClick: toggleGuide },
    { label: 'Next song', key: 'G', onClick: () => guide.next() },
    {
      label: 'Synth',
      key: '1–8',
      label2: () => config.sound.preset,
      onClick: cyclePreset,
    },
    {
      label: 'Swap hands',
      key: 'X',
      title: 'If the wrong hand is choosing chords, press this.',
      label2: () => (config.vision.swapHands ? 'Hands: swapped' : 'Swap hands'),
      onClick: swapHands,
    },
    {
      label: 'Calibrate',
      key: 'C',
      title:
        'Hold each gesture once and it learns your hands instead of measuring them against numbers someone guessed. Press again to clear it.',
      label2: () =>
        calibrator.running ? 'Cancel' : calibration.right !== null ? 'Clear calibration' : 'Calibrate',
      onClick: toggleCalibration,
    },
    { label: 'Readout', key: 'H', onClick: toggleHud },
    { label: 'Skeleton', key: 'S', onClick: () => (showSkeleton = !showSkeleton) },
  ])

  tuning.onToggle(() => toolbar.refresh())

  // Keyed off `code`, the physical key, rather than `key`, the character it produced.
  // On a non-Latin layout `key` for the T key is "е", so every shortcut here silently
  // did nothing.
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    if (event.metaKey || event.ctrlKey || event.altKey) return

    const digit = /^Digit([1-9])$/.exec(event.code)
    if (digit !== null) {
      const preset = PRESETS[Number(digit[1]) - 1]
      if (preset !== undefined) {
        config.sound.preset = preset.name
        saveConfig(config)
        toolbar.refresh()
      }
      return
    }

    switch (event.code) {
      case 'KeyT':
        tuning.toggle()
        break
      case 'KeyG':
        if (event.shiftKey) toggleGuide()
        else guide.next()
        break
      case 'KeyX':
        swapHands()
        toolbar.refresh()
        break
      case 'KeyC':
        toggleCalibration()
        break
      case 'KeyH':
        toggleHud()
        break
      case 'KeyS':
        showSkeleton = !showSkeleton
        break
      default:
        return
    }
  })

  let fps = 0
  let cameraFps = 0
  let detectMs = 0
  let previous = performance.now()
  let previousFrame = performance.now()
  let lastHud = 0

  const negotiated = camera.settings
  const cameraLabel = `${negotiated.width ?? '?'}×${negotiated.height ?? '?'} @ ${negotiated.frameRate?.toFixed(0) ?? '?'}`

  function render(state: PerformanceState): void {
    const { rightMask, leftMask, leftTilt } = interpreter.debug
    const chord =
      state.degree === null ? '—' : chordLabel(state.degree, state.quality, state.density, config)

    hud.textContent = [
      `draw ${fps.toFixed(0).padStart(3)}   cam ${cameraFps.toFixed(0).padStart(3)}   detect ${detectMs.toFixed(1).padStart(5)} ms`,
      `cam ${cameraLabel}   detect at ${config.vision.inferenceWidth}px`,
      '',
      `RIGHT  ${rightMask === null ? '  —  ' : describeMask(rightMask)}`,
      `       ${ROMAN[state.degree ?? 0]} ${state.quality}   ${chord}`,
      `       ${gateOf(interpreter.debug, config.gesture.marginRatio)}`,
      '',
      `LEFT   ${leftMask === null ? '  —  ' : describeMask(leftMask)}   ${leftTilt.toFixed(0).padStart(3)}°`,
      `       ${state.gate ? 'sound' : 'muted'}   ${['', 'triad', '+octave', '7th'][state.density]}`,
      `       thumb ${interpreter.debug.leftThumb.toFixed(0).padStart(2)}°   major over ${config.quality.majorAboveDeg}°, minor under ${config.quality.minorBelowDeg}°`,
      '',
      `tilt   ${bar(state.tilt)} ${(state.tilt * 100).toFixed(0).padStart(3)}%`,
      `vol    ${bar(state.volume)} ${(state.volume * 100).toFixed(0).padStart(3)}%`,
      '',
      `reach  ${reachOf(interpreter.debug.rightReach)}`,
      `       I    M    R    P     thumb`,
      `       up over ${config.gesture.extendedProjection.toFixed(2)}      over ${config.gesture.thumbAngleDeg}°`,
    ].join('\n')
  }

  // The two loops below run at different rates on purpose.
  //
  // Seeing and hearing is the part latency is felt in, and it can only usefully happen
  // when the camera delivers a picture — so it hangs off the camera, and nothing else
  // shares the frame with it. Drawing is the part latency is not felt in, and it runs on
  // the display's own clock, where a shader pass and a canvas redraw belong.
  //
  // They used to be one loop on `requestAnimationFrame`, which meant a 30 Hz camera was
  // polled 60 times a second — and every one of those ticks carried the shader, a
  // full-canvas skeleton redraw and thirteen lines of rebuilt text along with it, on the
  // same thread as the detector.
  let latest: PerformanceState = interpreter.update({ left: null, right: null })
  let frame: HandFrame = { left: null, right: null }
  let seen = 0
  let drawn = -1

  camera.onFrame((now) => {
    const delta = now - previousFrame
    previousFrame = now
    if (delta > 0) cameraFps += (1000 / delta - cameraFps) * 0.1

    const before = performance.now()
    const detection = tracker.detect(camera.video, now)
    if (detection.fresh) detectMs += (performance.now() - before - detectMs) * 0.1

    // The tuning panel and the number keys both write the preset into config; picking it
    // up here keeps the UI from having to know about the audio graph.
    if (config.sound.preset !== engine.preset) engine.setPreset(config.sound.preset)

    calibrator.update(detection.frame, detection.fresh, now)

    latest = interpreter.update(detection.frame, detection.fresh)
    engine.update(latest)

    frame = detection.frame
    if (detection.fresh) seen++
  })

  function draw(now: number): void {
    const delta = now - previous
    previous = now
    if (delta > 0) fps += (1000 / delta - fps) * 0.1

    guide.update(latest, delta)
    visualizer.update(latest, engine.getLevel(), now)

    // Redrawing the same skeleton over and over costs a full canvas clear and twenty-one
    // circles for no change on screen.
    if (!showSkeleton) overlay.clear()
    else if (seen !== drawn) {
      overlay.draw(frame)
      drawn = seen
    }

    // The readout is for reading, and nobody reads at 60 Hz. Rebuilding it that often
    // meant thirteen lines of string work and a layout pass on every frame, next to the
    // detector.
    if (showHud && now - lastHud > HUD_INTERVAL_MS) {
      render(latest)
      lastHud = now
    }
    toolbar.setVisible(showHud)

    requestAnimationFrame(draw)
  }

  requestAnimationFrame(draw)
}

// Loudness measurement, for setting the numbers in presets.ts. Renders offline, so it
// needs neither a camera nor a click — see audio/trims.ts.
if (new URLSearchParams(location.search).get('trims') === '1') {
  void measureTrims(config)
}

startButton.addEventListener('click', () => {
  start().catch((error: unknown) => {
    showError(error instanceof Error ? error.message : String(error))
  })
})
