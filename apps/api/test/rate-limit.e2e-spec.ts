import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { PollResponseDto } from '@rank-vote/shared';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import {
  RATE_LIMIT_CLOCK,
  RATE_LIMIT_POLICIES,
  type RateLimitClock,
  type RateLimitPolicies,
} from './../src/presentation/rate-limit/rate-limit.config';

class FakeClock implements RateLimitClock {
  constructor(public currentTime = 1_000) {}

  now(): number {
    return this.currentTime;
  }
}

interface TestAppOptions {
  pollLimit?: number;
  ballotLimit?: number;
  windowMs?: number;
  trustedProxyHops?: number;
}

const validPoll = (title = 'Lunch') => ({
  title,
  options: ['Pizza', 'Sushi'],
});

const asPoll = (response: request.Response): PollResponseDto =>
  response.body as PollResponseDto;

describe('Write rate limits (e2e)', () => {
  const openApps: NestExpressApplication[] = [];

  async function startApp({
    pollLimit = 2,
    ballotLimit = 2,
    windowMs = 10_000,
    trustedProxyHops = 0,
  }: TestAppOptions = {}): Promise<{
    app: NestExpressApplication;
    clock: FakeClock;
  }> {
    const clock = new FakeClock();
    const policies: RateLimitPolicies = {
      pollCreation: { limit: pollLimit, windowMs },
      ballotSubmission: { limit: ballotLimit, windowMs },
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMIT_POLICIES)
      .useValue(policies)
      .overrideProvider(RATE_LIMIT_CLOCK)
      .useValue(clock)
      .compile();

    const app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app, {
      ...process.env,
      TRUSTED_PROXY_HOPS: String(trustedProxyHops),
    });
    await app.init();
    openApps.push(app);
    return { app, clock };
  }

  async function createPoll(
    app: NestExpressApplication,
    title = 'Lunch',
    forwardedFor?: string,
  ): Promise<PollResponseDto> {
    let call = request(app.getHttpServer()).post('/api/v1/polls');
    if (forwardedFor) call = call.set('X-Forwarded-For', forwardedFor);
    return asPoll(await call.send(validPoll(title)).expect(201));
  }

  const fullRanking = (poll: PollResponseDto) => ({
    entries: poll.options.map((option, index) => ({
      optionId: option.id,
      rank: index + 1,
    })),
  });

  afterEach(async () => {
    await Promise.all(openApps.splice(0).map((app) => app.close()));
  });

  it('limits poll creation, returns the 429 contract, and resets at expiry', async () => {
    const { app, clock } = await startApp();
    const server = app.getHttpServer();

    await request(server)
      .post('/api/v1/polls')
      .send(validPoll('One'))
      .expect(201);
    await request(server)
      .post('/api/v1/polls')
      .send(validPoll('Two'))
      .expect(201);

    clock.currentTime = 2_500;
    const limited = await request(server)
      .post('/api/v1/polls')
      .send(validPoll('Limited'))
      .expect(429)
      .expect('Retry-After', '9')
      .expect({
        statusCode: 429,
        message: 'Too many requests',
        error: 'Too Many Requests',
      });
    const rateLimitHeaders = Object.keys(limited.headers).filter((name) =>
      /^(x-)?ratelimit-/i.test(name),
    );
    expect(rateLimitHeaders).toEqual([]);

    clock.currentTime = 10_999;
    await request(server)
      .post('/api/v1/polls')
      .send(validPoll('Still limited'))
      .expect(429)
      .expect('Retry-After', '1');

    clock.currentTime = 11_000;
    await request(server)
      .post('/api/v1/polls')
      .send(validPoll('Fresh window'))
      .expect(201);
  });

  it('allows the ballot limit and rejects the first request above it', async () => {
    const { app } = await startApp({ pollLimit: 10 });
    const poll = await createPoll(app);
    const endpoint = `/api/v1/polls/${poll.id}/ballots`;

    await request(app.getHttpServer())
      .post(endpoint)
      .send(fullRanking(poll))
      .expect(201);
    await request(app.getHttpServer())
      .post(endpoint)
      .send(fullRanking(poll))
      .expect(201);
    await request(app.getHttpServer())
      .post(endpoint)
      .send(fullRanking(poll))
      .expect(429);
  });

  it('counts invalid poll and ballot attempts before endpoint handling', async () => {
    const { app } = await startApp({ pollLimit: 2, ballotLimit: 2 });
    const server = app.getHttpServer();

    await request(server).post('/api/v1/polls').send({}).expect(400);
    await request(server).post('/api/v1/polls').send({}).expect(400);
    await request(server).post('/api/v1/polls').send(validPoll()).expect(429);

    const secondClient = '198.51.100.20';
    const trusted = await startApp({
      pollLimit: 10,
      ballotLimit: 2,
      trustedProxyHops: 1,
    });
    const poll = await createPoll(trusted.app, 'Ballot target', secondClient);
    const missingPoll = '00000000-0000-0000-0000-000000000000';
    const structurallyValidBallot = {
      entries: [
        { optionId: '00000000-0000-0000-0000-000000000001', rank: 1 },
        { optionId: '00000000-0000-0000-0000-000000000002', rank: 2 },
      ],
    };

    await request(trusted.app.getHttpServer())
      .post(`/api/v1/polls/${missingPoll}/ballots`)
      .set('X-Forwarded-For', secondClient)
      .send(structurallyValidBallot)
      .expect(404);
    await request(trusted.app.getHttpServer())
      .post(`/api/v1/polls/${poll.id}/ballots`)
      .set('X-Forwarded-For', secondClient)
      .send({ entries: [] })
      .expect(400);
    await request(trusted.app.getHttpServer())
      .post(`/api/v1/polls/${poll.id}/ballots`)
      .set('X-Forwarded-For', secondClient)
      .send(fullRanking(poll))
      .expect(429);
  });

  it('shares one ballot bucket across poll IDs', async () => {
    const { app } = await startApp({ pollLimit: 10, ballotLimit: 1 });
    const firstPoll = await createPoll(app, 'First');
    const secondPoll = await createPoll(app, 'Second');

    await request(app.getHttpServer())
      .post(`/api/v1/polls/${firstPoll.id}/ballots`)
      .send(fullRanking(firstPoll))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/polls/${secondPoll.id}/ballots`)
      .send(fullRanking(secondPoll))
      .expect(429);
  });

  it('keeps write buckets independent and leaves reads and preflight unlimited', async () => {
    const { app } = await startApp({ pollLimit: 2, ballotLimit: 2 });
    const server = app.getHttpServer();
    const firstPoll = await createPoll(app, 'First');

    await request(server)
      .post(`/api/v1/polls/${firstPoll.id}/ballots`)
      .send(fullRanking(firstPoll))
      .expect(201);
    await createPoll(app, 'Second');
    await request(server)
      .post(`/api/v1/polls/${firstPoll.id}/ballots`)
      .send(fullRanking(firstPoll))
      .expect(201);

    await request(server).post('/api/v1/polls').send(validPoll()).expect(429);
    await request(server)
      .post(`/api/v1/polls/${firstPoll.id}/ballots`)
      .send(fullRanking(firstPoll))
      .expect(429);

    await request(server).get(`/api/v1/polls/${firstPoll.id}`).expect(200);
    await request(server)
      .get(`/api/v1/polls/${firstPoll.id}/results`)
      .expect(200);
    await request(server).get('/api/v1').expect(200);
    await request(server).get('/api/v1/health').expect(200);
    await request(server)
      .options('/api/v1/polls')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
  });

  it('ignores spoofed forwarding headers with the zero-hop default', async () => {
    const { app } = await startApp({ pollLimit: 1 });
    const server = app.getHttpServer();

    await request(server)
      .post('/api/v1/polls')
      .set('X-Forwarded-For', '198.51.100.1')
      .send(validPoll('First'))
      .expect(201);
    await request(server)
      .post('/api/v1/polls')
      .set('X-Forwarded-For', '198.51.100.2')
      .send(validPoll('Spoofed'))
      .expect(429);
  });

  it('uses independent forwarded client IPs with an exact trusted hop', async () => {
    const { app } = await startApp({ pollLimit: 1, trustedProxyHops: 1 });
    const server = app.getHttpServer();

    await request(server)
      .post('/api/v1/polls')
      .set('X-Forwarded-For', '198.51.100.1')
      .send(validPoll('First client'))
      .expect(201);
    await request(server)
      .post('/api/v1/polls')
      .set('X-Forwarded-For', '198.51.100.2')
      .send(validPoll('Second client'))
      .expect(201);
    await request(server)
      .post('/api/v1/polls')
      .set('X-Forwarded-For', '198.51.100.1')
      .send(validPoll('First client again'))
      .expect(429);
  });
});
