import { expect, test, type Page } from '@playwright/test';
import { snap, step, viewReady, watchErrors } from '../e2e/helpers';

// GitHub Pages serves this branch under /v2/ and a local run serves it at the root: check both.
const MOUNTS = ['/', '/v2/'];

/** Opens the game and waits until the service worker has stored it and controls the page. */
async function openAndInstall(page: Page, base: string): Promise<void> {
  await page.goto(`${base}?intro=off`);
  await expect(page.getByTestId('title')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {
    timeout: 30_000,
  });
}

async function startMatch(page: Page): Promise<void> {
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
}

for (const base of MOUNTS) {
  test.describe(`built game at ${base}`, () => {
    test('manifest, icons and fonts are shipped and nothing comes from another site', async ({
      page,
    }) => {
      const foreign: string[] = [];
      page.on('request', (r) => {
        if (!r.url().startsWith('http://localhost')) foreign.push(r.url());
      });
      await page.goto(`${base}?intro=off`);
      await expect(page.getByTestId('title')).toBeVisible();
      const href = await page.locator('link[rel="manifest"]').getAttribute('href');
      const manifestUrl = new URL(href!, page.url()).href;
      const res = await page.request.get(manifestUrl);
      expect(res.ok()).toBe(true);
      const m = await res.json();
      expect(m.display).toBe('standalone');
      expect(m.theme_color).toBe('#14110e');
      // start_url and scope resolve to the folder the game is served from (/ or /v2/)
      const folder = new URL(base, page.url()).href;
      expect(new URL(m.start_url, manifestUrl).href).toBe(folder);
      expect(new URL(m.scope, manifestUrl).href).toBe(folder);
      const sizes = m.icons.map(
        (i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`,
      );
      expect(sizes).toEqual(
        expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']),
      );
      for (const icon of m.icons) {
        const r = await page.request.get(new URL(icon.src, manifestUrl).href);
        expect(r.ok()).toBe(true);
        expect(r.headers()['content-type']).toBe('image/png');
      }
      // the display and body fonts load from this site
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(
        await page.evaluate(
          () =>
            document.fonts.check("16px 'IM Fell English SC'") &&
            document.fonts.check('16px Spectral'),
        ),
      ).toBe(true);
      expect(foreign).toEqual([]);
    });

    test('the service worker stores the game: it starts offline and plays a match offline', async ({
      page,
      request,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await openAndInstall(page, base);
      // the network is really gone: the server drops every connection (see tools/serve-dist.ts)
      await request.post('/__offline?on=1');
      try {
        // a cold start with no network: the page, its chunks and the fonts all come from the device
        await page.reload();
        await expect(page.getByTestId('title')).toBeVisible();
        await expect(page.getByTestId('build-stamp')).toContainText('build');
        // the worker (not luck) is answering: a file it does not hold is refused, not a network error
        expect(await page.evaluate(() => fetch('not-stored.txt').then((r) => r.status))).toBe(503);
        // and a whole screen flow that loads the lazy chunks (match screens, the 3D view)
        await startMatch(page);
      } finally {
        await request.post('/__offline?on=0');
      }
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });

    test('a match resumes after a reload, and its save belongs to this folder', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openAndInstall(page, base);
      await startMatch(page);
      // hold the clock so the saved tick is exact
      await page.evaluate(
        () =>
          void (window as unknown as { __session: { setUi(p: unknown): void } }).__session.setUi({
            speed: 0,
          }),
      );
      const held = (await snap(page)).tick;
      await step(page, 400);
      await page.evaluate(() => void window.dispatchEvent(new Event('pagehide')));
      // the key names the folder (/ or /v2/), so the two games on one site never read each other's
      const keys = await page.evaluate(() =>
        Object.keys(window.localStorage).filter((k) => k.startsWith('automoba.match')),
      );
      expect(keys).toEqual([`automoba.match:${base}`]);
      await page.reload();
      await page.getByTestId('resume-match').click();
      await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });
      await viewReady(page);
      expect((await snap(page)).tick).toBe(held + 400);
    });

    test('a new deployed version shows "New version ready" and reloads into it', async ({
      page,
      request,
    }) => {
      await openAndInstall(page, base);
      await expect(page.getByTestId('update-notice')).toHaveCount(0);
      // pretend a new build was deployed: sw.js now differs by one comment
      await request.post('/__bump');
      await page.evaluate(() =>
        navigator.serviceWorker.getRegistration().then((r) => r?.update().then(() => undefined)),
      );
      await expect(page.getByTestId('update-notice')).toBeVisible({ timeout: 30_000 });
      const before = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '');
      await Promise.all([page.waitForEvent('load'), page.getByTestId('update-reload').click()]);
      await expect(page.getByTestId('title')).toBeVisible();
      await expect(page.getByTestId('update-notice')).toHaveCount(0);
      // the new worker controls the page, and the old one is gone
      const reg = await page.evaluate(() =>
        navigator.serviceWorker.getRegistration().then((r) => ({
          waiting: !!r?.waiting,
          active: !!r?.active,
        })),
      );
      expect(reg).toEqual({ waiting: false, active: true });
      expect(before).toContain('sw.js');
    });
  });
}
