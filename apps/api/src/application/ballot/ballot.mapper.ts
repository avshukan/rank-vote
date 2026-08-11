import type { BallotResponseDto } from '@rank-vote/shared';

/**
 * Structural shape of a persisted ballot. Declared here (not imported from
 * Prisma) so the DTO boundary stays decoupled from the ORM.
 */
export interface PersistedBallot {
  id: string;
  pollId: string;
  createdAt: Date;
}

/** Maps a persisted ballot to the public API DTO (docs/09-api-design.md). */
export function toBallotResponse(ballot: PersistedBallot): BallotResponseDto {
  return {
    id: ballot.id,
    pollId: ballot.pollId,
    createdAt: ballot.createdAt.toISOString(),
  };
}
