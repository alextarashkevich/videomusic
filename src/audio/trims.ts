/**
 * Measuring how loud each preset is, so the numbers in `presets.ts` are measured rather
 * than guessed.
 *
 * Switching sound mid-performance should change the sound and nothing else. Left alone, a
 * detuned sawtooth stack arrives roughly twice as loud as a sine, and picking a preset
 * becomes a volume decision as much as a timbre one.
 *
 * Run it by loading the app with `?trims=1`; it prints a block ready to paste back into
 * `presets.ts`. It has to run in a browser, because there is no Web Audio outside one.
 *
 * **Peak over the first half-second**, not RMS over the whole thing. RMS is the right
 * measure for a held tone and the wrong one for a struck one: a piano chord spends most of
 * any window decaying, so matching average energy would make it arrive far too loud. Peak
 * early on is what the two have in common. It is still a proxy — loudness is a perceptual
 * quantity and this is a physical one — so treat the numbers as a starting point that is
 * right to within a hair rather than as the final word over your own ears.
 */
import * as Tone from 'tone'
import { sampleUrls } from './pianoSampler'
import { PRESETS, type Preset } from './presets'
import { chordPitches, midiToFrequency, midiToNote, voiceGains, VOICE_COUNT } from './voicing'
import type { Config } from '../config'

const WINDOW_SECONDS = 0.5

/**
 * Level everything is matched to.
 *
 * Chosen so the quietest preset needs no attenuation at all, which keeps the instrument's
 * overall loudness where it has always been. Anything lower would quietly turn the whole
 * thing down; anything higher would ask a preset to be amplified into the limiter.
 */
const TARGET_PEAK = 0.95

function peakOf(buffer: Tone.ToneAudioBuffer): number {
  let peak = 0
  for (const sample of buffer.getChannelData(0)) {
    const level = Math.abs(sample)
    if (level > peak) peak = level
  }
  return peak
}

async function render(preset: Preset, config: Config): Promise<number> {
  const pitches = chordPitches(1, 'major', 3, config)
  const gains = voiceGains(3)

  if (preset.sampler !== undefined) {
    // The audio has to be decoded *before* the offline render, and handed over as buffers
    // rather than as URLs. A Sampler built inside the render would start its own fetch and
    // still be waiting for it when the render finished — which is exactly what "buffer is
    // either not set or not loaded" means. Buffers are not tied to the context that decoded
    // them, so passing them across is fine.
    const urls = sampleUrls()
    const buffers = new Tone.ToneAudioBuffers({
      urls,
      baseUrl: `${import.meta.env.BASE_URL}samples/piano/`,
    })
    await Tone.loaded()

    const decoded: Record<string, Tone.ToneAudioBuffer> = {}
    for (const note of Object.keys(urls)) decoded[note] = buffers.get(note)

    const notes = pitches
      .filter((_, index) => (gains[index] ?? 0) > 0)
      .map((pitch) => midiToNote(pitch))

    return peakOf(
      await Tone.Offline(() => {
        new Tone.Sampler(decoded).toDestination().triggerAttack(notes, 0, gains[0])
      }, WINDOW_SECONDS),
    )
  }

  const envelope = preset.envelope ?? { attack: 0.01, decay: 0, sustain: 1, release: 0.1 }

  return peakOf(
    await Tone.Offline(() => {
      const out = new Tone.Gain(1).toDestination()

      for (let index = 0; index < VOICE_COUNT; index++) {
        if ((gains[index] ?? 0) <= 0) continue

        const gain = new Tone.Gain(gains[index]!).connect(out)
        const synth = new Tone.Synth({ envelope: { ...envelope } }).connect(gain)
        synth.oscillator.type = preset.oscillator.type as Tone.Synth['oscillator']['type']
        if (preset.oscillator.count !== undefined) {
          const fat = synth.oscillator as unknown as { count: number; spread: number }
          fat.count = preset.oscillator.count
          fat.spread = preset.oscillator.spread ?? 20
        }
        synth.triggerAttack(midiToFrequency(pitches[index]!), 0)
      }
    }, WINDOW_SECONDS),
  )
}

/** Prints a table ready to read back into `presets.ts`. Called for its console output. */
export async function measureTrims(config: Config): Promise<void> {
  const lines: string[] = []

  for (const preset of PRESETS) {
    const peak = await render(preset, config)
    const trim = peak === 0 ? 1 : Math.round((TARGET_PEAK / peak) * 100) / 100
    lines.push(
      `${preset.name.padEnd(12)} peak ${peak.toFixed(3)}   trim ${trim.toFixed(2)}   (currently ${preset.trim})`,
    )
  }

  console.log(['Preset loudness, peak over the first 500 ms:', ...lines].join('\n'))
}
