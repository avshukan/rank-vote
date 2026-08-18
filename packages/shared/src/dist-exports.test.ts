import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// `packages/shared` is consumed from two different module systems: the NestJS
// API `require`s it, while Vite and the browser `import` it. A CommonJS-only
// build is what left `pnpm dev` serving a blank page (backlog #21) — the dev
// server handed the browser that CJS file raw and every named import threw.
// These tests pin the dual output down, because nothing else in the gate fails
// if the ESM half stops being emitted: Vitest and Rollup both paper over CJS.
describe('@rank-vote/shared build output', () => {
  // Vitest runs from the package root, so these are the emitted artifacts.
  const read = (path: string) => readFileSync(path, 'utf8');

  it('emits CommonJS for the require condition, which the API resolves', () => {
    const cjs = read('dist/index.js');

    expect(cjs).toContain('require(');
    expect(cjs).not.toMatch(/^export /m);
  });

  it('emits real ESM for the import condition, which Vite resolves', () => {
    const esm = read('dist/esm/index.js');

    expect(esm).toMatch(/^export \* from/m);
    expect(esm).not.toContain('require(');
  });

  it('marks the ESM output as a module, so Node does not read it as CommonJS', () => {
    expect(JSON.parse(read('dist/esm/package.json'))).toEqual({ type: 'module' });
  });

  it('serves its named exports through the ESM entry point', async () => {
    const esm = await import('../dist/esm/index.js');

    expect(esm.MAX_OPTIONS).toBe(10);
    expect(esm.CountingMethod.BORDA).toBe('BORDA');
  });
});
