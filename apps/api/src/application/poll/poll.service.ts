import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePollDto, PollResponseDto } from '@rank-vote/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { toPollResponse } from './poll.mapper';

@Injectable()
export class PollService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a poll with its options; option order follows array position. */
  async createPoll(dto: CreatePollDto): Promise<PollResponseDto> {
    const poll = await this.prisma.poll.create({
      data: {
        title: dto.title,
        options: {
          create: dto.options.map((text, index) => ({ text, order: index })),
        },
      },
      include: { options: true },
    });
    return toPollResponse(poll);
  }

  /** Returns a poll with its options, or throws 404 if it does not exist. */
  async getPoll(id: string): Promise<PollResponseDto> {
    const poll = await this.prisma.poll.findUnique({
      where: { id },
      include: { options: true },
    });
    if (!poll) {
      throw new NotFoundException(`Poll ${id} not found`);
    }
    return toPollResponse(poll);
  }
}
