import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const localChromium = '/opt/pw-browsers/chromium';
// parallel worktrees set PW_PORT so they never reuse each other's dev server
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  retries: 0,
  // software WebGL is CPU-bound: two browsers at once only make every test slower
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
    launchOptions: existsSync(localChromium)
      ? { executablePath: localChromium, args: ['--no-sandbox'] }
      : {},
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
