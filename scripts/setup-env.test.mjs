import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const makefile = readFileSync(join(repositoryRoot, 'Makefile'), 'utf8');

test('make setup warns about existing env files without overwriting them', (context) => {
  const project = mkdtempSync(join(tmpdir(), 'rank-vote-setup-'));
  context.after(() => rmSync(project, { recursive: true, force: true }));

  const bin = join(project, 'bin');
  mkdirSync(bin);
  for (const command of ['corepack', 'pnpm']) {
    const executable = join(bin, command);
    writeFileSync(executable, '#!/bin/sh\nexit 0\n');
    chmodSync(executable, 0o755);
  }

  writeFileSync(join(project, 'Makefile'), makefile);
  for (const app of ['api', 'web']) {
    const appDirectory = join(project, 'apps', app);
    mkdirSync(appDirectory, { recursive: true });
    writeFileSync(join(appDirectory, '.env.example'), `${app}-example\n`);
    writeFileSync(join(appDirectory, '.env'), `${app}-existing\n`);
  }

  const result = spawnSync('make', ['setup'], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /warning: apps\/api\/\.env already exists; setup left it unchanged\./,
  );
  assert.match(
    result.stdout,
    /warning: apps\/web\/\.env already exists; setup left it unchanged\./,
  );
  assert.equal(readFileSync(join(project, 'apps/api/.env'), 'utf8'), 'api-existing\n');
  assert.equal(readFileSync(join(project, 'apps/web/.env'), 'utf8'), 'web-existing\n');
});
