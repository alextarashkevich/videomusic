import * as Tone from 'tone'
import type { Config } from '../config'
import type { PerformanceState } from '../types'
import { midiToFrequency, VOICE_ROLES, voiceLevels, voicePitches, type VoiceRole } from './voicing'

export type AudioEngine = {
  /** Starts the AudioContext. Must be called from inside a user gesture — building the
   *  graph does not need one, which is what keeps this testable without a click. */
  resume: () => Promise<void>
  update: (state: PerformanceState) => void
  /** Output level, 0..1, for the visuals to react to. */
  getLevel: () => number
  dispose: () => void
}

type Voice = { synth: Tone.Synth; gain: Tone.Gain }

/**
 * Rebuilding the waveshaper curve is not free, and the hand feeds a new value every
 * frame. Quantising to this many steps keeps the sweep smooth to the ear while the
 * curve is only rebuilt when the wrist has actually moved.
 */
const DISTORTION_STEPS = 32

/**
 * Builds the synth.
 *
 * The instrument sustains, so rather than triggering notes, all four voices are
 * attacked once and held forever; everything audible is done with gains. That is what
 * makes the gate a fade rather than a cut, and it means there is no note-on latency at
 * all — only a gain ramp.
 *
 * Building the graph does not require a user gesture; starting the context does. Call
 * `resume()` from the click.
 */
export async function createAudioEngine(config: Config): Promise<AudioEngine> {
  // The default 100 ms lookAhead is plainly audible as lag on an instrument you are
  // playing with your hands.
  Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.02 }))

  // A limiter is not optional here: distortion at full drive combined with a volume
  // gesture is a real way to hurt someone wearing headphones.
  const limiter = new Tone.Limiter(-2).toDestination()

  // Two separate stages so the gate can fade slowly while volume still tracks the hand
  // immediately — sharing one gain would make every volume change as sluggish as the mute.
  const gate = new Tone.Gain(0).connect(limiter)
  const volume = new Tone.Gain(0.7).connect(gate)

  const meter = new Tone.Meter({ normalRange: true, smoothing: 0.8 })
  volume.connect(meter)

  const reverb = new Tone.Reverb({ decay: 2.4, preDelay: 0.01, wet: 0.22 }).connect(volume)
  await reverb.generate()

  // Pulls the level back as drive rises, so tilting the wrist changes the character of
  // the sound rather than just making it louder.
  const makeup = new Tone.Gain(1).connect(reverb)

  // After the drive rather than before it, to tame the harsh upper harmonics distortion
  // generates.
  const tone = new Tone.Filter({ type: 'lowpass', frequency: 3200, rolloff: -12, Q: 0.6 })
  tone.connect(makeup)

  const drive = new Tone.Distortion({ distortion: 0, oversample: '4x' }).connect(tone)

  const voices = new Map<VoiceRole, Voice>()
  for (const role of VOICE_ROLES) {
    const gain = new Tone.Gain(0).connect(drive)
    const synth = new Tone.Synth({
      oscillator: { type: 'fatsawtooth', count: 3, spread: 16 },
      // Sustain of 1 with no decay: attacked once at startup and held for the life of
      // the instrument.
      envelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.1 },
    }).connect(gain)

    synth.triggerAttack(midiToFrequency(60))
    voices.set(role, { synth, gain })
  }

  let lastDistortionStep = -1

  return {
    async resume() {
      await Tone.start()
    },

    update(state) {
      const now = Tone.now()
      const { rampSeconds, glideSeconds, gateFadeSeconds } = config.smoothing

      if (state.degree !== null) {
        const pitches = voicePitches(state.degree, state.quality, config)
        for (const role of VOICE_ROLES) {
          const voice = voices.get(role)!
          voice.synth.frequency.rampTo(midiToFrequency(pitches[role]), glideSeconds, now)
        }
      }

      const levels = voiceLevels(state.density)
      for (const role of VOICE_ROLES) {
        voices.get(role)!.gain.gain.rampTo(levels[role], rampSeconds, now)
      }

      const step = Math.round(state.distortion * DISTORTION_STEPS)
      if (step !== lastDistortionStep) {
        lastDistortionStep = step
        drive.distortion = step / DISTORTION_STEPS
      }
      makeup.gain.rampTo(1 / (1 + state.distortion * 2.5), rampSeconds, now)

      volume.gain.rampTo(state.volume, rampSeconds, now)

      // Nothing to play before the first recognised gesture, so stay silent until then.
      const sounding = state.gate && state.degree !== null
      gate.gain.rampTo(sounding ? 1 : 0, gateFadeSeconds, now)
    },

    getLevel() {
      const value = meter.getValue()
      return typeof value === 'number' ? value : 0
    },

    dispose() {
      for (const { synth, gain } of voices.values()) {
        synth.dispose()
        gain.dispose()
      }
      drive.dispose()
      tone.dispose()
      makeup.dispose()
      reverb.dispose()
      meter.dispose()
      volume.dispose()
      gate.dispose()
      limiter.dispose()
    },
  }
}
