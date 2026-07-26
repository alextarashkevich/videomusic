// Downloads the MediaPipe hand landmarker model into public/models/.
// The model is committed to the repo so the deployed app has no runtime dependency on
// Google's CDN and the exact bytes we tested are the bytes that ship.
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dest = resolve(root, 'public/models/hand_landmarker.task')

const existing = await stat(dest).catch(() => null)
if (existing) {
  console.log(`hand_landmarker.task already present (${(existing.size / 1e6).toFixed(1)} MB)`)
  process.exit(0)
}

await mkdir(dirname(dest), { recursive: true })

console.log(`Downloading ${MODEL_URL}`)
const response = await fetch(MODEL_URL)
if (!response.ok || !response.body) {
  console.error(`Download failed: ${response.status} ${response.statusText}`)
  process.exit(1)
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))

const { size } = await stat(dest)
console.log(`Saved public/models/hand_landmarker.task (${(size / 1e6).toFixed(1)} MB)`)
