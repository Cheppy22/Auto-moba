import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const read = (dir: string): { file: string; text: string }[] =>
  walk(dir)
    .filter((f) => /\.tsx?$/.test(f))
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }));

describe('layer boundaries', () => {
  it('sim and analysis stay deterministic and platform free', () => {
    const banned = [
      /Math\.random/,
      /Date\.now/,
      /performance\.now/,
      /\bwindow\b/,
      /\bdocument\./,
      /from 'preact/,
      /from 'node:/,
      /setTimeout|setInterval|requestAnimationFrame/,
    ];
    for (const dir of ['src/sim', 'src/analysis']) {
      for (const { file, text } of read(dir)) {
        for (const re of banned) expect(re.test(text), `${file} matches ${re}`).toBe(false);
      }
    }
  });

  it('sim imports no other layer', () => {
    for (const { file, text } of read('src/sim')) {
      expect(/from '(\.\.\/)+(analysis|render|ui|app|tools)/.test(text), file).toBe(false);
    }
  });

  it('analysis imports sim types only through the public index', () => {
    for (const { file, text } of read('src/analysis')) {
      expect(/from '(\.\.\/)+sim\/(?!index|types)/.test(text), file).toBe(false);
    }
  });

  it('render and ui never import sim internals', () => {
    for (const dir of ['src/render', 'src/ui']) {
      for (const { file, text } of read(dir)) {
        expect(/from '(\.\.\/)+sim\/(?!index|types)/.test(text), file).toBe(false);
      }
    }
  });
});
