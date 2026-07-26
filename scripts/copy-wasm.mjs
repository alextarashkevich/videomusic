// Copies MediaPipe's wasm runtime out of node_modules into public/ so Vite serves it
// from our own origin in both dev and production.
//
// The point is to have no third-party runtime dependency: the version is pinned by
// package-lock, the app works offline, and no CDN can swap the inference runtime under
// us. The files are ~22 MB, so they are regenerated from node_modules rather than
// committed — CI runs this on every build.
import { cp, mkdir, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const to = resolve(root, 'public/mediapipe/wasm')

// FilesetResolver picks between the SIMD build and the nosimd fallback at runtime.
// The `module` variants serve a different loading mode we do not use.
const NEEDED = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

const available = await readdir(from).catch(() => {
  console.error(`Missing ${from} — run npm install first.`)
  process.exit(1)
})

const missing = NEEDED.filter((name) => !available.includes(name))
if (missing.length > 0) {
  console.error(`@mediapipe/tasks-vision did not ship: ${missing.join(', ')}`)
  process.exit(1)
}

await mkdir(to, { recursive: true })
for (const name of NEEDED) {
  await cp(resolve(from, name), resolve(to, name))
}

console.log(`Copied ${NEEDED.length} MediaPipe wasm files to public/mediapipe/wasm/`)
