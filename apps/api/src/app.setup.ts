import { INestApplication, ValidationPipe } from '@nestjs/common';

export const TRUSTED_PROXY_HOPS_ENV = 'TRUSTED_PROXY_HOPS';

interface ExpressSettings {
  set(setting: 'trust proxy', value: false | number): void;
}

export function parseTrustedProxyHops(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const configured = environment[TRUSTED_PROXY_HOPS_ENV];
  if (configured === undefined || configured === '') return 0;

  if (!/^\d+$/.test(configured)) {
    throw new Error(`${TRUSTED_PROXY_HOPS_ENV} must be a non-negative integer`);
  }

  const hops = Number(configured);
  if (!Number.isSafeInteger(hops)) {
    throw new Error(`${TRUSTED_PROXY_HOPS_ENV} must be a safe integer`);
  }

  return hops;
}

/**
 * Runtime configuration shared by main.ts and the e2e tests, so what the tests
 * exercise matches what production runs: API version prefix, strict input
 * validation, CORS, and Express proxy trust.
 */
export function configureApp(
  app: INestApplication,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const trustedProxyHops = parseTrustedProxyHops(environment);
  const expressApp = app.getHttpAdapter().getInstance() as ExpressSettings;
  expressApp.set(
    'trust proxy',
    trustedProxyHops === 0 ? false : trustedProxyHops,
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: environment.CORS_ORIGIN ?? 'http://localhost:5173',
  });
}
