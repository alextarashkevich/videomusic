/**
 * The recorded piano.
 *
 * Salamander Grand Piano by Alexander Holm, CC-BY 3.0 — the sample set Tone.js ships in its
 * own examples. The files are committed to the repo and served from our own origin, the
 * same rule the hand tracker's model follows: nothing is fetched from anyone else's hosting
 * at runtime.
 */
import * as Tone from 'tone'

/**
 * Must match `scripts/piano-notes.mjs`, which is what actually downloads them. A test
 * compares the two, because a list that silently drifts apart from the files on disk fails
 * as a missing note in the middle of a chord.
 */
export const PIANO_NOTES = [
  'C1', 'Ds1', 'Fs1', 'A1',
  'C2', 'Ds2', 'Fs2', 'A2',
  'C3', 'Ds3', 'Fs3', 'A3',
  'C4', 'Ds4', 'Fs4', 'A4',
  'C5', 'Ds5', 'Fs5', 'A5',
  'C6', 'Ds6', 'Fs6', 'A6',
  'C7',
] as const

/** Salamander writes sharps as `s` in filenames; the Sampler wants real note names. */
export function sampleUrls(): Record<string, string> {
  const urls: Record<string, string> = {}
  for (const note of PIANO_NOTES) urls[note.replace('s', '#')] = `${note}.mp3`
  return urls
}

/**
 * Loads the piano, once.
 *
 * Deferred until a piano preset is actually chosen: it is about two megabytes and twenty-five
 * files, and somebody who only ever plays the pad should not wait for it. The promise is
 * cached so switching away and back does not fetch it twice.
 */
let loading: Promise<Tone.Sampler> | null = null

export function loadPiano(destination: Tone.InputNode): Promise<Tone.Sampler> {
  loading ??= new Promise<Tone.Sampler>((resolve, reject) => {
    const sampler = new Tone.Sampler({
      urls: sampleUrls(),
      baseUrl: `${import.meta.env.BASE_URL}samples/piano/`,
      // Long enough to let a struck chord ring out properly rather than being cut off when
      // the next one arrives.
      release: 1.4,
      onload: () => resolve(sampler),
      onerror: (error) => reject(error instanceof Error ? error : new Error(String(error))),
    }).connect(destination)
  })

  return loading
}
