import { NotFoundException } from '@nestjs/common';
import { PollService } from './poll.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('PollService', () => {
  let service: PollService;
  let prisma: {
    poll: { create: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      poll: { create: jest.fn(), findUnique: jest.fn() },
    };
    service = new PollService(prisma as unknown as PrismaService);
  });

  it('createPoll persists options in array order and maps to the DTO', async () => {
    prisma.poll.create.mockResolvedValue({
      id: 'poll-1',
      title: 'Lunch',
      createdAt: new Date('2026-07-12T00:00:00.000Z'),
      options: [
        { id: 'o0', text: 'Pizza', order: 0 },
        { id: 'o1', text: 'Sushi', order: 1 },
      ],
    });

    const result = await service.createPoll({
      title: 'Lunch',
      options: ['Pizza', 'Sushi'],
    });

    expect(prisma.poll.create).toHaveBeenCalledWith({
      data: {
        title: 'Lunch',
        options: {
          create: [
            { text: 'Pizza', order: 0 },
            { text: 'Sushi', order: 1 },
          ],
        },
      },
      include: { options: true },
    });
    expect(result).toEqual({
      id: 'poll-1',
      title: 'Lunch',
      createdAt: '2026-07-12T00:00:00.000Z',
      options: [
        { id: 'o0', text: 'Pizza', order: 0 },
        { id: 'o1', text: 'Sushi', order: 1 },
      ],
    });
  });

  it('getPoll returns options sorted by order when found', async () => {
    prisma.poll.findUnique.mockResolvedValue({
      id: 'poll-1',
      title: 'Lunch',
      createdAt: new Date('2026-07-12T00:00:00.000Z'),
      options: [
        { id: 'o1', text: 'Sushi', order: 1 },
        { id: 'o0', text: 'Pizza', order: 0 },
      ],
    });

    const result = await service.getPoll('poll-1');

    expect(prisma.poll.findUnique).toHaveBeenCalledWith({
      where: { id: 'poll-1' },
      include: { options: true },
    });
    expect(result.options.map((o) => o.text)).toEqual(['Pizza', 'Sushi']);
  });

  it('getPoll throws NotFoundException when the poll is missing', async () => {
    prisma.poll.findUnique.mockResolvedValue(null);

    await expect(service.getPoll('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
