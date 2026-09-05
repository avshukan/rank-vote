import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  BallotResponseDto,
  PollResponseDto,
  PollResultsResponseDto,
} from '@rank-vote/shared';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import {
  RATE_LIMIT_POLICIES,
  type RateLimitPolicies,
} from './../src/presentation/rate-limit/rate-limit.config';

const NON_LIMITING_TEST_POLICIES: RateLimitPolicies = {
  pollCreation: { limit: 1_000, windowMs: 60 * 60 * 1000 },
  ballotSubmission: { limit: 1_000, windowMs: 60 * 60 * 1000 },
};

/** Narrows supertest's `any` body to the poll API contract for assertions. */
const asPoll = (res: request.Response): PollResponseDto =>
  res.body as PollResponseDto;

/** Narrows supertest's `any` body to the ballot API contract for assertions. */
const asBallot = (res: request.Response): BallotResponseDto =>
  res.body as BallotResponseDto;

/** Narrows supertest's `any` body to the results API contract for assertions. */
const asResults = (res: request.Response): PollResultsResponseDto =>
  res.body as PollResultsResponseDto;

describe('Polls (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMIT_POLICIES)
      .useValue(NON_LIMITING_TEST_POLICIES)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
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

  describe('GET /api/v1/polls/:id/results', () => {
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

    /** Casts one ballot ranking the poll's options by text, best-first. */
    const vote = async (...texts: string[]) => {
      const entries = texts.map((text, index) => ({
        optionId: poll.options.find((option) => option.text === text)!.id,
        rank: index + 1,
      }));
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${poll.id}/ballots`)
        .send({ entries })
        .expect(201);
    };

    const getResults = async () =>
      asResults(
        await request(app.getHttpServer())
          .get(`/api/v1/polls/${poll.id}/results`)
          .expect(200),
      );

    it('scores every option 0 with no winner before any vote', async () => {
      const results = await getResults();

      expect(results).toEqual({
        pollId: poll.id,
        title: 'Lunch',
        method: 'BORDA',
        winners: [],
        scores: [
          { optionId: poll.options[0].id, text: 'Pizza', score: 0 },
          { optionId: poll.options[1].id, text: 'Sushi', score: 0 },
          { optionId: poll.options[2].id, text: 'Salad', score: 0 },
        ],
        totalBallots: 0,
      });
    });

    it('tallies submitted ballots by Borda count', async () => {
      await vote('Pizza', 'Sushi', 'Salad');
      await vote('Sushi', 'Pizza', 'Salad');
      await vote('Sushi', 'Salad', 'Pizza');

      const results = await getResults();

      expect(results.scores).toEqual([
        { optionId: poll.options[1].id, text: 'Sushi', score: 5 },
        { optionId: poll.options[0].id, text: 'Pizza', score: 3 },
        { optionId: poll.options[2].id, text: 'Salad', score: 1 },
      ]);
      expect(results.winners).toEqual([
        { optionId: poll.options[1].id, text: 'Sushi', score: 5 },
      ]);
      expect(results.totalBallots).toBe(3);
    });

    it('returns every tied leader as a winner', async () => {
      await vote('Pizza', 'Sushi', 'Salad');
      await vote('Sushi', 'Pizza', 'Salad');

      const { winners, totalBallots } = await getResults();

      expect(winners).toEqual([
        { optionId: poll.options[0].id, text: 'Pizza', score: 3 },
        { optionId: poll.options[1].id, text: 'Sushi', score: 3 },
      ]);
      expect(totalBallots).toBe(2);
    });

    it('counts only ballots cast for this poll', async () => {
      const other = asPoll(
        await request(app.getHttpServer())
          .post('/api/v1/polls')
          .send({ title: 'Other', options: ['A', 'B'] })
          .expect(201),
      );
      await request(app.getHttpServer())
        .post(`/api/v1/polls/${other.id}/ballots`)
        .send({
          entries: other.options.map((option, index) => ({
            optionId: option.id,
            rank: index + 1,
          })),
        })
        .expect(201);

      await vote('Pizza', 'Sushi', 'Salad');

      expect((await getResults()).totalBallots).toBe(1);
    });

    it('returns 404 for a missing poll', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/polls/00000000-0000-0000-0000-000000000000/results')
        .expect(404);
    });
  });
});
