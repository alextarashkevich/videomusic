import { describe, expect, it } from 'vitest'
import { SAMPLE_SETS as DOWNLOADED } from '../../scripts/sample-sets.mjs'
import { PRESETS } from './presets'
import { SAMPLE_SETS, SUSTAIN_SECONDS, sampleUrls, type SampleSetName } from './sampleSets'

/** Every sample actually sitting in public/, by path. Globbed rather than read with node:fs
 *  so this stays a browser-shaped project with no Node types in it. */
const onDisk = new Set(
  Object.keys(import.meta.glob('../../public/samples/*/*.mp3')).map((path) =>
    path.split('/').slice(-2).join('/'),
  ),
)

const NAMES = Object.keys(SAMPLE_SETS) as SampleSetName[]

/** Working range of the instrument — see registerFor in audio/voicing.ts, which is where
 *  these two numbers come from. Every chord it can play lives between them. The bottom is
 *  the bass voice, an octave under the chord root. */
const LOWEST_PLAYED = 36
const HIGHEST_PLAYED = 67

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function midiOf(note: string): number {
  const [, letter, sharp, octave] = /^([A-G])(s?)(\d)$/.exec(note)!
  return (Number(octave) + 1) * 12 + SEMITONE[letter!]! + (sharp === 's' ? 1 : 0)
}

describe('sample sets', () => {
  // The engine's lists and the download script's lists are written out separately — one is
  // TypeScript, the other has to run in plain Node before the build. Drift between them does
  // not fail loudly; it fails as a note missing from the middle of a chord.
  it('asks for exactly the notes the script downloads', () => {
    const downloaded: Record<string, string[]> = Object.fromEntries(
      DOWNLOADED.map((set) => [set.folder, set.sources.flatMap((source) => source.notes)]),
    )

    for (const name of NAMES) {
      expect([...SAMPLE_SETS[name]].sort(), name).toEqual(downloaded[name]?.sort())
    }
    expect(Object.keys(downloaded).sort()).toEqual([...NAMES].sort())
  })

  it('turns the filenames into note names the Sampler understands', () => {
    const urls = sampleUrls('organ')
    expect(urls['F#2']).toBe('Fs2.mp3')
    expect(urls['C4']).toBe('C4.mp3')
    expect(Object.keys(urls)).toHaveLength(SAMPLE_SETS.organ.length)
  })

  // Catches the case where somebody adds a note without running the download script, which
  // otherwise shows up as a chord with a hole in it.
  it('has every file on disk', () => {
    for (const name of NAMES) {
      for (const file of Object.values(sampleUrls(name))) {
        expect(onDisk.has(`${name}/${file}`), `${name}/${file}`).toBe(true)
      }
    }
  })

  /**
   * The property that actually matters is not the gap between samples but how far the
   * Sampler has to stretch one to fill it — it picks the *nearest* recording, so a gap of
   * six is a stretch of three, not of six. Past about three semitones an instrument starts
   * to sound like a stretched recording rather than like itself.
   */
  it('never stretches a recording more than three semitones', () => {
    for (const name of NAMES) {
      const available = SAMPLE_SETS[name].map(midiOf)

      for (let pitch = LOWEST_PLAYED; pitch <= HIGHEST_PLAYED; pitch++) {
        const nearest = Math.min(...available.map((sample) => Math.abs(sample - pitch)))
        expect(nearest, `${name} at MIDI ${pitch}`).toBeLessThanOrEqual(3)
      }
    }
  })

  // A recording runs out. The engine re-strikes a held chord after this many seconds, so it
  // has to sit under the true length of the shortest note in the set — the measured lengths
  // are 10.5s for the reed organ, 12.4s for the organ and 13.3s for the violin.
  it('refreshes each set before its recordings run out', () => {
    for (const name of NAMES) {
      expect(SUSTAIN_SECONDS[name], name).toBeGreaterThan(0)
      expect(SUSTAIN_SECONDS[name], name).toBeLessThan(10.5)
    }
  })
})

describe('presets', () => {
  // Struck presets — a piano, an electric piano, a pluck — were removed deliberately: on an
  // instrument played by holding a shape, a chord that decays while the hand is still up
  // fights the way the thing is played. This is what keeps one from creeping back in.
  it('has no preset that decays while a gesture is held', () => {
    for (const preset of PRESETS) {
      if (preset.sampler !== undefined) continue
      expect(preset.envelope?.sustain ?? 1, preset.name).toBeGreaterThan(0.5)
    }
  })

  it('names a real sample set wherever it names one at all', () => {
    for (const preset of PRESETS) {
      if (preset.sampler === undefined) continue
      expect(NAMES, preset.name).toContain(preset.sampler)
    }
  })

  // Every preset is reachable from a number key, and the keys only go to 9.
  it('fits on the number row', () => {
    expect(PRESETS.length).toBeLessThanOrEqual(9)
    expect(new Set(PRESETS.map((preset) => preset.name)).size).toBe(PRESETS.length)
  })
})
