// Borda count — the only counting method in the MVP.
// See docs/04-domain-model.md (CountingMethod.BORDA) and the results contract
// in docs/09-api-design.md. Pure domain logic: no framework, no ORM, no HTTP
// concerns — the caller turns the tallied result into a DTO.

import type { RankedOption } from '../ballot/strict-ranking';

/** A poll option taking part in the count. `order` breaks score ties. */
export interface CountedOption {
  id: string;
  text: string;
  order: number;
}

/** A cast ballot as counted: the ranked options it carries. */
export interface CountedBallot {
  entries: readonly RankedOption[];
}

/** One option with the points it scored. */
export interface OptionScore {
  optionId: string;
  text: string;
  score: number;
}

/** A tallied poll: every option scored, plus the leaders. */
export interface BordaResult {
  /** All options, by `score` DESC then `order` ASC. */
  scores: OptionScore[];
  /** The subset of `scores` holding the maximum; empty without ballots. */
  winners: OptionScore[];
}

/**
 * Tallies ballots by Borda count: an option ranked `r` out of `N` options earns
 * `N − r` points, so the first choice gets `N − 1` and the last gets `0`.
 *
 * Every option appears in `scores`, unranked ones with `0`. Entries pointing at
 * an option outside `options` are ignored — the ballot validator rejects those
 * on submit, and stale data must not skew a count.
 */
export function calculateBorda(
  options: readonly CountedOption[],
  ballots: readonly CountedBallot[],
): BordaResult {
  const total = options.length;
  const points = new Map(options.map((option) => [option.id, 0]));

  for (const ballot of ballots) {
    for (const entry of ballot.entries) {
      const current = points.get(entry.optionId);
      if (current === undefined) continue;
      points.set(entry.optionId, current + total - entry.rank);
    }
  }

  const scores = options
    .map((option) => ({
      optionId: option.id,
      text: option.text,
      score: points.get(option.id) ?? 0,
      order: option.order,
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ optionId, text, score }) => ({ optionId, text, score }));

  // Without ballots nothing has been chosen: every option sits at 0, which is a
  // tie among all of them rather than a win (docs/09-api-design.md).
  if (ballots.length === 0 || scores.length === 0) {
    return { scores, winners: [] };
  }

  const best = scores[0].score;
  return { scores, winners: scores.filter((entry) => entry.score === best) };
}
