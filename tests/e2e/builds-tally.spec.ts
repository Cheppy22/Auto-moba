import { expect, test, type Page } from '@playwright/test';
import {
  leaveBreak,
  overflow,
  playToEnd,
  startLive,
  step,
  watchErrors,
  type TestSession,
} from './helpers';

const shots = process.env.SHOTS_DIR;

interface Counted {
  heroId: number;
  piece: string;
  id: string;
  damage: number;
  heal: number;
  shield: number;
  procs: number;
}

/** White's Techniques that counted anything in a tally map, strongest first (as the screens rank them). */
function tallied(page: Page, which: 'lastAct' | 'match'): Promise<Counted[]> {
  return page.evaluate((key) => {
    interface Sess {
      match: {
        state: {
          teams: { A: { heroIds: number[] } };
          builds: Record<string, Record<string, Omit<Counted, 'heroId' | 'piece' | 'id'>>>;
        };
        unitById(id: number): { hero?: { defId: string } } | undefined;
      };
    }
    const s = (window as unknown as { __session: Sess }).__session;
    const white = new Set(s.match.state.teams.A.heroIds);
    const out: Counted[] = [];
    for (const [k, v] of Object.entries(s.match.state.builds[key])) {
      const [h, id] = k.split(':');
      if (!white.has(Number(h))) continue;
      const piece = s.match.unitById(Number(h))?.hero?.defId ?? '';
      out.push({ heroId: Number(h), piece, id, ...v });
    }
    const eff = (c: Counted): number => c.damage + c.heal + c.shield;
    return out
      .filter((c) => eff(c) >= 1 || c.procs > 0)
      .sort((a, b) => eff(b) - eff(a) || b.procs - a.procs);
  }, which);
}

/** Steps to the first Act break (answering forks on the way); its sheet opens on the report. */
async function toBreak(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as unknown as { __session: TestSession }).__session;
    for (let i = 0; i < 800 && s.match.state.bell.stage !== 'break'; i++) {
      s.match.step(30);
      if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
    }
    s.notify();
  });
  await expect(page.getByTestId('break-sheet')).toBeVisible();
}

for (const v of [
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
]) {
  test.describe(`Technique tallies, ${v.name}`, () => {
    test.use({ viewport: v.viewport, hasTouch: v.touch, isMobile: v.touch });

    test('the Act report lists the top three Techniques by effect; Adjourn shows each slot and what it did', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await startLive(page, '7');
      await toBreak(page);

      // ---- the Act report: "What your Techniques did", the top three of the Act that ended
      const section = page.getByTestId('break-techniques');
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();
      const top = (await tallied(page, 'lastAct')).slice(0, 3);
      if (top.length > 0) {
        const items = page.getByTestId('break-techniques-list').locator('li');
        await expect(items).toHaveCount(top.length);
        for (let i = 0; i < top.length; i++)
          await expect(items.nth(i)).toHaveAttribute(
            'data-testid',
            `tally-${top[i].piece}-${top[i].id}`,
          );
        if (top[0].damage >= 1)
          await expect(items.first()).toContainText(
            `${Math.round(top[0].damage).toLocaleString('en-US')} damage`,
          );
      } else {
        await expect(section).toContainText('None of your Techniques counted');
      }
      if (shots) await section.screenshot({ path: `${shots}/builds-tally-report-${v.name}.png` });
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      // ---- Adjourn: six slots a piece, the Signature locked before Rank 4, the match totals so far
      await leaveBreak(page);
      await step(page, 600);
      await page.getByTestId('adjourn').click();
      await expect(page.getByTestId('adjourn-panel')).toBeVisible();
      await page.getByTestId('tab-builds-btn').click();
      await expect(page.getByTestId('tab-builds')).toBeVisible();
      const queen = page.getByTestId('adjourn-builds-queen');
      await expect(queen.locator('[data-testid^="slot-"]')).toHaveCount(6);
      await expect(queen.getByTestId('slot-attack')).toBeVisible();
      await expect(queen.getByTestId('slot-trait')).toBeVisible();
      expect(await queen.locator('.sr-row.held').count()).toBeGreaterThanOrEqual(1);
      if (shots) await page.screenshot({ path: `${shots}/builds-tally-adjourn-${v.name}.png` });
      const counted = await tallied(page, 'match');
      const withDamage = counted.find((c) => c.damage >= 1);
      if (withDamage) {
        const row = page
          .getByTestId(`adjourn-builds-${withDamage.piece}`)
          .locator(`[data-technique="${withDamage.id}"]`)
          .locator('xpath=ancestor::li[1]');
        await expect(row.locator('.sr-did')).toContainText(
          `${Math.round(withDamage.damage).toLocaleString('en-US')} damage`,
        );
      }
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('Technique tallies in the end report', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a piece’s page lists each Technique with its Acts and match total', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
    await playToEnd(page);
    await expect(page.getByTestId('report')).toBeVisible();
    const counted = await tallied(page, 'match');
    const best = counted.find((c) => c.damage >= 1) ?? counted[0];
    // open that piece's page from its row on the scoreboard
    await page.getByTestId(`report-hero-${best.heroId}`).click();
    await expect(page.getByTestId('hero-view')).toBeVisible();
    const box = page.getByTestId('piece-technique-totals');
    await box.scrollIntoViewIfNeeded();
    await expect(box).toBeVisible();
    const row = page.getByTestId(`tt-${best.id}`);
    await expect(row).toBeVisible();
    const total = page.getByTestId(`tt-total-${best.id}`);
    if (best.damage >= 1)
      await expect(total).toContainText(
        `${Math.round(best.damage).toLocaleString('en-US')} damage`,
      );
    await expect(total).toContainText('Match:');
    // one cell per Act, and every held Technique has a row
    const acts = await row.locator('.tt-act').count();
    expect(acts).toBeGreaterThanOrEqual(1);
    expect(await box.locator('.tt-row').count()).toBeGreaterThanOrEqual(1);
    if (shots) await box.screenshot({ path: `${shots}/builds-tally-end-phone.png` });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});
