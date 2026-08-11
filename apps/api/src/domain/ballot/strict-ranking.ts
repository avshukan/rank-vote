// Strict full ranking — the only ballot format in the MVP.
// See docs/04-domain-model.md (BallotFormat.STRICT_RANKING) and the ballot
// constraints in docs/09-api-design.md. Pure domain logic: no framework,
// no ORM, no HTTP concerns — the caller turns a message into a 400.

/** One ranked option as submitted by a voter. */
export interface RankedOption {
  optionId: string;
  rank: number;
}

/**
 * Checks a ballot against a poll's options: every option ranked exactly once,
 * with ranks being the consecutive integers 1..N.
 *
 * Returns `null` when the ballot is valid, otherwise a message explaining the
 * first violation found.
 */
export function validateStrictRanking(
  entries: readonly RankedOption[],
  optionIds: readonly string[],
): string | null {
  const total = optionIds.length;

  if (entries.length !== total) {
    return `Ballot must rank all ${total} options, got ${entries.length}`;
  }

  const pollOptions = new Set(optionIds);
  const ranked = new Set<string>();
  for (const entry of entries) {
    if (!pollOptions.has(entry.optionId)) {
      return `Option ${entry.optionId} does not belong to this poll`;
    }
    if (ranked.has(entry.optionId)) {
      return `Option ${entry.optionId} is ranked more than once`;
    }
    ranked.add(entry.optionId);
  }

  const ranks = entries.map((entry) => entry.rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    return `Ranks must be the unique consecutive integers 1..${total}`;
  }

  return null;
}
