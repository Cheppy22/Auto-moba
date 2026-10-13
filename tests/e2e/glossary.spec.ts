import { expect, test, type Page } from '@playwright/test';
import { startLive, watchErrors } from './helpers';

const shots = process.env.SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (!shots) return;
  await page.waitForTimeout(400); // let the popover finish fading in
  await page.screenshot({ path: `${shots}/${name}.png` });
}

const term = (page: Page, id: string) => page.locator(`.term[data-term="${id}"]`).first();

/** Escape reaches a screen only once its effect has registered (just after it paints). */
async function escapeReady(page: Page, n = 1): Promise<void> {
  await page.waitForFunction(
    (count) =>
      (window as unknown as { __session: { escapes: unknown[] } }).__session.escapes.length >=
      count,
    n,
  );
}

/** The popover sits fully inside the screen. */
async function onScreen(page: Page): Promise<void> {
  const box = (await page.getByTestId('gloss-pop').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  expect(box.width).toBeLessThanOrEqual(280.5);
}

/** The shared walk-through: tap a word, read it, close it every way a player can. */
async function titleTaps(page: Page, tap: boolean): Promise<void> {
  const press = async (id: string): Promise<void> =>
    tap ? term(page, id).tap() : term(page, id).click();
  const away = async (): Promise<void> =>
    tap ? page.touchscreen.tap(6, 6) : page.mouse.click(6, 6);

  await page.goto('/?intro=off');
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('gloss-pop')).toHaveCount(0);

  // the words are marked and have a padded tap area (34 px in running text, 44 px on labels)
  for (const id of ['gambit', 'fork', 'pawn', 'checkmate'])
    await expect(term(page, id), id).toBeVisible();
  const area = await term(page, 'gambit').evaluate((el) => ({
    underline: getComputedStyle(el).textDecorationLine,
    style: getComputedStyle(el).textDecorationStyle,
    height: getComputedStyle(el, '::after').height,
    role: el.getAttribute('role'),
    tab: el.getAttribute('tabindex'),
  }));
  expect(area).toEqual({
    underline: 'underline',
    style: 'dotted',
    height: '34px',
    role: 'button',
    tab: '0',
  });

  // tap opens a one-sentence definition
  await press('gambit');
  const pop = page.getByTestId('gloss-pop');
  await expect(pop).toBeVisible();
  await expect(pop).toHaveAttribute('role', 'dialog');
  await expect(page.getByTestId('gloss-short')).toContainText('A card you play with Tempo');
  await expect(term(page, 'gambit')).toHaveAttribute('aria-describedby', 'gloss-pop');
  await onScreen(page);
  await shot(page, tap ? 'glossary-title-phone' : 'glossary-title-desktop');

  // the same word again closes it
  await press('gambit');
  await expect(pop).toHaveCount(0);

  // tap outside closes
  await press('fork');
  await expect(page.getByTestId('gloss-short')).toContainText('Rank 4');
  await away();
  await expect(pop).toHaveCount(0);

  // Escape closes
  await press('pawn');
  await expect(pop).toBeVisible();
  await escapeReady(page);
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);

  // More and See also
  await press('checkmate');
  await page.getByTestId('gloss-more-btn').click();
  await expect(page.getByTestId('gloss-more')).toBeVisible();
  await pop.getByRole('button', { name: 'Throne' }).click();
  await expect(pop).toHaveAttribute('data-term', 'throne');
  await onScreen(page);
  await away();
  await expect(pop).toHaveCount(0);
}

async function rulesFromTitle(page: Page): Promise<void> {
  await page.goto('/?intro=off');
  await page.getByTestId('rules-open').click();
  await expect(page.getByTestId('rules-page')).toBeVisible();
  const list = page.getByTestId('rules-list');
  for (const id of ['tempo', 'gambit', 'fork', 'relic', 'pawn', 'pawnling', 'act', 'bastion'])
    await expect(list.getByTestId(`rule-${id}`), id).toBeAttached();
  for (const id of ['throne', 'check', 'checkmate', 'high-ground', 'eye-badge', 'line-of-sight'])
    await expect(list.getByTestId(`rule-${id}`), id).toBeAttached();
  for (const id of ['opening', 'archetype', 'rank', 'school', 'rally', 'armory', 'grove'])
    await expect(list.getByTestId(`rule-${id}`), id).toBeAttached();
  await expect(list.getByTestId('rule-tempo')).toContainText('spending meter');
  await page.getByTestId('rules-close').click();
  await expect(page.getByTestId('rules-page')).toHaveCount(0);
  // Escape closes it as well
  await page.getByTestId('rules-open').click();
  await expect(page.getByTestId('rules-page')).toBeVisible();
  await escapeReady(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rules-page')).toHaveCount(0);
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a word opens its definition and every way of closing works', async ({ page }) => {
    const errors = watchErrors(page);
    await titleTaps(page, false);
    expect(errors).toEqual([]);
  });

  test('the keyboard works: Enter opens, Escape closes and gives the word back its focus', async ({
    page,
  }) => {
    await page.goto('/?intro=off');
    const gambit = term(page, 'gambit');
    await gambit.focus();
    await page.keyboard.press('Enter');
    const pop = page.getByTestId('gloss-pop');
    await expect(pop).toBeVisible();
    await expect(pop).toBeFocused();
    await escapeReady(page);
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expect(gambit).toBeFocused();
    await page.keyboard.press('Space');
    await expect(pop).toBeVisible();
    await escapeReady(page);
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
  });

  test('the Rules list opens from the Title', async ({ page }) => {
    await rulesFromTitle(page);
  });

  test('Adjourn has a Rules tab, and its words open definitions', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
    await page.getByTestId('adjourn').click();
    await expect(page.getByTestId('adjourn-panel')).toBeVisible();
    // a marked word in the scoreboard line, and in the Armory tab
    await term(page, 'tempo').click();
    await expect(page.getByTestId('gloss-pop')).toBeVisible();
    await expect(page.getByTestId('gloss-short')).toContainText('spending meter');
    await escapeReady(page, 2);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('gloss-pop')).toHaveCount(0);
    // Escape closed only the popover: Adjourn is still open
    await expect(page.getByTestId('adjourn-panel')).toBeVisible();
    await shot(page, 'glossary-adjourn-desktop');

    await page.getByTestId('tab-rules-btn').click();
    const list = page.getByTestId('rules-list');
    await expect(list).toBeVisible();
    await expect(list.getByTestId('rule-high-ground')).toContainText('20% harder');
    await expect(list.getByTestId('rule-eye-badge')).toBeAttached();
    expect(errors.filter((e) => !/WebGL|GPU/i.test(e))).toEqual([]);
  });

  test('the piece card carries marked words', async ({ page }) => {
    test.setTimeout(240_000);
    await startLive(page, '42');
    await page.evaluate(() => {
      const s = (
        window as unknown as {
          __session: {
            openCard(id: number): void;
            match: { state: { teams: { A: { heroIds: number[] } } } };
          };
        }
      ).__session;
      s.openCard(s.match.state.teams.A.heroIds[0]);
    });
    const card = page.getByTestId('unit-card');
    await expect(card).toBeVisible();
    await term(page, 'rank').click();
    await expect(page.getByTestId('gloss-short')).toContainText('level from 1 to 8');
    await escapeReady(page, 2);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('gloss-pop')).toHaveCount(0);
    // Escape closed only the popover: the card is still there
    await expect(card).toBeVisible();
  });
});

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tap opens a definition that fits the screen; a tap outside closes it', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await titleTaps(page, true);
    // no sideways scroll was added
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    expect(errors).toEqual([]);
  });

  test('the Rules list opens from the Title and fits', async ({ page }) => {
    await rulesFromTitle(page);
  });

  test('a definition stays on screen on the setup pages', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/?intro=off');
    await page.getByTestId('start').click();
    await expect(page.getByTestId('setup')).toBeVisible();
    await page.getByTestId('step-3').tap();
    const opening = page.locator('.sp-pane.on .term[data-term="opening"]').first();
    await expect(opening).toBeVisible();
    await opening.tap();
    await expect(page.getByTestId('gloss-pop')).toBeVisible();
    await expect(page.getByTestId('gloss-short')).toContainText('tilts which gambit cards');
    await onScreen(page);
    await shot(page, 'glossary-setup-phone');
    await page.touchscreen.tap(6, 6);
    await expect(page.getByTestId('gloss-pop')).toHaveCount(0);
  });
});
