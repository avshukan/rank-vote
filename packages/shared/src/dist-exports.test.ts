import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// `packages/shared` is consumed from two different module systems: the NestJS
// API `require`s it, while Vite and the browser `import` it. A CommonJS-only
// build is what left `pnpm dev` serving a blank page (backlog #21) — the dev
// server handed the browser that CJS file raw and every named import threw.
// These tests pin the dual output down, because nothing else in the gate fails
// if the ESM half stops being emitted: Vitest and Rollup both paper over CJS.
describe('@rank-vote/shared build output', () => {
  // Vitest runs from the package root. A wrong cwd cannot go unnoticed: the
  // build below is what would fail first.
  const packageRoot = process.cwd();
  const read = (...segments: string[]) => readFileSync(join(packageRoot, ...segments), 'utf8');

  // Build from clean first, so these assertions describe what the build config
  // emits today rather than whatever artifacts an earlier branch left in
  // `dist/`. Without the wipe the guard stays green even if the ESM half stops
  // being emitted, because the previous `dist/esm` survives the build.
  // `build` itself must not wipe: `pnpm dev` starts every package in parallel,
  // and an absent `dist/` fails the API's watcher compile.
  beforeAll(() => {
    const execpath = process.env.npm_execpath;
    const run = (script: string) => {
      const [command, args]: [string, string[]] = execpath
        ? [process.execPath, [execpath, 'run', script]]
        : ['pnpm', ['run', script]];

      execFileSync(command, args, { cwd: packageRoot, stdio: 'pipe' });
    };

    run('clean');
    run('build');
  }, 120_000);

  it('emits CommonJS for the require condition, which the API resolves', () => {
    const cjs = read('dist', 'index.js');

    expect(cjs).toContain('require(');
    expect(cjs).not.toMatch(/^export /m);
  });

  it('emits real ESM for the import condition, which Vite resolves', () => {
    const esm = read('dist', 'esm', 'index.js');

    expect(esm).toMatch(/^export \* from/m);
    expect(esm).not.toContain('require(');
  });

  it('marks the ESM output as a module, so Node does not read it as CommonJS', () => {
    expect(JSON.parse(read('dist', 'esm', 'package.json'))).toEqual({ type: 'module' });
  });

  // Both entry points are loaded through a computed specifier on purpose: a
  // literal one would tie `pnpm typecheck` to the presence of `dist/`, and the
  // gate runs typecheck before build — so a clean checkout would fail there.
  it('serves its named exports through the ESM entry point', async () => {
    const entry = pathToFileURL(join(packageRoot, 'dist', 'esm', 'index.js')).href;
    const esm = (await import(/* @vite-ignore */ entry)) as typeof import('./index.js');

    expect(esm.MAX_OPTIONS).toBe(10);
    expect(esm.CountingMethod.BORDA).toBe('BORDA');
  });

  it('serves its named exports through the CommonJS entry point', () => {
    const require = createRequire(join(packageRoot, 'package.json'));
    const cjs = require(join(packageRoot, 'dist', 'index.js')) as typeof import('./index.js');

    expect(cjs.MAX_OPTIONS).toBe(10);
    expect(cjs.CountingMethod.BORDA).toBe('BORDA');
  });
});
