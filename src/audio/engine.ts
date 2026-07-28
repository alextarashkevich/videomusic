import * as Tone from 'tone'
import type { Config } from '../config'
import { createSettler } from '../gesture/stabilizer'
import type { Density, PerformanceState } from '../types'
import { DEFAULT_PRESET, findPreset, type Preset } from './presets'
import { loadSamples, SUSTAIN_SECONDS } from './sampleSets'
import {
  chordPitches,
  leadVoicing,
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
  /** The notes actually sounding, lowest first — not the chord in root position, but where
   *  the voices ended up. The only honest answer to "what am I hearing?". */
  getNotes: () => string[]
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
 * gate is a fade rather than a cut because there is nothing to cut. Sampled instruments are
 * the other, and they exist because no amount of filtering a sawtooth stack makes it a
 * string section; a recording of one simply is one.
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
  /** Holds a chord back until both hands have finished arriving — see `createSettler`, and
   *  `config.smoothing.settleSeconds` for what it costs. */
  const settling = createSettler<string>()
  let pitches: number[] | null = null
  /** Which note of the chord each voice is holding — see `leadVoicing`. */
  let sources: number[] = [0, 1, 2, 3]
  /** The density the current voicing was built for, so `getNotes` can say which voices of it
   *  are actually sounding. */
  let lastDensity: Density = 3
  let sampler: Tone.Sampler | null = null
  let sounding: string[] = []
  /** When the sampled chord currently ringing was struck. A recording runs out; this is what
   *  the refresh in `update` measures against so it never does so audibly. */
  let struckAt = 0

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
      sampler = null
      oscillators.gain.value = 1
      samples.gain.value = 0

      // A retriggering preset leaves its voices decayed to silence, so coming back to a held
      // one has to attack them again or the instrument is simply mute.
      if (wasStruck && next.retrigger !== true) {
        for (const [index, voice] of voices.entries()) {
          voice.synth.triggerAttack(midiToFrequency(pitches?.[index] ?? 60))
        }
      }
    } else {
      sampler = null
      sounding = []
      oscillators.gain.value = 0
      samples.gain.value = 1

      // A megabyte or two each, so they wait until somebody actually asks for that
      // instrument. Cached per set, so switching away and back does not fetch again.
      const wanted = next.sampler
      loadSamples(wanted, samples)
        .then((loaded) => {
          // Guard against a slow load landing after the player has moved on: without this,
          // choosing strings and then organ leaves the strings sampler wired up as the one
          // that gets struck.
          if (preset.sampler === wanted) sampler = loaded
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
   * Returns false when it could not — a sample set is a megabyte or two and the first chord
   * after choosing it can easily arrive before the files have. The caller must then leave
   * the chord uncommitted, so it is struck as soon as the samples land rather than staying
   * silent until the player happens to change gesture.
   */
  function strike(next: number[], gains: number[], at: number): boolean {
    if (preset.sampler !== undefined) {
      if (sampler === null) return false
      if (sounding.length > 0) sampler.triggerRelease(sounding, at)

      sounding = []
      for (const [index, pitch] of next.entries()) {
        if ((gains[index] ?? 0) <= 0) continue
        const note = midiToNote(pitch)
        sounding.push(note)
        sampler.triggerAttack(note, at, gains[index])
      }
      struckAt = at
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
      // Which voice holds which note of the chord decides which one a thin density silences,
      // so the gains cannot be worked out until the chord has been voiced.
      const gains = voiceGains(state.density, sources)

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

        // What the hands are showing is not yet what they mean. Both hands have to be
        // rearranged to change chord and they do not land together, so the reading passes
        // through chords nobody asked for — and a struck preset would strike each one.
        // Waiting for the reading to stand still is what makes the in-between silent; a
        // chord only passed through is never returned here. Costs `settleSeconds` on every
        // change, which is why it is a slider.
        // Asking whether the settled chord *is the one being shown* rather than merely
        // whether it differs from what is playing: the two come apart whenever `lastChord`
        // was cleared without the reading changing — a failed strike waiting on samples, or
        // a preset switch — and there the second question would wave a half-formed chord
        // straight through.
        const settled = settling.push(chord, now, config.smoothing.settleSeconds)

        if (settled === chord && chord !== lastChord) {
          const target = chordPitches(state.degree, state.quality, state.density, config)
          const voicing = leadVoicing(target, pitches, registerFor(config))
          pitches = voicing.pitches
          sources = voicing.sources
          lastDensity = state.density
          // Re-read now that the assignment is known, or this chord would be shaped by the
          // last one's.
          gains.splice(0, gains.length, ...voiceGains(state.density, sources))

          // Struck presets re-attack, which is also why changing the left hand re-strikes:
          // density is part of the chord, so reaching for a seventh plays the chord again.
          // Held presets slide, which is what makes a progression feel continuous.
          if (preset.retrigger === true) {
            // Left uncommitted if the strike could not happen — a muted chord has nothing
            // to strike, and samples that have not finished loading need asking again.
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

      /**
       * Play the same chord again before the recording runs out.
       *
       * A recorded note is finite — around ten to twelve seconds here, measured rather than
       * assumed, and one of them is cut off mid-note rather than fading. On an instrument
       * played by *holding* a shape, that means the sound dying while the player is still
       * holding it and has changed nothing: the one failure that looks exactly like a bug.
       *
       * The re-strike releases the ringing notes over a 1.4-second tail while the new ones
       * come in under it, so the seam is a crossfade. On the two organs there is no attack
       * transient to hear at all; on the strings it reads as a bow change, which is what a
       * real player holding a long note does anyway.
       */
      if (
        preset.sampler !== undefined &&
        state.gate &&
        state.degree !== null &&
        pitches !== null &&
        sounding.length > 0 &&
        now - struckAt > SUSTAIN_SECONDS[preset.sampler]
      ) {
        strike(pitches, gains, now)
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

    getNotes() {
      if (pitches === null) return []
      const audible = voiceGains(lastDensity, sources)
      return pitches
        .filter((_, index) => (audible[index] ?? 0) > 0)
        .sort((a, b) => a - b)
        .map(midiToNote)
    },

    dispose() {
      for (const { synth, gain, panner } of voices) {
        synth.dispose()
        gain.dispose()
        panner.dispose()
      }
      sampler?.dispose()
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
