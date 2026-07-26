import { defineConfig } from 'vitest/config'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Deployed at https://<user>.github.io/videomusic/ — every asset URL must go through
// import.meta.env.BASE_URL so it resolves both here and on localhost.
export default defineConfig({
  base: '/videomusic/',
  plugins: [
    // Vendor MediaPipe's wasm out of node_modules instead of pulling it from a CDN at
    // runtime: the version is then pinned by package-lock, the app works offline, and no
    // third party can swap the inference runtime under us.
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@mediapipe/tasks-vision/wasm/*',
          dest: 'mediapipe/wasm',
        },
      ],
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
