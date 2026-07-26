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

  // Last line of defence on an instrument whose volume is a hand waving in the air.
  const limiter = new Tone.Limiter(-2).toDestination()

  // Two separate stages so the gate can fade slowly while volume still tracks the hand
  // immediately — sharing one gain would make every volume change as sluggish as the mute.
  const gate = new Tone.Gain(0).connect(limiter)
  const volume = new Tone.Gain(0.7).connect(gate)

  const meter = new Tone.Meter({ normalRange: true, smoothing: 0.8 })
  volume.connect(meter)

  const reverb = new Tone.Reverb({ decay: 2.4, preDelay: 0.01, wet: 0.26 }).connect(volume)
  await reverb.generate()

  // Matches presets to each other in loudness; nothing else sits on this stage now.
  const makeup = new Tone.Gain(1).connect(reverb)

  const tone = new Tone.Filter({ type: 'lowpass', frequency: 6000, rolloff: -12, Q: 0.4 })
  tone.connect(makeup)

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

      const gains = voiceGains(state.density)
      for (let index = 0; index < VOICE_COUNT; index++) {
        voices[index]!.gain.gain.rampTo(gains[index]!, rampSeconds, now)
      }

      makeup.gain.rampTo(preset.trim, rampSeconds, now)

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
      makeup.dispose()
      reverb.dispose()
      meter.dispose()
      volume.dispose()
      gate.dispose()
      limiter.dispose()
    },
  }
}
