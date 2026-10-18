import { expect, test, type Page } from '@playwright/test';
import { overflow, watchErrors } from './helpers';

const shots = process.env.SHOTS_DIR;
const PIECES = ['king', 'queen', 'rook', 'bishop', 'knight'];

const views = [
  { name: 'phone-360', viewport: { width: 360, height: 800 }, touch: true },
  { name: 'phone-390', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
];

/** Title -> Setup, on page 1 (First moves). */
async function openSetup(page: Page, seed = '42'): Promise<void> {
  await page.goto('/?intro=off');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill(seed);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByTestId('first-moves')).toBeVisible();
}

/** The Technique ids White's pieces hold in the running match, by piece. */
function heldByPiece(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(() => {
    interface Sess {
      match: {
        state: { teams: { A: { heroIds: number[] } } };
        unitById(
          id: number,
        ): { hero?: { defId: string; techniques: { id: string }[] } } | undefined;
      };
    }
    const s = (window as unknown as { __session: Sess }).__session;
    const out: Record<string, string[]> = {};
    for (const id of s.match.state.teams.A.heroIds) {
      const h = s.match.unitById(id)?.hero;
      if (h) out[h.defId] = h.techniques.map((t) => t.id);
    }
    return out;
  });
}

const cardIds = (page: Page, piece: string): Promise<(string | null)[]> =>
  page
    .getByTestId('first-move-' + piece)
    .locator('.tcard')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-technique')));

test.describe('First moves: Pick for me and your own picks', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the AI picks are chosen, a tap overrides one, and Begin deals what was chosen', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await openSetup(page);

    // Pick for me is on, and every piece already has a chosen card: the one marked "AI suggests"
    const pick = page.getByTestId('pick-for-me');
    await expect(pick).toHaveAttribute('aria-checked', 'true');
    const suggested: Record<string, string> = {};
    for (const piece of PIECES) {
      await page.getByTestId(`fm-chip-${piece}`).click();
      await expect(page.getByTestId(`fm-chip-${piece}`)).toHaveAttribute('aria-checked', 'true');
      const row = page.getByTestId(`first-move-${piece}`);
      await expect(row.locator('.tcard')).toHaveCount(3);
      await expect(row.locator('.fm-card.on')).toHaveCount(1);
      await expect(row.locator('.fm-card.on .tcard[data-mark="picked"]')).toHaveCount(1);
      await expect(page.getByTestId(`fm-chip-${piece}`)).toHaveAttribute('data-source', 'ai');
      suggested[piece] = (await row.locator('.fm-card.on .tcard').getAttribute('data-technique'))!;
    }
    // one or two picks are marked as worth a look
    const hot = await page.locator('.fm-chip.hot').count();
    expect(hot).toBeGreaterThanOrEqual(1);
    expect(hot).toBeLessThanOrEqual(2);

    // take another card for the Queen: it moves the choice and the chip says it is yours
    await page.getByTestId('fm-chip-queen').click();
    const ids = await cardIds(page, 'queen');
    const other = ids.findIndex((id) => id !== suggested.queen);
    await page.getByTestId(`fm-take-queen-${other}`).click();
    await expect(page.getByTestId(`fm-take-queen-${other}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId(`fm-card-queen-${other}`).locator('xpath=..')).toHaveClass(
      /\bon\b/,
    );
    await expect(page.getByTestId('first-move-queen').locator('.fm-card.on')).toHaveCount(1);
    await expect(page.getByTestId('fm-chip-queen')).toHaveAttribute('data-source', 'yours');
    await expect(page.getByTestId('pick-note')).toContainText('except the 1 you picked');

    // Pick for me off: the other pieces are left open (nothing chosen); the Queen keeps your pick
    await pick.click();
    if (shots) await page.screenshot({ path: `${shots}/builds-setup-override-390.png` });
    await expect(pick).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('fm-chip-queen')).toHaveAttribute('data-source', 'yours');
    await expect(page.getByTestId('fm-chip-king')).toHaveAttribute('data-source', 'open');
    await page.getByTestId('fm-chip-king').click();
    await expect(page.getByTestId('first-move-king').locator('.fm-card.on')).toHaveCount(0);
    // an open piece still starts with the card marked "AI suggests"
    await expect(
      page.getByTestId('first-move-king').locator('.tcard[data-mark="suggested"]'),
    ).toHaveCount(1);

    // Begin: the Queen holds the card you took, the open King the AI's, the rest the AI's picks
    await page.getByTestId('quick-start').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    const held = await heldByPiece(page);
    expect(held.queen, 'the Queen holds your pick').toContain(ids[other]);
    for (const piece of ['king', 'rook', 'bishop', 'knight'])
      expect(held[piece], `${piece} holds the AI's suggestion`).toContain(suggested[piece]);
    expect(errors).toEqual([]);
  });

  test('"Back to the AI’s pick" undoes an override', async ({ page }) => {
    await openSetup(page);
    await page.getByTestId('fm-chip-rook').click();
    const ids = await cardIds(page, 'rook');
    const sug = await page
      .getByTestId('first-move-rook')
      .locator('.fm-card.on .tcard')
      .getAttribute('data-technique');
    const other = ids.findIndex((id) => id !== sug);
    await page.getByTestId(`fm-take-rook-${other}`).click();
    await expect(page.getByTestId('fm-chip-rook')).toHaveAttribute('data-source', 'yours');
    await page.getByTestId('fm-undo-rook').click();
    await expect(page.getByTestId('fm-chip-rook')).toHaveAttribute('data-source', 'ai');
    await expect(page.getByTestId('first-move-rook').locator('.fm-card.on .tcard')).toHaveAttribute(
      'data-technique',
      sug!,
    );
  });
});

test.describe('First moves follow the Opening', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a pick the new Opening no longer deals is dropped with a note; a pick still dealt stays yours', async ({
    page,
  }) => {
    await openSetup(page);
    await page.getByTestId('fm-chip-king').click();
    const before = await cardIds(page, 'king');
    const sug = await page
      .getByTestId('first-move-king')
      .locator('.fm-card.on .tcard')
      .getAttribute('data-technique');
    const other = before.findIndex((id) => id !== sug);
    await page.getByTestId(`fm-take-king-${other}`).click();
    const picked = before[other];
    // another Opening deals again (the schools it favours are drawn twice as often)
    await page.getByTestId('step-3').click();
    await page.getByTestId('opening-french').click();
    await page.getByTestId('step-1').click();
    await page.getByTestId('fm-chip-king').click();
    const after = await cardIds(page, 'king');
    if (after.includes(picked)) {
      await expect(page.getByTestId('fm-chip-king')).toHaveAttribute('data-source', 'yours');
      await expect(page.getByTestId('fm-lost')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('fm-lost')).toContainText('King');
      await expect(page.getByTestId('fm-chip-king')).toHaveAttribute('data-source', 'ai');
    }
  });
});

for (const v of views) {
  test(`First moves fit and can be tapped: ${v.name}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({
      viewport: v.viewport,
      hasTouch: v.touch,
      isMobile: v.touch,
    });
    const page = await ctx.newPage();
    await openSetup(page);
    await page.waitForTimeout(500);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    if (shots) await page.screenshot({ path: `${shots}/builds-setup-${v.name}.png` });
    // the switch, the five tabs and Quick start are real tap targets on screen
    for (const id of ['pick-for-me', 'quick-start', 'next', ...PIECES.map((p) => `fm-chip-${p}`)]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${id} width`).toBeGreaterThanOrEqual(40);
      expect(box.x, `${id} left`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${id} right`).toBeLessThanOrEqual(v.viewport.width);
    }
    // every card's button can be scrolled to, is tall enough and stays inside the screen
    for (const piece of ['king', 'knight']) {
      await page.getByTestId(`fm-chip-${piece}`).click();
      for (let i = 0; i < 3; i++) {
        const take = page.getByTestId(`fm-take-${piece}-${i}`);
        await take.scrollIntoViewIfNeeded();
        const box = (await take.boundingBox())!;
        expect(box.height, `${piece} card ${i} button height`).toBeGreaterThanOrEqual(44);
        expect(box.x, `${piece} card ${i} left`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${piece} card ${i} right`).toBeLessThanOrEqual(v.viewport.width);
        expect(box.y + box.height, `${piece} card ${i} bottom`).toBeLessThanOrEqual(
          v.viewport.height,
        );
      }
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
}
