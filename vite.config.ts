import { defineConfig } from 'vitest/config'

// Deployed at https://<user>.github.io/videomusic/ — every asset URL must go through
// import.meta.env.BASE_URL so it resolves both here and on localhost.
//
// MediaPipe's wasm and model live in public/ and are put there by scripts/copy-wasm.mjs
// and scripts/fetch-model.mjs, so nothing is fetched from a CDN at runtime.
export default defineConfig({
  base: '/videomusic/',
  build: {
    // Tone.js is most of what is left. Beside the ~11 MB of MediaPipe wasm and the 7.8 MB
    // model this page also loads, ~120 kB gzipped is a rounding error, so the default
    // 500 kB warning is noise here rather than a signal.
    //
    // It used to be nearly four times this, almost all Three.js, for one fullscreen shader.
    // Replacing that with four canvas gradients took the bundle from 941 kB to 433 kB.
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
