// Downloads instrument samples into public/samples/<set>/.
//
// Recorded instruments from nbrosowsky/tonejs-instruments, CC-BY 3.0. Which sets and which
// notes, and why those, is in scripts/sample-sets.mjs.
//
// Files already present are left alone, so this is cheap to re-run and `npm run dev` can
// depend on it.
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SAMPLE_SETS } from './sample-sets.mjs'

const BASE = 'https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let downloaded = 0
let bytes = 0

for (const set of SAMPLE_SETS) {
  const folder = resolve(root, 'public/samples', set.folder)
  await mkdir(folder, { recursive: true })

  for (const source of set.sources) {
    for (const note of source.notes) {
      const file = `${note}.mp3`
      const dest = resolve(folder, file)

      const existing = await stat(dest).catch(() => null)
      if (existing) {
        bytes += existing.size
        continue
      }

      const url = `${BASE}${source.instrument}/${file}`
      const response = await fetch(url)
      if (!response.ok || !response.body) {
        console.error(`Download failed for ${url}: ${response.status} ${response.statusText}`)
        process.exit(1)
      }

      await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
      const { size } = await stat(dest)
      bytes += size
      downloaded++
    }
  }
}

const files = SAMPLE_SETS.reduce(
  (total, set) => total + set.sources.reduce((count, source) => count + source.notes.length, 0),
  0,
)
const total = `${(bytes / 1e6).toFixed(1)} MB`

if (downloaded === 0) console.log(`instrument samples already present (${files} files, ${total})`)
else console.log(`Saved ${downloaded} instrument samples to public/samples (${total} total)`)
