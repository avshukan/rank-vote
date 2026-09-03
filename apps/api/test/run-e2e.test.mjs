import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_TEST_DATABASE_URL,
  resolveTestDatabaseUrl,
} from './run-e2e.mjs';

test('uses the fixed test database and ignores the development DATABASE_URL', () => {
  assert.equal(
    resolveTestDatabaseUrl({
      DATABASE_URL:
        'postgresql://rank_vote:rank_vote@localhost:5432/rank_vote?schema=public',
    }),
    DEFAULT_TEST_DATABASE_URL,
  );
});

test('accepts an explicit test URL for the fixed test database', () => {
  const databaseUrl =
    'postgresql://ci:secret@postgres:5432/rank_vote_test?schema=public';

  assert.equal(
    resolveTestDatabaseUrl({ TEST_DATABASE_URL: databaseUrl }),
    databaseUrl,
  );
});

test('refuses to reset the development database', () => {
  assert.throws(
    () =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL:
          'postgresql://rank_vote:rank_vote@localhost:5432/rank_vote?schema=public',
      }),
    /Refusing to reset database "rank_vote"/,
  );
});

test('rejects non-PostgreSQL test URLs', () => {
  assert.throws(
    () =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: 'file:./rank_vote_test',
      }),
    /must use the PostgreSQL protocol/,
  );
});
