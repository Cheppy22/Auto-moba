import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHOOL_COLOR, SCHOOL_ORDER } from '../src/ui/schools';

/** One meaning per colour (docs/CHESS.md "Colour map"): the interface tokens and the schools. */
const css = readFileSync(new URL('../src/ui/css/tokens.css', import.meta.url), 'utf8');

/** A token's value, following `var(--x)` references. */
function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  expect(m, `--${name} in tokens.css`).not.toBeNull();
  const v = m![1].trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref ? token(ref[1]) : v;
}

/** sRGB hex to OKLab. */
function oklab(hex: string): [number, number, number] {
  const lin = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(0), lin(1), lin(2)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const dist = (a: string, b: string): number => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** The other meanings a school colour must never be mistaken for. */
const RESERVED = {
  brass: 'brass',
  gold: 'kw-gold',
  text: 'ivory',
  'secondary text': 'bone',
  'selected / better': 'baize-hi',
  'bad / price': 'bad',
  danger: 'clock-hi',
  Blade: 'mind',
  health: 'body',
  Soul: 'soul',
  'Black team': 'slate',
};

describe('colour map', () => {
  it('the school tokens mirror SCHOOL_COLOR', () => {
    for (const s of SCHOOL_ORDER) expect(token(`school-${s}`).toLowerCase()).toBe(SCHOOL_COLOR[s]);
  });

  it('no school colour sits close to another meaning or another school', () => {
    // OKLab distance: about 0.02 is barely visible; 0.075 is a different colour at a glance
    for (const s of SCHOOL_ORDER) {
      for (const [meaning, t] of Object.entries(RESERVED))
        expect(dist(SCHOOL_COLOR[s], token(t)), `${s} vs ${meaning}`).toBeGreaterThan(0.075);
      for (const o of SCHOOL_ORDER)
        if (o !== s)
          expect(dist(SCHOOL_COLOR[s], SCHOOL_COLOR[o]), `${s} vs ${o}`).toBeGreaterThan(0.1);
    }
  });

  it('better and selected share one green; worse, price and warning sit in the red family', () => {
    expect(token('good')).toBe(token('baize-hi'));
    expect(token('kw-price')).toBe(token('bad'));
    expect(dist(token('warn'), token('bad'))).toBeLessThan(0.08);
    expect(dist(token('warn'), token('brass'))).toBeGreaterThan(0.12);
  });
});
