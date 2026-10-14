import { expect, test, type Page } from '@playwright/test';
import { overflow, startLive, step, watchErrors } from './helpers';

const shots = process.env.SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (!shots) return;
  await page.waitForTimeout(500); // let the sheet settle
  await page.screenshot({ path: `${shots}/armory-${name}.png` });
}

/** What these tests read from the page beyond the shared helpers. */
interface Sess {
  __session: {
    match: {
      step(n: number): number;
      issue(cmd: { type: string }): { ok: boolean };
      unitById(id: number): {
        team: string;
        hero?: { defId: string; gold: number; items: string[] };
      };
      armoryView(id: number): {
        customPlan: boolean;
        planLeft: string[];
        plan: string[];
        items: string[];
      } | null;
      events: { type: string; tick: number; payload: Record<string, unknown> }[];
      state: {
        bell: { stage: string };
        forks: unknown[];
        teams: { A: { heroIds: number[] }; B: { heroIds: number[] } };
      };
    };
    setUi(patch: Record<string, unknown>): void;
    notify(): void;
  };
}

/** Plays on (answering forks like "Let the AI choose") until the Act break sheet is up. */
async function toBreak(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as unknown as Sess).__session;
    for (let i = 0; i < 800 && s.match.state.bell.stage !== 'break'; i++) {
      s.match.step(30);
      if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
    }
    s.notify();
  });
  await expect(page.getByTestId('break-sheet')).toBeVisible();
}

/** Sets a White piece's gold (the armory spends banked gold; tests need a known amount). */
function setGold(page: Page, piece: string, gold: number): Promise<void> {
  return page.evaluate(
    ({ piece, gold }) => {
      const s = (window as unknown as Sess).__session;
      for (const id of s.match.state.teams.A.heroIds) {
        const h = s.match.unitById(id).hero;
        if (h?.defId === piece) h.gold = gold;
      }
      s.notify();
    },
    { piece, gold },
  );
}

const goldOf = async (page: Page): Promise<number> =>
  Number(((await page.getByTestId('armory-gold').textContent()) ?? '').replace(/[^0-9]/g, ''));

/** The Queen's current plan view. */
function queenView(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as Sess).__session;
    const id = s.match.state.teams.A.heroIds.find(
      (i) => s.match.unitById(i).hero?.defId === 'queen',
    )!;
    const v = s.match.armoryView(id)!;
    return {
      custom: v.customPlan,
      plan: v.plan,
      left: v.planLeft,
      items: v.items,
      gold: s.match.unitById(id).hero!.gold,
    };
  });
}

/** Leaves the break like a player: the AI picks a relic, then Resume is pressed. */
async function resume(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Sess).__session.match.issue({ type: 'autoRelic' });
  });
  await page.getByTestId('break-resume').click();
  await expect(page.getByTestId('break-sheet')).toHaveCount(0);
}

async function openArmory(page: Page): Promise<void> {
  await page.getByTestId('break-tab-armory').click();
  await expect(page.getByTestId('break-armory')).toBeVisible();
}

/** No sideways overflow, and every tile, slot, chip and button of the tab is at least 44 px. */
async function layoutOk(page: Page): Promise<void> {
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const bad = await page.evaluate(() => {
    const body = document.querySelector('.bs-body') as HTMLElement;
    const root = document.querySelector('[data-testid="break-armory"]') as HTMLElement;
    const small: string[] = [];
    const sel = '.ar-tile, .ar-slot, .ar-chip, .ar-cat, .ar button, .ar .btn';
    for (const el of root.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.width < 43.5 || r.height < 43.5))
        small.push(`${el.className} ${el.textContent?.slice(0, 20)} ${r.width}x${r.height}`);
    }
    // nothing may reach past the sheet's sides
    const wide: string[] = [];
    const b = body.getBoundingClientRect();
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > b.right + 1 || r.left < b.left - 1))
        wide.push(`${el.className} ${r.left}-${r.right} vs ${b.left}-${b.right}`);
    }
    return { small, wide, scrollX: body.scrollWidth - body.clientWidth };
  });
  expect(bad.small, 'targets under 44 px').toEqual([]);
  expect(bad.wide, 'elements past the sheet').toEqual([]);
  expect(bad.scrollX).toBeLessThanOrEqual(0);
}

test.describe('Armory tab at the Act break', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('buy, sell, change the plan, let the AI shop, resume', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
    await toBreak(page);
    await setGold(page, 'queen', 4000);
    await expect(page.getByTestId('break-tab-armory')).toBeVisible();
    // the brass dot shows while a piece holds 300 gold or more
    await expect(page.getByTestId('armory-unspent')).toBeVisible();
    await openArmory(page);
    await page.getByTestId('armory-piece-queen').click();
    await expect(page.getByTestId('armory-gold')).toContainText('4,000');

    // buy a tier-1 item: it lands in the bag and the gold drops by its price
    const before = await queenView(page);
    const tile = page
      .locator('.ar-tile.tier-1:not(.owned):not(.poor)')
      .filter({ hasNot: page.locator('.never') })
      .first();
    await expect(tile).toBeVisible();
    const id = (await tile.getAttribute('data-testid'))!.replace('armory-tile-', '');
    await tile.click();
    await expect(page.getByTestId('armory-dock')).toHaveAttribute('data-item', id);
    await page.getByTestId('armory-buy').click();
    await expect.poll(async () => (await queenView(page)).items).toContain(id);
    const bought = await queenView(page);
    expect(bought.gold).toBeLessThan(before.gold);
    await expect(page.getByTestId('armory-tile-' + id)).toHaveClass(/owned/);
    expect(await goldOf(page)).toBe(bought.gold);

    // sell it again: half the price comes back, the buy button returns
    await expect(page.getByTestId('armory-sell')).toContainText('Sell · +');
    await page.getByTestId('armory-sell').click();
    await expect.poll(async () => (await queenView(page)).items).not.toContain(id);
    const sold = await queenView(page);
    expect(sold.gold).toBeGreaterThan(bought.gold);
    expect(sold.gold).toBeLessThan(before.gold);
    await expect(page.getByTestId('armory-buy')).toBeVisible();

    // change the plan: a ghost slot -> Change -> another item -> Put in plan
    const v0 = await queenView(page);
    expect(v0.custom).toBe(false);
    const ghost = page.locator('.ar-slot.ghost').first();
    await expect(ghost).toBeVisible();
    const swapped = (await ghost.getAttribute('data-item'))!;
    await ghost.click();
    await page.getByTestId('armory-plan-change').click();
    // a Soul item: nothing the Queen holds is built from it, so it can take the ghost's place
    await page.getByTestId('armory-cat-soul').click();
    await page.locator('.ar-tile.tier-1:not(.owned):not(.plan)').first().click();
    const newId = (await page.getByTestId('armory-dock').getAttribute('data-item'))!;
    await page.getByTestId('armory-plan-put').click();
    await expect.poll(async () => (await queenView(page)).custom).toBe(true);
    const v1 = await queenView(page);
    expect(v1.plan).toContain(newId);
    expect(v1.plan).not.toContain(swapped);
    await expect(page.getByTestId('armory-plan-state')).toHaveText('yours');

    // Orders warns that another path resets the plan
    await page.getByTestId('break-tab-orders').click();
    await expect(page.getByTestId('plan-warn-queen')).toBeVisible();
    await page.getByTestId('break-tab-armory').click();

    // back to the build path
    await page.getByTestId('armory-plan-reset').click();
    await expect.poll(async () => (await queenView(page)).custom).toBe(false);
    await expect(page.getByTestId('armory-plan-reset')).toHaveCount(0);

    // "Let the AI shop" for one piece, then for all: gold is spent and nothing breaks
    const rich = (await queenView(page)).gold;
    await page.getByTestId('armory-ai-one').click();
    await expect.poll(async () => (await queenView(page)).gold).toBeLessThan(rich);
    await page.getByTestId('armory-ai-all').click();

    // Resume is never locked by the Armory
    await resume(page);
    expect(errors).toEqual([]);
  });

  test('Black’s break purchases stay hidden until the next Act', async ({ page }) => {
    test.setTimeout(240_000);
    await startLive(page, '42');
    await toBreak(page);
    const info = await page.evaluate(() => {
      const s = (window as unknown as Sess).__session;
      const m = s.match;
      for (const id of m.state.teams.B.heroIds) {
        const bought = m.events.filter(
          (e) => e.type === 'purchase' && e.payload.id === id && e.payload.at === 'break',
        );
        if (bought.length > 0) {
          s.setUi({ card: id });
          return { id, held: m.unitById(id).hero!.items.length, bought: bought.length };
        }
      }
      return null;
    });
    expect(info, 'Black bought something at the break').not.toBeNull();
    const shown = page.locator('[data-testid="unit-card-items"] .ucard-item');
    await expect.poll(() => shown.count()).toBeLessThan(info!.held);
    // the next Act starts: the card now shows what Black carries
    await resume(page);
    await page.evaluate((id) => {
      (window as unknown as Sess).__session.setUi({ card: id });
    }, info!.id);
    await expect.poll(() => shown.count()).toBeGreaterThanOrEqual(info!.held);
  });
});

test('Adjourn shows each piece’s plan as dashed ghosts after its items', async ({ page }) => {
  test.setTimeout(120_000);
  await startLive(page, '42');
  await step(page, 60);
  await page.getByTestId('adjourn').click();
  await page.getByTestId('tab-armory-btn').click();
  const queen = page.getByTestId('armory-queen');
  await expect(queen.locator('.atile.ghost').first()).toBeVisible();
  // the next buy comes first, then the plan's other items, never more than the six slots
  expect(await queen.locator('.atile').count()).toBeLessThanOrEqual(6);
  await expect(queen.getByTestId('next-queen')).toBeVisible();
});

for (const v of [
  { name: 'portrait', w: 390, h: 844 },
  { name: 'landscape', w: 844, h: 390 },
  { name: 'desktop', w: 1440, h: 900 },
]) {
  test(`Armory layout at ${v.w}×${v.h}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: v.w, height: v.h });
    await startLive(page, '42');
    await toBreak(page);
    await setGold(page, 'queen', 2600);
    await openArmory(page);
    await page.getByTestId('armory-piece-queen').click();
    await layoutOk(page);
    await shot(page, v.name);

    // buy one thing (a free slot is left for a ghost), then read a Masterwork
    await page.locator('.ar-tile.tier-1:not(.owned):not(.poor)').first().click();
    await page.getByTestId('armory-buy').click();
    await page.getByTestId('armory-cat-soul').click();
    await page.locator('.ar-tile.tier-3').first().click();
    await layoutOk(page);
    await shot(page, `${v.name}-detail`);

    // a ghost being changed
    await page.locator('.ar-slot.ghost').first().click();
    await page.getByTestId('armory-plan-change').click();
    await layoutOk(page);
    await shot(page, `${v.name}-plan`);

    // the glossary underline works inside the tab and leaves the sheet in place
    await page.locator('.ar .term').first().click();
    await expect(page.getByTestId('gloss-pop')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('break-sheet')).toBeVisible();
  });
}
