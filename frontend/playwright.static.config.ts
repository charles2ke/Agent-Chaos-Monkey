import { defineConfig, devices } from '@playwright/test'

/**
 * Verifies the statically published (GitHub Pages) build: no backend, chaos runs in the browser.
 */
export default defineConfig({
  testDir: './e2e-static',
  fullyParallel: false,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:4173/Agent-Chaos-Monkey/',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/Agent-Chaos-Monkey/',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_STATIC_DEMO: 'true',
      VITE_BASE_PATH: '/Agent-Chaos-Monkey/',
    },
  },
})
