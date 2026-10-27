import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend the dev server proxies to (override with API_URL=http://host:port).
const apiTarget = process.env.API_URL ?? 'http://localhost:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // hls.js lives in its own lazy-loaded player chunk, so it's expected to be large.
    chunkSizeWarningLimit: 650,
  },
  server: {
    proxy: {
      '/api': apiTarget,
      '/media': apiTarget,
    },
  },
})
