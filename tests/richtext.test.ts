import { describe, expect, it } from 'vitest';
import { parseRich, plainText, ruleName, splitRule } from '../src/ui/richtext';

describe('parseRich', () => {
  it('returns nothing for an empty string', () => {
    expect(parseRich('')).toEqual([]);
    expect(plainText('')).toBe('');
  });

  it('leaves text without markup as one plain segment', () => {
    expect(parseRich('+10 Blade')).toEqual([{ kind: null, text: '+10 Blade' }]);
  });

  it('parses every keyword letter', () => {
    for (const k of ['m', 'b', 's', 't', 'g', 'p', 'r']) {
      expect(parseRich(`{${k}|x}`)).toEqual([{ kind: k, text: 'x' }]);
    }
  });

  it('splits plain and tagged text in order', () => {
    expect(parseRich('{m|+24 Blade}, {m|+0.2 attack speed}. {r|Ratchet}: go.')).toEqual([
      { kind: 'm', text: '+24 Blade' },
      { kind: null, text: ', ' },
      { kind: 'm', text: '+0.2 attack speed' },
      { kind: null, text: '. ' },
      { kind: 'r', text: 'Ratchet' },
      { kind: null, text: ': go.' },
    ]);
  });

  it('treats unknown letters as plain text', () => {
    expect(parseRich('{x|nope}')).toEqual([{ kind: null, text: '{x|nope}' }]);
  });

  it('treats unbalanced braces as plain text without throwing', () => {
    for (const bad of ['{m|open', 'close}', '{', '}', '{m|', '{m}', '{|x}', 'a | b']) {
      expect(() => parseRich(bad)).not.toThrow();
      expect(plainText(bad)).toBe(bad);
    }
    expect(() => parseRich('{m|a{b|c}')).not.toThrow();
    expect(parseRich('{m|open')).toEqual([{ kind: null, text: '{m|open' }]);
    expect(parseRich('{{m|x}')).toEqual([
      { kind: null, text: '{' },
      { kind: 'm', text: 'x' },
    ]);
  });

  it('does not nest: an inner tag is parsed on its own', () => {
    expect(parseRich('{m|a {b|c}}')).toEqual([
      { kind: null, text: '{m|a ' },
      { kind: 'b', text: 'c' },
      { kind: null, text: '}' },
    ]);
  });

  it('drops empty tags', () => {
    expect(parseRich('a{m|}b')).toEqual([{ kind: null, text: 'ab' }]);
  });
});

describe('plainText', () => {
  it('strips markup and keeps the words', () => {
    expect(plainText('{m|+10 Blade}. {r|Chop}: hits deal {m|+20% Blade}.')).toBe(
      '+10 Blade. Chop: hits deal +20% Blade.',
    );
  });
});

describe('ruleName and splitRule', () => {
  const desc = '{m|+45 Blade}. {r|Cinder Wake}: every 3rd hit {r|cleaves}.';
  it('takes the first rule segment as the rule name', () => {
    expect(ruleName(desc)).toBe('Cinder Wake');
    expect(ruleName('{m|+1 Blade}')).toBe('');
    expect(ruleName('')).toBe('');
  });
  it('splits stats from the rule at the first rule word', () => {
    expect(splitRule(desc)).toEqual({
      stats: '{m|+45 Blade}.',
      rule: '{r|Cinder Wake}: every 3rd hit {r|cleaves}.',
    });
    expect(splitRule('Plain text')).toEqual({ stats: 'Plain text', rule: '' });
  });
});
