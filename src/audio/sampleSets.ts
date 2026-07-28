/**
 * The recorded instruments.
 *
 * From nbrosowsky/tonejs-instruments, CC-BY 3.0 — the sample set Tone.js's own instrument
 * demos use. The files are committed to the repo and served from our own origin, the same
 * rule the hand tracker's model follows: nothing is fetched from anyone else's hosting at
 * runtime.
 *
 * These exist because the oscillator presets, however carefully filtered and detuned, sound
 * like a synthesiser imitating an instrument. A sawtooth called "Strings" and a sine called
 * "Organ" are the two most recognisable examples of that in the world. A recording is not a
 * better approximation of the thing — it *is* the thing.
 *
 * Note that all three are **sustained** recordings, not struck ones. That distinction is the
 * whole point: a piano decays to nothing whatever you do, so holding a gesture holds a chord
 * that is dying. An organ, a reed organ and a bowed string do not.
 */
import * as Tone from 'tone'

/** Must match `scripts/sample-sets.mjs`, which is what actually downloads them. A test
 *  compares the two, because a list that silently drifts apart from the files on disk fails
 *  as a missing note in the middle of a chord. */
export const SAMPLE_SETS = {
  organ: ['C2', 'Fs2', 'C3', 'Fs3', 'C4', 'Fs4', 'C5'],
  pad: ['C2', 'Fs2', 'C3', 'Fs3', 'C4', 'Ds4', 'G4'],
  strings: ['C2', 'E2', 'Gs2', 'Cs3', 'E3', 'Gs3', 'B3', 'C4', 'E4', 'G4'],
} as const satisfies Record<string, readonly string[]>

export type SampleSetName = keyof typeof SAMPLE_SETS

/**
 * How long a note of each set keeps sounding before the recording runs out, in seconds.
 *
 * Measured on the files themselves rather than guessed. A held chord is re-struck once this
 * has elapsed — see `engine.ts` — because otherwise an instrument you are asked to *hold* a
 * gesture on goes silent while you are still holding it.
 *
 * The numbers sit under the true lengths on purpose. Two of these fade out naturally near
 * the end and one, the reed organ, is cut off mid-note at twelve seconds; refreshing before
 * either happens means the seam is a re-attack rather than a hole.
 */
export const SUSTAIN_SECONDS: Record<SampleSetName, number> = {
  organ: 9,
  pad: 9,
  strings: 10,
}

/** Filenames write sharps as `s`; the Sampler wants real note names. */
export function sampleUrls(set: SampleSetName): Record<string, string> {
  const urls: Record<string, string> = {}
  for (const note of SAMPLE_SETS[set]) urls[note.replace('s', '#')] = `${note}.mp3`
  return urls
}

/**
 * Loads one instrument, once.
 *
 * Deferred until a preset that needs it is actually chosen: somebody who only ever plays the
 * clean synth should not wait for a string section. Promises are cached per set, so
 * switching away and back does not fetch anything twice.
 */
const loading = new Map<SampleSetName, Promise<Tone.Sampler>>()

export function loadSamples(
  set: SampleSetName,
  destination: Tone.InputNode,
): Promise<Tone.Sampler> {
  const existing = loading.get(set)
  if (existing !== undefined) return existing

  const started = new Promise<Tone.Sampler>((resolve, reject) => {
    const sampler = new Tone.Sampler({
      urls: sampleUrls(set),
      baseUrl: `${import.meta.env.BASE_URL}samples/${set}/`,
      // Long enough that a chord being replaced rings on underneath its replacement, which
      // is what turns a re-strike into a crossfade rather than a cut.
      release: 1.4,
      onload: () => resolve(sampler),
      onerror: (error) => reject(error instanceof Error ? error : new Error(String(error))),
    }).connect(destination)
  })

  loading.set(set, started)
  return started
}
