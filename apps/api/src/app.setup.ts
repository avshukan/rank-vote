import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Runtime configuration shared by main.ts and the e2e tests, so what the tests
 * exercise matches what production runs: API version prefix, strict input
 * validation, and CORS.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  });
}
