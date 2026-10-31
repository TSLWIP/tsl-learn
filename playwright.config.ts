import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://localhost:4173/__stats',
    reuseExistingServer: false,
    timeout: 30_000,
    env: { CLIPS_PORT: '4176', CLIPS_NOCORS_PORT: '4177' },
  },
  projects: [
    // Storage and offline chaos: bundled Chromium is enough (no video decoding needed).
    { name: 'chromium', testMatch: 'chaos.spec.ts', use: { ...devices['Desktop Chrome'] } },
    // Lookup and playback need H.264, which bundled Chromium lacks: use installed Chrome locally,
    // and in CI (ubuntu runner has Chrome preinstalled).
    { name: 'chrome', testMatch: /(lookup|learn|milestone5|a11y|clip-host)\.spec\.ts/, use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'real', testMatch: 'real.spec.ts', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
});
