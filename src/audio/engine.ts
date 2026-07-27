import * as Tone from 'tone'
import type { Config } from '../config'
import type { PerformanceState } from '../types'
import { loadPiano } from './pianoSampler'
import { DEFAULT_PRESET, findPreset, type Preset } from './presets'
import {
  chordPitches,
  leadVoices,
  midiToFrequency,
  midiToNote,
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

type Voice = { synth: Tone.Synth; gain: Tone.Gain; panner: Tone.Panner }

/** What a preset that never re-triggers needs: attacked once and held for the life of the
 *  instrument, so everything audible is done with gains and there is no note-on latency. */
const HELD = { attack: 0.01, decay: 0, sustain: 1, release: 0.1 } as const

/**
 * Builds the synth.
 *
 * Two ways of making sound share one output chain. Held voices are the original design and
 * still the default — four oscillators attacked at startup and never retriggered, where the
 * gate is a fade rather than a cut because there is nothing to cut. The sampled piano is
 * the other, and it exists because a piano is a hammer and a decay: no amount of gain-riding
 * a held tone imitates one.
 *
 * Both feed the same filter, reverb, volume, gate and limiter, so switching between them
 * changes the instrument and nothing else.
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

  const reverb = new Tone.Reverb({ decay: 2.8, preDelay: 0.012, wet: 0.22 }).connect(volume)
  await reverb.generate()

  // Matches presets to each other in loudness; nothing else sits on this stage.
  const makeup = new Tone.Gain(1).connect(reverb)

  const tone = new Tone.Filter({ type: 'lowpass', frequency: 6000, rolloff: -12, Q: 0.4 })
  tone.connect(makeup)

  // One bus each, so choosing a sampled preset is a crossfade rather than a rebuild.
  const oscillators = new Tone.Gain(1).connect(tone)
  const samples = new Tone.Gain(0).connect(tone)

  const voices: Voice[] = []
  for (let index = 0; index < VOICE_COUNT; index++) {
    const panner = new Tone.Panner(0).connect(oscillators)
    const gain = new Tone.Gain(0).connect(panner)
    const synth = new Tone.Synth({ envelope: { ...HELD } }).connect(gain)

    synth.triggerAttack(midiToFrequency(60))
    voices.push({ synth, gain, panner })
  }

  let preset: Preset = findPreset(DEFAULT_PRESET)
  let lastChord = ''
  let pitches: number[] | null = null
  let piano: Tone.Sampler | null = null
  let sounding: string[] = []

  function applyPreset(next: Preset): void {
    const wasStruck = preset.retrigger === true
    preset = next

    for (const [index, voice] of voices.entries()) {
      const { synth, panner } = voice
      synth.oscillator.type = next.oscillator.type as Tone.Synth['oscillator']['type']
      if (next.oscillator.count !== undefined) {
        // `count` and `spread` only exist on the fat oscillator family.
        const fat = synth.oscillator as unknown as { count: number; spread: number }
        fat.count = next.oscillator.count
        fat.spread = next.oscillator.spread ?? 20
      }

      synth.envelope.set(next.envelope ?? HELD)

      // Voices sit at -1.5, -0.5, 0.5 and 1.5 steps from centre, so the spread is symmetric
      // and the middle two stay near the middle. Four voices stacked dead centre is where a
      // chord stops sounding like several notes and starts sounding like one thick one.
      const offset = (index - (VOICE_COUNT - 1) / 2) / ((VOICE_COUNT - 1) / 2)
      panner.pan.value = (offset * (next.spreadStereo ?? 0)) / 90
      synth.detune.value = offset * (next.detuneCents ?? 0)
    }

    if (next.sampler === undefined) {
      oscillators.gain.value = 1
      samples.gain.value = 0

      // A struck preset leaves its voices decayed to silence, so coming back to a held one
      // has to attack them again or the instrument is simply mute.
      if (wasStruck && next.retrigger !== true) {
        for (const [index, voice] of voices.entries()) {
          voice.synth.triggerAttack(midiToFrequency(pitches?.[index] ?? 60))
        }
      }
    } else {
      oscillators.gain.value = 0
      samples.gain.value = 1
      // Two megabytes of it, so it waits until somebody actually asks for a piano.
      loadPiano(samples)
        .then((loaded) => {
          piano = loaded
        })
        .catch(() => {
          // Nothing to recover to but the oscillators; better a different sound than none.
          oscillators.gain.value = 1
          samples.gain.value = 0
        })
    }

    tone.frequency.value = next.filter.frequency
    tone.Q.value = next.filter.Q
    reverb.wet.value = next.reverbWet
    // Re-voice on the next update: a struck preset needs to hear the chord again to play it.
    lastChord = ''
  }

  applyPreset(preset)

  /**
   * Strikes the chord, for presets that are struck rather than held.
   *
   * Returns false when it could not — the piano is two megabytes and the first chord after
   * choosing it can easily arrive before the samples have. The caller must then leave the
   * chord uncommitted, so it is struck as soon as the samples land rather than staying
   * silent until the player happens to change gesture.
   */
  function strike(next: number[], gains: number[], at: number): boolean {
    if (preset.sampler !== undefined) {
      if (piano === null) return false
      if (sounding.length > 0) piano.triggerRelease(sounding, at)

      sounding = []
      for (const [index, pitch] of next.entries()) {
        if ((gains[index] ?? 0) <= 0) continue
        const note = midiToNote(pitch)
        sounding.push(note)
        piano.triggerAttack(note, at, gains[index])
      }
      return true
    }

    for (const [index, voice] of voices.entries()) {
      voice.synth.frequency.setValueAtTime(midiToFrequency(next[index]!), at)
      if ((gains[index] ?? 0) > 0) voice.synth.triggerAttack(midiToFrequency(next[index]!), at)
    }
    return true
  }

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
      const { rampSeconds, gateFadeSeconds } = config.smoothing
      const glideSeconds = preset.glideSeconds ?? config.smoothing.glideSeconds
      const gains = voiceGains(state.density)

      if (state.degree !== null) {
        // Only re-voice when the chord actually changes — the assignment search would
        // otherwise run every frame, and re-leading an unchanged chord could drift it.
        const chord = [
          state.degree,
          state.quality,
          state.density,
          state.gate,
          config.music.root,
          config.music.scale.join(),
        ].join('|')

        if (chord !== lastChord) {
          const target = chordPitches(state.degree, state.quality, state.density, config)
          pitches = leadVoices(target, pitches, registerFor(config))

          // Struck presets re-attack, which is also why changing the left hand re-strikes:
          // density is part of the chord, so reaching for a seventh plays the chord again.
          // Held presets slide, which is what makes a progression feel continuous.
          if (preset.retrigger === true) {
            // Left uncommitted if the strike could not happen — a muted chord has nothing
            // to strike, and a piano that has not finished loading needs asking again.
            if (state.gate && strike(pitches, gains, now)) lastChord = chord
          } else {
            lastChord = chord
            for (let index = 0; index < VOICE_COUNT; index++) {
              voices[index]!.synth.frequency.rampTo(
                midiToFrequency(pitches[index]!),
                glideSeconds,
                now,
              )
            }
          }
        }
      }

      // A sampled preset carries its own note levels from the strike, so riding these as
      // well would apply the density twice.
      if (preset.sampler === undefined) {
        for (let index = 0; index < VOICE_COUNT; index++) {
          voices[index]!.gain.gain.rampTo(gains[index]!, rampSeconds, now)
        }
      }

      makeup.gain.rampTo(preset.trim, rampSeconds, now)
      volume.gain.rampTo(state.volume, rampSeconds, now)

      // Nothing to play before the first recognised gesture, so stay silent until then.
      const audible = state.gate && state.degree !== null
      gate.gain.rampTo(audible ? 1 : 0, gateFadeSeconds, now)
    },

    getLevel() {
      const value = meter.getValue()
      return typeof value === 'number' ? value : 0
    },

    dispose() {
      for (const { synth, gain, panner } of voices) {
        synth.dispose()
        gain.dispose()
        panner.dispose()
      }
      piano?.dispose()
      oscillators.dispose()
      samples.dispose()
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
