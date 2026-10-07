import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ResultService } from './result.service';

const POLL = {
  id: 'poll-1',
  title: 'Lunch',
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  options: [
    { id: 'o0', text: 'Pizza', order: 0 },
    { id: 'o1', text: 'Sushi', order: 1 },
  ],
  ballots: [
    {
      entries: [
        { optionId: 'o1', rank: 1 },
        { optionId: 'o0', rank: 2 },
      ],
    },
  ],
};

/** Sushi after the single ballot above: ranked first once. */
const SUSHI = {
  optionId: 'o1',
  text: 'Sushi',
  score: 1,
  breakdown: [
    { place: 1, points: 1, ballots: 1, subtotal: 1 },
    { place: 2, points: 0, ballots: 0, subtotal: 0 },
  ],
};

const NO_BALLOTS = [
  { place: 1, points: 1, ballots: 0, subtotal: 0 },
  { place: 2, points: 0, ballots: 0, subtotal: 0 },
];

describe('ResultService', () => {
  let service: ResultService;
  let prisma: { poll: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { poll: { findUnique: jest.fn() } };
    service = new ResultService(prisma as unknown as PrismaService);
  });

  it('tallies the ballots and maps to the DTO', async () => {
    prisma.poll.findUnique.mockResolvedValue(POLL);

    const result = await service.getResults('poll-1');

    expect(result).toEqual({
      pollId: 'poll-1',
      title: 'Lunch',
      method: 'BORDA',
      winners: [SUSHI],
      scores: [
        SUSHI,
        {
          optionId: 'o0',
          text: 'Pizza',
          score: 0,
          breakdown: [
            { place: 1, points: 1, ballots: 0, subtotal: 0 },
            { place: 2, points: 0, ballots: 1, subtotal: 0 },
          ],
        },
      ],
      totalBallots: 1,
    });
  });

  it('loads the ballots and their entries alongside the options', async () => {
    prisma.poll.findUnique.mockResolvedValue(POLL);

    await service.getResults('poll-1');

    expect(prisma.poll.findUnique).toHaveBeenCalledWith({
      where: { id: 'poll-1' },
      include: { options: true, ballots: { include: { entries: true } } },
    });
  });

  it('returns every option at 0 with no winner when nobody voted', async () => {
    prisma.poll.findUnique.mockResolvedValue({ ...POLL, ballots: [] });

    const result = await service.getResults('poll-1');

    expect(result).toEqual({
      pollId: 'poll-1',
      title: 'Lunch',
      method: 'BORDA',
      winners: [],
      scores: [
        { optionId: 'o0', text: 'Pizza', score: 0, breakdown: NO_BALLOTS },
        { optionId: 'o1', text: 'Sushi', score: 0, breakdown: NO_BALLOTS },
      ],
      totalBallots: 0,
    });
  });

  it('throws NotFoundException when the poll does not exist', async () => {
    prisma.poll.findUnique.mockResolvedValue(null);

    await expect(service.getResults('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
