import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BallotService } from './ballot.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const POLL = {
  id: 'poll-1',
  title: 'Lunch',
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  options: [
    { id: 'o0', text: 'Pizza', order: 0 },
    { id: 'o1', text: 'Sushi', order: 1 },
  ],
};

describe('BallotService', () => {
  let service: BallotService;
  let prisma: {
    poll: { findUnique: jest.Mock };
    ballot: { create: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      poll: { findUnique: jest.fn() },
      ballot: { create: jest.fn() },
    };
    service = new BallotService(prisma as unknown as PrismaService);
  });

  it('persists the ballot with its entries and maps to the DTO', async () => {
    prisma.poll.findUnique.mockResolvedValue(POLL);
    prisma.ballot.create.mockResolvedValue({
      id: 'ballot-1',
      pollId: 'poll-1',
      createdAt: new Date('2026-08-11T10:00:00.000Z'),
    });

    const result = await service.submitBallot('poll-1', {
      entries: [
        { optionId: 'o1', rank: 1 },
        { optionId: 'o0', rank: 2 },
      ],
    });

    expect(prisma.ballot.create).toHaveBeenCalledWith({
      data: {
        pollId: 'poll-1',
        entries: {
          create: [
            { optionId: 'o1', rank: 1 },
            { optionId: 'o0', rank: 2 },
          ],
        },
      },
    });
    expect(result).toEqual({
      id: 'ballot-1',
      pollId: 'poll-1',
      createdAt: '2026-08-11T10:00:00.000Z',
    });
  });

  it('throws NotFoundException when the poll does not exist', async () => {
    prisma.poll.findUnique.mockResolvedValue(null);

    await expect(
      service.submitBallot('missing', {
        entries: [{ optionId: 'o0', rank: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.ballot.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for a ballot that is not a full ranking', async () => {
    prisma.poll.findUnique.mockResolvedValue(POLL);

    await expect(
      service.submitBallot('poll-1', {
        entries: [{ optionId: 'o0', rank: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ballot.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for an option from another poll', async () => {
    prisma.poll.findUnique.mockResolvedValue(POLL);

    await expect(
      service.submitBallot('poll-1', {
        entries: [
          { optionId: 'o0', rank: 1 },
          { optionId: 'foreign', rank: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ballot.create).not.toHaveBeenCalled();
  });
});
