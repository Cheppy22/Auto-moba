import { expect, test } from '@playwright/test';
import { startLive, step, watchErrors, type TestSession } from './helpers';

interface SoundDebug {
  state: string;
  music: boolean;
  ambience: boolean;
  voices: number;
  tension: number;
  intensity: number;
  theme: string;
  cues: number;
}
interface AudioWindow {
  __sound: () => SoundDebug;
  __session: TestSession;
}

const sound = (page: import('@playwright/test').Page): Promise<SoundDebug> =>
  page.evaluate(() => (window as unknown as AudioWindow).__sound());

test('the mixer has four sliders that are remembered, and the mute switch still works', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/?intro=off');
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('mixer-panel')).toHaveCount(0);
  await page.getByTestId('mixer-toggle').click();
  await expect(page.getByTestId('mixer-panel')).toBeVisible();
  for (const bus of ['master', 'music', 'ambience', 'effects'])
    await expect(page.getByTestId(`vol-${bus}`)).toBeVisible();

  // move two sliders and the mute switch
  await page.getByTestId('vol-music').fill('20');
  await page.getByTestId('vol-effects').fill('55');
  await expect(page.getByTestId('vol-music')).toHaveValue('20');
  const saved = await page.evaluate(() => window.localStorage.getItem('automoba.mixer'));
  expect(JSON.parse(saved ?? '{}')).toMatchObject({ music: 0.2, effects: 0.55 });
  await page.getByTestId('sound-toggle').click();
  expect(await page.evaluate(() => window.localStorage.getItem('automoba.sound'))).toBe('off');

  // a reload brings the same settings back
  await page.reload();
  await page.getByTestId('mixer-toggle').click();
  await expect(page.getByTestId('vol-music')).toHaveValue('20');
  await expect(page.getByTestId('vol-effects')).toHaveValue('55');
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'false');

  // a damaged saved value falls back to the defaults instead of breaking the page
  await page.evaluate(() => window.localStorage.setItem('automoba.mixer', '{bad json'));
  await page.reload();
  await page.getByTestId('mixer-toggle').click();
  await expect(page.getByTestId('vol-master')).toHaveValue('80');
  expect(errors).toEqual([]);
});

test('the mixer opens in the pause menu too', async ({ page }) => {
  const errors = watchErrors(page);
  await startLive(page, '42', true);
  await page.getByTestId('adjourn').click();
  await expect(page.getByTestId('adjourn-panel')).toBeVisible();
  // sound, the mixer, the board theme and the tutorial live on the Settings tab
  await page.getByTestId('tab-settings-btn').click();
  await page.getByTestId('mixer-toggle').click();
  await expect(page.getByTestId('mixer-panel')).toBeVisible();
  await expect(page.getByTestId('vol-ambience')).toBeVisible();
  await expect(page.getByTestId('vol-ambience')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('a match runs with the music, garden and cues going, with no errors', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.goto('/?intro=off&mapstyle=b');
  await expect(page.getByTestId('title')).toBeVisible();
  // the first tap starts the audio; the garden follows the board theme
  await page.getByTestId('theme-a').click();
  await expect.poll(async () => (await sound(page)).theme).toBe('a');
  await page.getByTestId('theme-b').click();
  await expect.poll(async () => (await sound(page)).theme).toBe('b');
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect.poll(async () => (await sound(page)).music).toBe(true);
  const first = await sound(page);
  expect(first.ambience).toBe(true);
  expect(first.theme).toBe('b');
  expect(first.state).toBe('running');
  expect(first.tension).toBe(0);

  await page.evaluate(() =>
    (window as unknown as AudioWindow).__session.setUi({ speed: 0 } as { speed: number }),
  );
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  // a few minutes of play, stepped fast: fights, falls and gambits make sound
  let done = 0;
  for (let guard = 0; done < 3000 && guard < 30; guard++) {
    const n = await step(page, 400);
    if (n === 0) break;
    done += n;
  }
  await page.evaluate(() =>
    (window as unknown as AudioWindow).__session.setUi({ speed: 1 } as { speed: number }),
  );
  await expect
    .poll(async () => (await sound(page)).tension, { timeout: 30_000 })
    .toBeGreaterThan(0.05);
  const later = await sound(page);
  expect(later.cues).toBeGreaterThan(0);
  expect(later.voices).toBeLessThan(60);
  expect(later.state).toBe('running');
  expect(errors).toEqual([]);
});

test('muted audio stays silent and does not break the game', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => window.localStorage.setItem('automoba.sound', 'off'));
  await page.goto('/?intro=off');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill('7');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  const s = await sound(page);
  expect(s.cues).toBe(0);
  expect(errors).toEqual([]);
});
