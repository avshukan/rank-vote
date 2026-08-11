import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BallotResponseDto, SubmitBallotDto } from '@rank-vote/shared';
import { validateStrictRanking } from '../../domain/ballot/strict-ranking';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { toBallotResponse } from './ballot.mapper';

@Injectable()
export class BallotService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an anonymous ballot for a poll. Throws 404 when the poll does not
   * exist and 400 when the ballot is not a strict full ranking of its options.
   */
  async submitBallot(
    pollId: string,
    dto: SubmitBallotDto,
  ): Promise<BallotResponseDto> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    if (!poll) {
      throw new NotFoundException(`Poll ${pollId} not found`);
    }

    const violation = validateStrictRanking(
      dto.entries,
      poll.options.map((option) => option.id),
    );
    if (violation) {
      throw new BadRequestException(violation);
    }

    const ballot = await this.prisma.ballot.create({
      data: {
        pollId,
        entries: {
          create: dto.entries.map((entry) => ({
            optionId: entry.optionId,
            rank: entry.rank,
          })),
        },
      },
    });
    return toBallotResponse(ballot);
  }
}
