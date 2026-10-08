import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const localChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  retries: 0,
  // software WebGL is CPU-bound: two browsers at once only make every test slower
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
    launchOptions: existsSync(localChromium)
      ? { executablePath: localChromium, args: ['--no-sandbox'] }
      : {},
  },
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
