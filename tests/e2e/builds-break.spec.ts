import { expect, test, type Page } from '@playwright/test';
import { boxOf, overflow, startLive, watchErrors } from './helpers';

/** Screenshots for the docs, only when asked: `SHOTS_DIR=docs/img npx playwright test builds-break`. */
const shots = process.env.SHOTS_DIR;
async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: `${shots}/builds-${name}.png` });
}

/** What these tests read from the match (beyond the shared helpers). */
interface BuildsSession {
  match: {
    step(n: number): number;
    issue(cmd: { type: string }): { ok: boolean };
    state: { forks: unknown[]; bell: { stage: string } };
    unitById(id: number): { hero?: { gold: number; techniques: { id: string; grade: string }[] } };
    buildView(id: number): {
      piece: string;
      gold: number;
      offer: {
        decided: string | null;
        suggested: number | null;
        rerolls: number;
        rerollCost: number;
        passGold: number;
        cards: { id: string }[];
      } | null;
    } | null;
  };
  notify(): void;
  resumeAct(): void;
}

/** Steps to the first Act break (forks answered on the way) and opens the Builds tab. */
async function toBuilds(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as unknown as { __session: BuildsSession }).__session;
    for (let i = 0; i < 800 && s.match.state.bell.stage !== 'break'; i++) {
      s.match.step(30);
      if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
    }
    s.notify();
  });
  await expect(page.getByTestId('break-sheet')).toBeVisible();
  await page.getByTestId('break-tab-builds').click();
  await expect(page.getByTestId('builds-tab')).toBeVisible();
}

/** The hero id behind a strip chip's piece panel, once that piece is shown. */
async function shownHero(page: Page, piece: string): Promise<number> {
  return Number(await page.getByTestId(`builds-${piece}`).getAttribute('data-hero'));
}

function view(page: Page, heroId: number) {
  return page.evaluate((id) => {
    const s = (window as unknown as { __session: BuildsSession }).__session;
    return JSON.parse(JSON.stringify(s.match.buildView(id))) as ReturnType<
      BuildsSession['match']['buildView']
    >;
  }, heroId);
}

function held(page: Page, heroId: number) {
  return page.evaluate((id) => {
    const s = (window as unknown as { __session: BuildsSession }).__session;
    return JSON.parse(JSON.stringify(s.match.unitById(id).hero!.techniques)) as {
      id: string;
      grade: string;
    }[];
  }, heroId);
}

/** The pieces in the strip's order. */
async function stripPieces(page: Page): Promise<string[]> {
  const ids = await page
    .getByTestId('builds-strip')
    .locator('button')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')!.replace('builds-chip-', '')),
    );
  return ids;
}

async function bigEnough(page: Page, id: string): Promise<void> {
  const box = await boxOf(page, id);
  expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
  expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44);
}

for (const v of [
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
]) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport, hasTouch: v.touch, isMobile: v.touch });

    test('Builds tab: Pick for me by default, override, reroll, upgrade, pass, and Resume takes the marked cards', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await startLive(page, '7');
      await toBuilds(page);
      await page.waitForTimeout(900); // the sheet slides up and the cards turn over

      // ---- Pick for me is on: every open offer shows the AI's pick, and 1-2 pieces are starred
      await expect(page.getByTestId('builds-pick-for-me')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('builds-tab')).toHaveAttribute('data-pick-for-me', 'on');
      const order = await stripPieces(page);
      expect(order).toHaveLength(5);
      const stars = await page.locator('[data-testid^="builds-chip-"][data-state="star"]').count();
      expect(stars).toBeGreaterThanOrEqual(1);
      expect(stars).toBeLessThanOrEqual(2);
      // the first piece shown is the most important pick, with its reason
      await expect(page.getByTestId(`builds-chip-${order[0]}`)).toHaveAttribute(
        'data-state',
        'star',
      );
      await expect(page.getByTestId('builds-why')).toContainText('Worth a look');
      const first = await shownHero(page, order[0]);
      const v0 = (await view(page, first))!;
      const pick = v0.offer!.suggested!;
      await expect(page.getByTestId(`builds-card-${order[0]}-${pick}`)).toHaveAttribute(
        'data-mark',
        'picked',
      );
      await expect(page.getByTestId(`builds-card-${order[0]}-${pick}-mark`)).toHaveText(
        'Picked for you',
      );
      await expect(page.locator('.tcard[data-mark="picked"]')).toHaveCount(1);
      await shot(page, `${v.name}-pick`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await bigEnough(page, 'builds-pick-for-me');
      await bigEnough(page, `builds-chip-${order[1]}`);
      await bigEnough(page, `builds-take-${order[0]}-${pick}`);
      await bigEnough(page, 'builds-reroll');
      await bigEnough(page, 'builds-pass');

      // ---- override: take a card the AI did not pick
      const other = pick === 0 ? 1 : 0;
      const otherId = v0.offer!.cards[other].id;
      await page.getByTestId(`builds-take-${order[0]}-${other}`).click();
      await expect(page.getByTestId('builds-decided')).toHaveAttribute('data-decided', 'taken');
      await expect(page.getByTestId(`builds-chip-${order[0]}`)).toHaveAttribute(
        'data-state',
        'done',
      );
      expect((await held(page, first)).map((x) => x.id)).toContain(otherId);

      // ---- reroll: three new cards for 200 gold, then take the pick
      await page.getByTestId(`builds-chip-${order[1]}`).click();
      const second = await shownHero(page, order[1]);
      const before = (await view(page, second))!;
      await page.getByTestId('builds-reroll').click();
      await expect
        .poll(async () => (await view(page, second))!.offer!.rerolls)
        .toBe(before.offer!.rerolls + 1);
      const after = (await view(page, second))!;
      expect(after.gold).toBe(before.gold - before.offer!.rerollCost);
      await expect(page.getByTestId('builds-gold')).toHaveText(String(after.gold));
      await expect(page.getByTestId(`builds-card-${order[1]}-0`)).toHaveAttribute(
        'data-technique',
        after.offer!.cards[0].id,
      );
      await page.getByTestId('builds-auto').click();
      await expect(page.getByTestId('builds-decided')).toHaveAttribute('data-decided', 'taken');
      expect((await held(page, second)).map((x) => x.id)).toContain(
        after.offer!.cards[after.offer!.suggested!].id,
      );

      // ---- upgrade a held Technique (tap its slot), then pass the offer for gold
      await page.getByTestId(`builds-chip-${order[2]}`).click();
      const third = await shownHero(page, order[2]);
      const gold0 = (await view(page, third))!.gold;
      const tile = page
        .getByTestId(`builds-slots-${order[2]}`)
        .locator('[data-state="held"]')
        .first();
      const techId = (await tile.getAttribute('data-technique'))!;
      await tile.click();
      await expect(page.getByTestId('builds-slot-detail')).toBeVisible();
      await expect(page.getByTestId('builds-slot-detail-did')).toContainText('This match');
      await shot(page, `${v.name}-slot`);
      await expect(page.getByTestId('builds-upgrade')).toContainText('600');
      await page.getByTestId('builds-upgrade').click();
      await expect
        .poll(async () => (await held(page, third)).find((x) => x.id === techId)?.grade)
        .toBe('sharp');
      await page.getByTestId('builds-pass').click();
      await expect(page.getByTestId('builds-decided')).toHaveAttribute('data-decided', 'passed');
      expect((await view(page, third))!.gold).toBe(gold0 - 600 + 150);

      // ---- Pick for me off: the marks say "AI suggests" and nothing is starred
      await page.getByTestId(`builds-chip-${order[3]}`).click();
      await page.getByTestId('builds-pick-for-me').click();
      await expect(page.getByTestId('builds-pick-for-me')).toHaveAttribute('aria-checked', 'false');
      await expect(page.locator('[data-testid^="builds-chip-"][data-state="star"]')).toHaveCount(0);
      await expect(page.locator('.tcard[data-mark="suggested"]')).toHaveCount(1);
      await expect(page.locator('.tcard[data-mark="picked"]')).toHaveCount(0);
      await page.getByTestId('builds-pick-for-me').click();
      await expect(page.locator('.tcard[data-mark="picked"]')).toHaveCount(1);

      // ---- Resume: the two pieces left alone take exactly their marked card
      const untouched: { id: number; card: string }[] = [];
      for (const piece of order.slice(3)) {
        await page.getByTestId(`builds-chip-${piece}`).click();
        const id = await shownHero(page, piece);
        const w = (await view(page, id))!;
        untouched.push({ id, card: w.offer!.cards[w.offer!.suggested!].id });
      }
      await page.evaluate(() => {
        const s = (window as unknown as { __session: BuildsSession }).__session;
        s.match.issue({ type: 'autoRelic' });
        s.notify();
      });
      await page.getByTestId('break-resume').click();
      await expect(page.getByTestId('break-sheet')).toHaveCount(0);
      for (const u of untouched)
        expect((await held(page, u.id)).map((x) => x.id)).toContain(u.card);
      expect(errors).toEqual([]);
    });
  });
}
