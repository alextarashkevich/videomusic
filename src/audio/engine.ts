import * as Tone from 'tone'
import type { Config } from '../config'
import type { PerformanceState } from '../types'
import { DEFAULT_PRESET, findPreset, type Preset } from './presets'
import {
  chordPitches,
  leadVoices,
  midiToFrequency,
  registerFor,
  voiceGains,
  VOICE_COUNT,
} from './voicing'

export type AudioEngine = {
  /** Starts the AudioContext. Must be called from inside a user gesture — building the
   *  graph does not need one, which is what keeps this testable without a click. */
  resume: () => Promise<void>
  update: (state: PerformanceState) => void
  setPreset: (name: string) => void
  readonly preset: string
  /** Output level, 0..1, for the visuals to react to. */
  getLevel: () => number
  dispose: () => void
}

type Voice = { synth: Tone.Synth; gain: Tone.Gain }

/**
 * Rebuilding the drive curve is not free, and the hand supplies a new value every frame.
 * Quantising keeps the sweep smooth to the ear while the curve is only rebuilt when the
 * wrist has actually moved.
 */
const DRIVE_STEPS = 32

/** Curve sharpness at full drive. tanh at k=12 is close to a square wave. */
const MAX_SHARPNESS = 11

/**
 * Builds the synth.
 *
 * The instrument sustains, so rather than triggering notes, four voices are attacked
 * once and held forever; everything audible is done with gains. That is what makes the
 * gate a fade rather than a cut, and it removes note-on latency entirely.
 *
 * Building the graph does not require a user gesture; starting the context does. Call
 * `resume()` from the click.
 */
export async function createAudioEngine(config: Config): Promise<AudioEngine> {
  // The default 100 ms lookAhead is plainly audible as lag on an instrument you are
  // playing with your hands.
  Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.02 }))

  // Not optional: drive at full tilt combined with a volume gesture is a real way to
  // hurt someone wearing headphones.
  const limiter = new Tone.Limiter(-2).toDestination()

  // Two separate stages so the gate can fade slowly while volume still tracks the hand
  // immediately — sharing one gain would make every volume change as sluggish as the mute.
  const gate = new Tone.Gain(0).connect(limiter)
  const volume = new Tone.Gain(0.7).connect(gate)

  const meter = new Tone.Meter({ normalRange: true, smoothing: 0.8 })
  volume.connect(meter)

  const reverb = new Tone.Reverb({ decay: 2.4, preDelay: 0.01, wet: 0.26 }).connect(volume)
  await reverb.generate()

  const makeup = new Tone.Gain(1).connect(reverb)

  // Only takes off the worst fizz. A tight lowpass here would scrub away the very
  // harmonics the drive exists to create — measured at a third of the added brightness.
  const polish = new Tone.Filter({ type: 'lowpass', frequency: 8000, rolloff: -12, Q: 0.4 })
  polish.connect(makeup)

  // tanh rather than Tone.Distortion: Tone's curve spends nearly its whole range in the
  // last few degrees of tilt, so most of the gesture does nothing and the end does
  // everything. tanh with a swept pre-gain gives an even slope from clean to crushed.
  const drive = new Tone.WaveShaper((x: number) => x, 2048)
  drive.oversample = '4x'
  drive.connect(polish)

  // Before the drive, not after: this shapes what gets distorted, the way an amp does.
  const tone = new Tone.Filter({ type: 'lowpass', frequency: 6000, rolloff: -12, Q: 0.4 })
  tone.connect(drive)

  const voices: Voice[] = []
  for (let index = 0; index < VOICE_COUNT; index++) {
    const gain = new Tone.Gain(0).connect(tone)
    const synth = new Tone.Synth({
      // Sustain of 1 with no decay: attacked once and held for the life of the instrument.
      envelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.1 },
    }).connect(gain)

    synth.triggerAttack(midiToFrequency(60))
    voices.push({ synth, gain })
  }

  let preset: Preset = findPreset(DEFAULT_PRESET)
  let lastDriveStep = -1
  let lastChord = ''
  let pitches: number[] | null = null

  function applyPreset(next: Preset): void {
    preset = next
    for (const { synth } of voices) {
      synth.oscillator.type = next.oscillator.type as Tone.Synth['oscillator']['type']
      if (next.oscillator.count !== undefined) {
        // `count` and `spread` only exist on the fat oscillator family.
        const fat = synth.oscillator as unknown as { count: number; spread: number }
        fat.count = next.oscillator.count
        fat.spread = next.oscillator.spread ?? 20
      }
    }
    tone.frequency.value = next.filter.frequency
    tone.Q.value = next.filter.Q
    reverb.wet.value = next.reverbWet
  }

  applyPreset(preset)

  return {
    async resume() {
      await Tone.start()
    },

    get preset() {
      return preset.name
    },

    setPreset(name) {
      applyPreset(findPreset(name))
    },

    update(state) {
      const now = Tone.now()
      const { rampSeconds, glideSeconds, gateFadeSeconds } = config.smoothing

      if (state.degree !== null) {
        // Only re-voice when the chord actually changes — the assignment search would
        // otherwise run every frame, and re-leading an unchanged chord could drift it.
        const chord = [
          state.degree,
          state.quality,
          state.density,
          config.music.root,
          config.music.scale.join(),
        ].join('|')

        if (chord !== lastChord) {
          lastChord = chord
          const target = chordPitches(state.degree, state.quality, state.density, config)
          pitches = leadVoices(target, pitches, registerFor(config))

          for (let index = 0; index < VOICE_COUNT; index++) {
            voices[index]!.synth.frequency.rampTo(
              midiToFrequency(pitches[index]!),
              glideSeconds,
              now,
            )
          }
        }
      }

      // No preset trim here: the voices must hit the drive at the same level whatever
      // the preset, or the trim would quietly change the character of the distortion
      // along with the volume. Loudness matching happens after the drive instead.
      const gains = voiceGains(state.density)
      for (let index = 0; index < VOICE_COUNT; index++) {
        voices[index]!.gain.gain.rampTo(gains[index]!, rampSeconds, now)
      }

      const step = Math.round(state.distortion * DRIVE_STEPS)
      if (step !== lastDriveStep) {
        lastDriveStep = step
        const sharpness = 1 + (step / DRIVE_STEPS) * MAX_SHARPNESS
        const normalise = Math.tanh(sharpness)
        drive.setMap((x) => Math.tanh(sharpness * x) / normalise, 2048)
      }

      // Preset loudness matching and drive compensation, both after the drive.
      //
      // The compensation is measured per preset and deliberately partial: full drive
      // lands about 1.3x louder than clean. Cancelling the increase entirely was why the
      // drive read as doing nothing — the ear hears "louder and brighter" as "dirtier",
      // and with the loudness removed it hears neither.
      makeup.gain.rampTo(
        preset.trim / (1 + state.distortion * preset.driveComp),
        rampSeconds,
        now,
      )

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
      for (const { synth, gain } of voices) {
        synth.dispose()
        gain.dispose()
      }
      tone.dispose()
      drive.dispose()
      polish.dispose()
      makeup.dispose()
      reverb.dispose()
      meter.dispose()
      volume.dispose()
      gate.dispose()
      limiter.dispose()
    },
  }
}
