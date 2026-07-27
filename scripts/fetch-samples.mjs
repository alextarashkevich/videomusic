// Downloads piano samples into public/samples/piano/.
//
// Salamander Grand Piano, recorded by Alexander Holm and released under CC-BY 3.0. These
// are the files Tone.js uses in its own examples, so they are known to load and loop
// cleanly in a Sampler.
//
// Like the hand landmarker model, they are committed to the repo: the deployed site has no
// runtime dependency on anyone else's hosting, and the exact bytes we listened to are the
// bytes that ship.
//
// Which notes, and why that spacing, is in scripts/piano-notes.mjs.
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PIANO_NOTES } from './piano-notes.mjs'

const BASE = 'https://tonejs.github.io/audio/salamander/'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const folder = resolve(root, 'public/samples/piano')

await mkdir(folder, { recursive: true })

let downloaded = 0
let bytes = 0

for (const note of PIANO_NOTES) {
  const file = `${note}.mp3`
  const dest = resolve(folder, file)

  const existing = await stat(dest).catch(() => null)
  if (existing) {
    bytes += existing.size
    continue
  }

  const response = await fetch(BASE + file)
  if (!response.ok || !response.body) {
    console.error(`Download failed for ${file}: ${response.status} ${response.statusText}`)
    process.exit(1)
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
  const { size } = await stat(dest)
  bytes += size
  downloaded++
}

const total = `${(bytes / 1e6).toFixed(1)} MB`
if (downloaded === 0) console.log(`piano samples already present (${PIANO_NOTES.length} files, ${total})`)
else console.log(`Saved ${downloaded} piano samples to public/samples/piano (${total} total)`)
