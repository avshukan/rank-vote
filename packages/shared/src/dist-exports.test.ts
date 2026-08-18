import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
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
  const packageRoot = realpathSync(process.cwd());
  const repoRoot = join(packageRoot, '..', '..');
  const read = (...segments: string[]) => readFileSync(join(packageRoot, ...segments), 'utf8');

  type Entry = {
    /** The resolved entry point, relative to the package root. */
    path: string;
    source: string;
    maxOptions: number;
    bordaMethod: string;
  };

  // Each half is resolved the way its own consumer resolves it: by package
  // name, from that app's directory, in a child Node process — so the
  // `exports` map does the routing, and neither Vite nor Vitest is in the way.
  // Reading `dist/` by a hard-coded path instead would leave the map untested,
  // and a map that sent `import` back to the CommonJS file would reproduce the
  // blank page with every assertion still green. Loading is not proof by
  // itself either: Node synthesizes named exports out of CommonJS, so the
  // import below would succeed against the wrong file — hence the assertions
  // on the resolved path. The specifier lives in these strings rather than in
  // an `import` of this file on purpose: the gate runs typecheck before build,
  // where `dist/` and its declarations do not exist yet.
  const ESM_PROBE = `
    import { realpathSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    import * as shared from '@rank-vote/shared';

    process.stdout.write(
      JSON.stringify({
        path: realpathSync(fileURLToPath(import.meta.resolve('@rank-vote/shared'))),
        maxOptions: shared.MAX_OPTIONS,
        bordaMethod: shared.CountingMethod.BORDA,
      }),
    );
  `;

  const CJS_PROBE = `
    const { realpathSync } = require('node:fs');
    const shared = require('@rank-vote/shared');

    process.stdout.write(
      JSON.stringify({
        path: realpathSync(require.resolve('@rank-vote/shared')),
        maxOptions: shared.MAX_OPTIONS,
        bordaMethod: shared.CountingMethod.BORDA,
      }),
    );
  `;

  const loadFrom = (app: string, nodeArgs: string[], probe: string): Entry => {
    const stdout = execFileSync(process.execPath, [...nodeArgs, '--eval', probe], {
      cwd: join(repoRoot, 'apps', app),
      encoding: 'utf8',
      // Let the child's own failure — a resolution error, a missing build
      // half — reach the test output instead of a bare "command failed".
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const { path, ...values } = JSON.parse(stdout) as Omit<Entry, 'path' | 'source'> & {
      path: string;
    };

    return {
      path: relative(packageRoot, path),
      source: readFileSync(path, 'utf8'),
      ...values,
    };
  };

  let esm: Entry;
  let cjs: Entry;

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

    esm = loadFrom('web', ['--input-type=module'], ESM_PROBE);
    cjs = loadFrom('api', [], CJS_PROBE);
  }, 120_000);

  it('routes the API to a CommonJS build through the require condition', () => {
    expect(cjs.path).toBe(join('dist', 'index.js'));
    expect(cjs.source).toContain('require(');
    expect(cjs.source).not.toMatch(/^export /m);
  });

  it('routes Vite to a real ESM build through the import condition', () => {
    expect(esm.path).toBe(join('dist', 'esm', 'index.js'));
    expect(esm.source).toMatch(/^export \* from/m);
    expect(esm.source).not.toContain('require(');
  });

  it('marks the ESM output as a module, so Node does not read it as CommonJS', () => {
    expect(JSON.parse(read('dist', 'esm', 'package.json'))).toEqual({ type: 'module' });
  });

  it('serves its named exports through both entry points', () => {
    expect(cjs).toMatchObject({ maxOptions: 10, bordaMethod: 'BORDA' });
    expect(esm).toMatchObject({ maxOptions: 10, bordaMethod: 'BORDA' });
  });
});
