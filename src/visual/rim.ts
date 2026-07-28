/**
 * The instrument's colour, thrown around the edges of the screen.
 *
 * What it says, and it only says three things: **hue is which chord**, **brightness is how
 * loud**, and it **breathes** so a held chord is alive rather than a still image.
 *
 * Round the edges rather than over the middle, which is the whole idea. The middle of the
 * frame is where your hands are, and where your face is if this is being filmed. A
 * full-screen field competes with both — you end up reading the visuals instead of watching
 * your own hands, and on camera it washes the player out. A rim leaves the picture alone and
 * still fills the room with the colour of the chord.
 *
 * Canvas rather than the fragment shader this replaces. The shader was a warped noise field
 * over the entire frame: prettier in a screenshot, worse to play against, and it pulled in
 * all of Three.js — most of the JavaScript this page ships — to draw something four
 * gradients can draw. It also shared a GPU with the hand tracker, which is the one piece of
 * this that must never be starved.
 */
import type { PerformanceState } from '../types'
import { approach, approachHue, hueForDegree } from './palette'

export type Visualizer = {
  update: (state: PerformanceState, level: number, timeMs: number) => void
  dispose: () => void
}

/** How far in from the edge the glow reaches, as a fraction of the smaller side. Wide
 *  enough to be a wash of colour rather than a border, narrow enough to leave the player
 *  and their hands untouched. */
const REACH = 0.55

/** Alpha down the band, as [position, level]. Eased rather than linear, and at nothing well
 *  before the band ends, so no edge of the fill is ever a visible line. */
const FALLOFF: readonly [number, number][] = [
  [0, 1],
  [0.12, 0.72],
  [0.26, 0.44],
  [0.44, 0.21],
  [0.66, 0.07],
  [0.85, 0.015],
  [1, 0],
]

/** Hue → CSS colour. Saturation and lightness are fixed here rather than exposed: the
 *  glow's job is to say which chord, and letting all three move at once makes none of them
 *  legible. */
function colour(hue: number, minor: number, alpha: number): string {
  const saturation = Math.round((88 - minor * 26) * 1)
  const lightness = Math.round(58 - minor * 8)
  return `hsl(${(hue * 360).toFixed(1)} ${saturation}% ${lightness}% / ${alpha.toFixed(3)})`
}

export function createVisualizer(canvas: HTMLCanvasElement): Visualizer {
  const paint = canvas.getContext('2d', { alpha: true })

  let width = 0
  let height = 0
  let ratio = 1

  // Everything the picture reads is eased rather than snapped: a chord change should bloom
  // into its new colour, not cut to it.
  let hue = hueForDegree(1)
  let minor = 0
  let glow = 0
  let tilt = 0

  function resize(): void {
    ratio = Math.min(window.devicePixelRatio, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
  }

  resize()

  return {
    update(state, level, timeMs) {
      if (paint === null) return
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize()

      const targetHue = state.degree === null ? hueForDegree(1) : hueForDegree(state.degree)
      hue = approachHue(hue, targetHue, 0.06)
      minor = approach(minor, state.quality === 'minor' ? 1 : 0, 0.05)
      tilt = approach(tilt, state.tilt, 0.08)

      // Driven by the measured output level rather than by the volume control, so what you
      // see is what is actually coming out — a muted instrument goes dark even with the hand
      // held high.
      // Deliberately short of the point where an ordinary chord pins it at full. Pushed
      // higher the glow saturates for anything above a moderate level, and "brightness is
      // how loud" collapses into "on or off" — which throws away the one thing it says.
      const target = state.gate ? Math.min(level * 2.05, 1) : 0
      glow = approach(glow, target, target > glow ? 0.22 : 0.07)

      // Two breaths at slightly different rates, so they drift in and out of phase and the
      // pulse never settles into an obvious loop.
      const breath =
        0.86 + 0.09 * Math.sin(timeMs / 1900) + 0.05 * Math.sin(timeMs / 3100 + 1.2)

      paint.setTransform(ratio, 0, 0, ratio, 0, 0)
      paint.clearRect(0, 0, width, height)

      const strength = glow * breath
      if (strength < 0.004) return

      const short = Math.min(width, height)
      // The left wrist has no sound mapped to it, so it gets the one thing left to give:
      // how far the colour reaches in from the edge. Capped under half the short side, or
      // opposite edges would meet in the middle and the rim would become a wash.
      const reach = Math.min(short * REACH * (0.78 + tilt * 0.5), short * 0.62)

      // Each edge paints its own band inward. `lighter` lets them add where they overlap,
      // which is what makes the corners the brightest part without drawing corners at all.
      paint.globalCompositeOperation = 'lighter'

      /** From the edge at `x0,y0` inward to `x1,y1`, filling the band behind it. */
      const band = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        rx: number,
        ry: number,
        rw: number,
        rh: number,
      ): void => {
        const gradient = paint.createLinearGradient(x0, y0, x1, y1)
        // A long tail rather than a straight ramp. Three evenly spaced stops left the inner
        // edge of each band visible as a faint rectangle once `lighter` added two of them
        // together — the falloff has to reach nothing well before the band does.
        for (const [at, level] of FALLOFF) {
          gradient.addColorStop(at, colour(hue, minor, level * strength))
        }
        paint.fillStyle = gradient
        paint.fillRect(rx, ry, rw, rh)
      }

      band(0, 0, reach, 0, 0, 0, reach, height)
      band(width, 0, width - reach, 0, width - reach, 0, reach, height)
      band(0, 0, 0, reach, 0, 0, width, reach)
      band(0, height, 0, height - reach, 0, height - reach, width, reach)

      paint.globalCompositeOperation = 'source-over'
    },

    dispose() {
      paint?.setTransform(1, 0, 0, 1, 0, 0)
      paint?.clearRect(0, 0, canvas.width, canvas.height)
    },
  }
}
