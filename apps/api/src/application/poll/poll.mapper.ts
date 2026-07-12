import type { PollResponseDto } from '@rank-vote/shared';

/**
 * Structural shape of a persisted poll with its options. Declared here (not
 * imported from Prisma) so the DTO boundary stays decoupled from the ORM:
 * any query result that has these fields maps cleanly, Prisma or otherwise.
 */
export interface PersistedPoll {
  id: string;
  title: string;
  createdAt: Date;
  options: { id: string; text: string; order: number }[];
}

/** Maps a persisted poll to the public API DTO (docs/09-api-design.md). */
export function toPollResponse(poll: PersistedPoll): PollResponseDto {
  return {
    id: poll.id,
    title: poll.title,
    createdAt: poll.createdAt.toISOString(),
    options: poll.options
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((option) => ({
        id: option.id,
        text: option.text,
        order: option.order,
      })),
  };
}
