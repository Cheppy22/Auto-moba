import { expect, test, type Page } from '@playwright/test';
import { overflow, watchErrors } from './helpers';

const shots = process.env.SHOTS_DIR;

interface Sess {
  __session: {
    run: { pace: string } | null;
    match: { config: { pace?: string }; content: { tuning: { maxPhases: number } } } | null;
    setUi(p: unknown): void;
  };
}

const matchPace = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as Sess).__session.match?.config.pace ?? 'classical');

async function shot(page: Page, name: string): Promise<void> {
  if (!shots) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/aaa-pace-${name}.png` });
}

async function exhibitionSetup(page: Page): Promise<void> {
  await page.goto('/?intro=off');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill('12');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await page.getByTestId('step-3').click();
  await expect(page.getByTestId('pace-picker')).toBeVisible();
}

test.describe('pace (Blitz and Classical)', () => {
  test('a phone starts on Blitz: 3 Acts in the clock', async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await exhibitionSetup(page);
    await expect(page.getByTestId('pace-blitz')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pace-classical')).toHaveAttribute('aria-checked', 'false');
    expect(await overflow(page)).toBe(0);
    await shot(page, 'phone-setup');
    expect(await matchPace(page)).toBe('blitz');
    await page.getByTestId('begin').click();
    await page.evaluate(() => (window as unknown as Sess).__session.setUi({ speed: 0 }));
    await expect(page.getByTestId('phase')).toHaveText('Act 1/3');
    expect(errors).toEqual([]);
  });

  test('a desktop starts on Classical; the pick is remembered and a run takes it at the Draw', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await exhibitionSetup(page);
    await expect(page.getByTestId('pace-classical')).toHaveAttribute('aria-checked', 'true');
    expect(await matchPace(page)).toBe('classical');
    await page.getByTestId('pace-blitz').click();
    await expect(page.getByTestId('pace-blitz')).toHaveAttribute('aria-checked', 'true');
    expect(await matchPace(page)).toBe('blitz');
    await shot(page, 'desktop-setup');
    // a new visit remembers Blitz, and the tournament Draw starts on it
    await page.goto('/?intro=off&run=test');
    await page.getByTestId('tournament').click();
    await expect(page.getByTestId('draw')).toBeVisible();
    await expect(page.getByTestId('pace-blitz')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('pace-classical').click();
    await expect(page.getByTestId('pace-classical')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('pace-blitz').click();
    await shot(page, 'desktop-draw');
    await page.getByTestId('draw-setup').click();
    await expect(page.getByTestId('setup')).toBeVisible();
    // in a run the pace is the run's: Setup has no switch
    await page.getByTestId('step-3').click();
    await expect(page.getByTestId('pace-picker')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as Sess).__session.run?.pace ?? null)).toBe(
      'blitz',
    );
    await page.getByTestId('quick-start').click();
    expect(await matchPace(page)).toBe('blitz');
    expect(errors).toEqual([]);
  });

  test('the phone Draw shows the switch without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?intro=off&run=test');
    await page.getByTestId('tournament').click();
    await expect(page.getByTestId('draw')).toBeVisible();
    await expect(page.getByTestId('pace-blitz')).toHaveAttribute('aria-checked', 'true');
    expect(await overflow(page)).toBe(0);
    await shot(page, 'phone-draw');
  });
});
