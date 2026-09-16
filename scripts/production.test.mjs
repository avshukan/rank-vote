import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('production tooling: fail-closed validation and release failure paths', () => {
  const result = spawnSync(
    'python3',
    ['-m', 'unittest', 'scripts.production.test_production', '-v'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
