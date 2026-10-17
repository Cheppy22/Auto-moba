import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Production-build checks (manifest, service worker, offline start, update prompt, resume): they
// run against dist/ served like GitHub Pages (at / and at /v2/), not the dev server.
// Run with `npm run e2e:prod`.
const localChromium = '/opt/pw-browsers/chromium';
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/prod',
  timeout: 180_000,
  retries: 0,
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
    command: `npm run build && npx tsx tools/serve-dist.ts ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
