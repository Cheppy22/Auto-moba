import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

/** Files that are not stored on the device: maps, licence text, install-only icons (fetched online). */
const NOT_PRECACHED = /\.map$|^sw\.js$|LICENSES\.txt$|^icons\/(icon-\d|icon-maskable|apple)/;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Writes dist/sw.js from src/app/sw.js: the file list to store and a version that changes with any of them. */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'automoba-sw',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => !NOT_PRECACHED.test(f))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(
        fileURLToPath(new URL('./src/app/sw.js', import.meta.url)),
        'utf8',
      );
      const out = template
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace("['__PRECACHE__']", JSON.stringify(files));
      if (out === template) throw new Error('sw.js template placeholders were not found');
      writeFileSync(join(outDir, 'sw.js'), out);
    },
  };
}

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2022' },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
