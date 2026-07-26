import { defineConfig } from 'vitest/config'

// Deployed at https://<user>.github.io/videomusic/ — every asset URL must go through
// import.meta.env.BASE_URL so it resolves both here and on localhost.
//
// MediaPipe's wasm and model live in public/ and are put there by scripts/copy-wasm.mjs
// and scripts/fetch-model.mjs, so nothing is fetched from a CDN at runtime.
export default defineConfig({
  base: '/videomusic/',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
