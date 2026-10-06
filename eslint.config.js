import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const simGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'performance',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'fetch',
  'process',
];
const bannedProps = [
  { object: 'Math', property: 'random', message: 'Use the seeded rng streams.' },
  { object: 'Date', property: 'now', message: 'No wall clock in deterministic code.' },
  { object: 'performance', property: 'now', message: 'No wall clock in deterministic code.' },
];
const layer = (message, ...patterns) => ({
  'no-restricted-imports': ['error', { patterns: patterns.map((group) => ({ group, message })) }],
});

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      ...layer(
        'sim imports nothing from other layers or the platform.',
        ['preact*', 'zod/*'],
        ['**/analysis/**', '**/render/**', '**/ui/**', '**/app/**', '**/tools/**'],
        ['node:*', 'fs', 'path', 'worker_threads', 'vite*'],
      ),
      'no-restricted-globals': ['error', ...simGlobals],
      'no-restricted-properties': ['error', ...bannedProps],
    },
  },
  {
    files: ['src/analysis/**/*.ts'],
    rules: {
      ...layer(
        'analysis depends on sim event/state types only.',
        ['preact*'],
        ['**/render/**', '**/ui/**', '**/app/**', '**/tools/**'],
        ['node:*', 'fs', 'path', 'worker_threads'],
      ),
      'no-restricted-globals': ['error', ...simGlobals],
      'no-restricted-properties': ['error', ...bannedProps],
    },
  },
  {
    files: ['src/render/**/*.ts'],
    rules: layer('render reads sim snapshot types only.', [
      '**/ui/**',
      '**/app/**',
      '**/tools/**',
      '**/sim/*',
      '!**/sim/types',
      '!**/sim/index',
    ]),
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: layer('ui uses analysis models and the sim public API only.', [
      '**/app/**',
      '**/tools/**',
      '**/render/internal/**',
    ]),
  },
);
