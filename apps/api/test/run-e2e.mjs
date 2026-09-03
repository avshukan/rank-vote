import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEST_DATABASE_NAME = 'rank_vote_test';
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://rank_vote:rank_vote@localhost:5432/rank_vote_test?schema=public';

export function resolveTestDatabaseUrl(environment = process.env) {
  const databaseUrl =
    environment.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  let parsed;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('TEST_DATABASE_URL must use the PostgreSQL protocol');
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to reset database "${databaseName || '(missing)'}"; ` +
        `e2e requires "${TEST_DATABASE_NAME}"`,
    );
  }

  return databaseUrl;
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
  const databaseUrl = resolveTestDatabaseUrl();
  const environment = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-vm-modules']
      .filter(Boolean)
      .join(' '),
  };

  console.log(`Resetting PostgreSQL database ${TEST_DATABASE_NAME} for e2e`);
  run('pnpm', ['exec', 'prisma', 'db', 'push', '--force-reset'], {
    cwd: apiDirectory,
    env: environment,
  });
  run('pnpm', ['exec', 'jest', '--config', './test/jest-e2e.json'], {
    cwd: apiDirectory,
    env: environment,
  });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) main();
