import { Injectable, NotFoundException } from '@nestjs/common';
import type { PollResultsResponseDto } from '@rank-vote/shared';
import { calculateBorda } from '../../domain/result/borda';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { toPollResultsResponse } from './result.mapper';

@Injectable()
export class ResultService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tallies a poll's ballots by Borda count. Results are computed on every
   * request (no cache — see docs/09-api-design.md); throws 404 when the poll
   * does not exist.
   */
  async getResults(pollId: string): Promise<PollResultsResponseDto> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true, ballots: { include: { entries: true } } },
    });
    if (!poll) {
      throw new NotFoundException(`Poll ${pollId} not found`);
    }

    const result = calculateBorda(poll.options, poll.ballots);
    return toPollResultsResponse(poll, result, poll.ballots.length);
  }
}
