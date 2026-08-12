import { CountingMethod, type PollResultsResponseDto } from '@rank-vote/shared';
import type { BordaResult } from '../../domain/result/borda';

/**
 * Structural shape of the counted poll. Declared here (not imported from
 * Prisma) so the DTO boundary stays decoupled from the ORM.
 */
export interface PersistedPollHeader {
  id: string;
  title: string;
}

/**
 * Maps a tallied poll to the public API DTO (docs/09-api-design.md). The
 * counting method is Borda for every poll in the MVP.
 */
export function toPollResultsResponse(
  poll: PersistedPollHeader,
  result: BordaResult,
  totalBallots: number,
): PollResultsResponseDto {
  return {
    pollId: poll.id,
    title: poll.title,
    method: CountingMethod.BORDA,
    winners: result.winners,
    scores: result.scores,
    totalBallots,
  };
}
