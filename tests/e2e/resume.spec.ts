import { expect, test, type Page } from '@playwright/test';
import { snap, startLive, step, viewReady, watchErrors } from './helpers';

/** The marks a resumed match must reproduce: where the clock stood and what had happened. */
async function marks(page: Page): Promise<{ tick: number; events: number; hands: string }> {
  return page.evaluate(() => {
    const s = (
      window as unknown as {
        __session: {
          match: {
            snapshot(): { tick: number; hand: { cardId: string }[] };
            events: unknown[];
          };
        };
      }
    ).__session;
    const sn = s.match.snapshot();
    return {
      tick: sn.tick,
      events: s.match.events.length,
      hands: sn.hand.map((h) => h.cardId).join(','),
    };
  });
}

/** What the page does when it is hidden or closed: saves the match for Resume. */
const leave = (page: Page): Promise<void> =>
  page.evaluate(() => void window.dispatchEvent(new Event('pagehide')));

test('an Exhibition match resumes after a reload at the same position, paused', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await startLive(page, '19');
  await step(page, 700);
  await expect.poll(async () => (await snap(page)).tick).toBe(700);
  const before = await marks(page);
  await leave(page);

  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('resume-match')).toContainText('Act 1');
  await expect(page.getByTestId('resume-match')).toContainText('0:35');
  await page.getByTestId('resume-match').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
  // exactly where it was, and paused so the player is not ambushed
  expect(await marks(page)).toEqual(before);
  await expect(page.getByTestId('speed-chip')).toHaveAttribute('data-speed', '0');
  // it plays on from there
  await step(page, 100);
  expect((await snap(page)).tick).toBe(800);
  // a reload from here resumes again (the resumed match keeps saving)
  await leave(page);
  await page.reload();
  await expect(page.getByTestId('resume-match')).toContainText('0:40');
  expect(errors).toEqual([]);
});

test('a finished match is not offered for Resume', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?intro=off&run=test');
  await page.getByTestId('seed').fill('4');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await page.evaluate(
    () =>
      void (window as unknown as { __session: { setUi(p: unknown): void } }).__session.setUi({
        speed: 0,
      }),
  );
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await step(page, 200);
  await leave(page);
  expect(await page.evaluate(() => window.localStorage.getItem('automoba.match'))).not.toBeNull();
  await page.evaluate(
    () =>
      void (
        window as unknown as { __session: { testEnd(w: 'A' | 'B' | null): void } }
      ).__session.testEnd('A'),
  );
  await expect(page.getByTestId('report')).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('automoba.match'))).toBeNull();
  await page.getByTestId('new-match').click();
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('resume-match')).toHaveCount(0);
});

test('a damaged save is dropped with a note, and the game still starts', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /could not be resumed/.test(m.text())) errors.push(m.text());
  });
  await startLive(page, '23');
  await step(page, 300);
  await leave(page);
  // tamper with the log so the replay cannot reach the saved position
  await page.evaluate(() => {
    const raw = JSON.parse(window.localStorage.getItem('automoba.match') ?? 'null');
    raw.check = 'not-the-position';
    window.localStorage.setItem('automoba.match', JSON.stringify(raw));
  });
  await page.reload();
  await page.getByTestId('resume-match').click();
  await expect(page.getByTestId('resume-note')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('resume-match')).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('automoba.match'))).toBeNull();
  expect(errors).toHaveLength(1);
  await expect(page.getByTestId('start')).toBeVisible();
});

test('a Tournament match resumes in its run; abandoning the run drops it', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.goto('/?intro=off&run=test');
  await page.getByTestId('seed').fill('7');
  await page.getByTestId('tournament').click();
  await page.getByTestId('draw-setup').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await page.evaluate(
    () =>
      void (window as unknown as { __session: { setUi(p: unknown): void } }).__session.setUi({
        speed: 0,
      }),
  );
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await step(page, 500);
  const before = await marks(page);
  await leave(page);

  await page.reload();
  // the one button resumes the match; "Continue" (restart the round) is not offered beside it
  await expect(page.getByTestId('resume-match')).toContainText('Round 1');
  await expect(page.getByTestId('continue-run')).toHaveCount(0);
  await page.getByTestId('resume-match').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  expect(await marks(page)).toEqual(before);
  // the match is part of the run again
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __session: { run: { status: string } | null } }).__session.run
          ?.status,
    ),
  ).toBe('playing');

  // abandon from the Title: the match goes with the run
  await leave(page);
  await page.reload();
  await page.getByTestId('tournament').click();
  await page.getByTestId('abandon-run').click();
  await expect(page.getByTestId('draw')).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('automoba.match'))).toBeNull();
  expect(errors).toEqual([]);
});
