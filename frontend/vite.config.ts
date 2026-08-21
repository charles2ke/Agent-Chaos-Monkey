import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Set to "/<repo-name>/" when publishing to GitHub Pages project sites.
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.CHAOS_API_URL ?? 'http://localhost:5249',
        changeOrigin: true,
      },
    },
  },
})
