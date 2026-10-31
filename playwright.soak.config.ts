import { defineConfig, devices } from '@playwright/test';

// Serves the built copy under /tsl-learn/ (like a GitHub Pages project site) on its own port.
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'soak.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://localhost:4174/__stats',
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: '4174', BASE_PATH: '/tsl-learn', REAL: process.env.REAL ?? '0' },
  },
  projects: [{ name: 'soak', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
