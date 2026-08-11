import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import type { BallotResponseDto, PollResponseDto } from '@rank-vote/shared';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

const API_DIR = join(__dirname, '..');
const TEST_DB = 'test-e2e.db';
const TEST_DB_URL = `file:./${TEST_DB}`;

/** Narrows supertest's `any` body to the poll API contract for assertions. */
const asPoll = (res: request.Response): PollResponseDto =>
  res.body as PollResponseDto;

/** Narrows supertest's `any` body to the ballot API contract for assertions. */
const asBallot = (res: request.Response): BallotResponseDto =>
  res.body as BallotResponseDto;

describe('Polls (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Point the app (and Prisma) at a throwaway database, then apply the schema
    // to a fresh empty file via `db push` (--url overrides prisma.config.ts).
    // Deleting first keeps it a non-destructive create (no --force-reset).
    process.env.DATABASE_URL = TEST_DB_URL;
    const dbPath = join(API_DIR, TEST_DB);
    if (existsSync(dbPath)) unlinkSync(dbPath);
    execSync(`pnpm exec prisma db push --url ${TEST_DB_URL}`, {
      cwd: API_DIR,
      stdio: 'ignore',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    const dbPath = join(API_DIR, TEST_DB);
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  it('POST /api/v1/polls creates a poll (201) with options in order', async () => {
    const poll = asPoll(
      await request(app.getHttpServer())
        .post('/api/v1/polls')
        .send({ title: 'Lunch', options: ['Pizza', 'Sushi', 'Salad'] })
        .expect(201),
    );

    expect(typeof poll.id).toBe('string');
    expect(typeof poll.createdAt).toBe('string');
    expect(poll.title).toBe('Lunch');
    expect(poll.options.map((o) => ({ text: o.text, order: o.order }))).toEqual(
      [
        { text: 'Pizza', order: 0 },
        { text: 'Sushi', order: 1 },
        { text: 'Salad', order: 2 },
      ],
    );
    poll.options.forEach((o) => expect(typeof o.id).toBe('string'));
  });

  it('POST /api/v1/polls rejects fewer than 2 options (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/polls')
      .send({ title: 'Bad', options: ['only one'] })
      .expect(400);
  });

  it('POST /api/v1/polls rejects an empty title (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/polls')
      .send({ title: '', options: ['A', 'B'] })
      .expect(400);
  });

  it('GET /api/v1/polls/:id returns a previously created poll (200)', async () => {
    const created = asPoll(
      await request(app.getHttpServer())
        .post('/api/v1/polls')
        .send({ title: 'Movie night', options: ['A', 'B'] })
        .expect(201),
    );

    const fetched = asPoll(
      await request(app.getHttpServer())
        .get(`/api/v1/polls/${created.id}`)
        .expect(200),
    );

    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe('Movie night');
    expect(fetched.options).toHaveLength(2);
  });

  it('GET /api/v1/polls/:id returns 404 for a missing poll', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/polls/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  describe('POST /api/v1/polls/:id/ballots', () => {
    let poll: PollResponseDto;

    /** A fresh poll per test keeps ballot counts independent. */
    beforeEach(async () => {
      poll = asPoll(
        await request(app.getHttpServer())
          .post('/api/v1/polls')
          .send({ title: 'Lunch', options: ['Pizza', 'Sushi', 'Salad'] })
          .expect(201),
      );
    });

    /** A valid strict full ranking of `poll`, best-first. */
    const fullRanking = () => ({
      entries: poll.options.map((option, index) => ({
        optionId: option.id,
        rank: index + 1,
      })),
    });

    it('accepts a full ranking (201) and returns the ballot', async () => {
      const ballot = asBallot(
        await request(app.getHttpServer())
          .post(`/api/v1/polls/${poll.id}/ballots`)
          .send(fullRanking())
          .expect(201),
      );

      expect(typeof ballot.id).toBe('string');
      expect(ballot.pollId).toBe(poll.id);
      expect(typeof ballot.createdAt).toBe('string');
    });

    it('accepts entries in any order as long as ranks cover 1..N', async () => {
      const { entries } = fullRanking();
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({ entries: entries.slice().reverse() })
        .expect(201);
    });

    it('accepts a second ballot for the same poll (no server-side dedup)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send(fullRanking())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send(fullRanking())
        .expect(201);
    });

    it('rejects a partial ranking (400)', async () => {
      const { entries } = fullRanking();
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({ entries: entries.slice(0, 2) })
        .expect(400);
    });

    it('rejects a missing entries array (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({})
        .expect(400);
    });

    it('rejects an empty entries array (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({ entries: [] })
        .expect(400);
    });

    it('rejects an option that belongs to another poll (400)', async () => {
      const other = asPoll(
        await request(app.getHttpServer())
          .post('/api/v1/polls')
          .send({ title: 'Other', options: ['A', 'B', 'C'] })
          .expect(201),
      );
      const { entries } = fullRanking();

      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({
          entries: [
            ...entries.slice(0, 2),
            { optionId: other.options[0].id, rank: 3 },
          ],
        })
        .expect(400);
    });

    it('rejects a duplicate optionId (400)', async () => {
      const { entries } = fullRanking();
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({
          entries: [
            ...entries.slice(0, 2),
            { optionId: entries[0].optionId, rank: 3 },
          ],
        })
        .expect(400);
    });

    it('rejects duplicate ranks (400)', async () => {
      const { entries } = fullRanking();
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({
          entries: entries.map((entry) => ({ ...entry, rank: 1 })),
        })
        .expect(400);
    });

    it.each([0, -1, 4])('rejects an out-of-range rank (%p)', async (rank) => {
      const { entries } = fullRanking();
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({
          entries: [{ ...entries[0], rank }, ...entries.slice(1)],
        })
        .expect(400);
    });

    it('returns 404 for a ballot on a missing poll', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/polls/00000000-0000-0000-0000-000000000000/ballots')
        .send(fullRanking())
        .expect(404);
    });
  });
});
