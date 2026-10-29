import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it.each(['/api/v1', '/api/v1/'])(
    '%s (GET) has no root endpoint and returns the standard 404',
    (path) => {
      return request(app.getHttpServer())
        .get(path)
        .expect(404)
        .expect({
          message: `Cannot GET ${path}`,
          error: 'Not Found',
          statusCode: 404,
        });
    },
  );

  it('/api/v1/health (GET) returns the liveness contract', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  afterEach(async () => {
    await app.close();
  });
});
