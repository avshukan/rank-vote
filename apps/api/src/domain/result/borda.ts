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

/** How one place on the ballots contributed to an option's score. */
export interface PlaceTally {
  place: number;
  points: number;
  ballots: number;
  subtotal: number;
}

/** One option with the points it scored and where they came from. */
export interface OptionScore {
  optionId: string;
  text: string;
  score: number;
  /**
   * One row per place `1..N`, ascending. For valid ballots the subtotals add
   * up to `score`.
   */
  breakdown: PlaceTally[];
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
 *
 * Each entry also carries a breakdown: for every place `1..N`, how many ballots
 * put the option there and the points that earned. For valid ballots the
 * subtotals add up to `score`.
 */
export function calculateBorda(
  options: readonly CountedOption[],
  ballots: readonly CountedBallot[],
): BordaResult {
  const total = options.length;
  const points = new Map(options.map((option) => [option.id, 0]));
  // Ballots per option at each place `1..N`, at index `place − 1`.
  const placeCounts = new Map(
    options.map((option) => [option.id, new Array<number>(total).fill(0)]),
  );

  for (const ballot of ballots) {
    for (const entry of ballot.entries) {
      const current = points.get(entry.optionId);
      if (current === undefined) continue;
      points.set(entry.optionId, current + total - entry.rank);

      // The breakdown has rows for places 1..N only. A stored rank outside
      // them, which the ballot validator rejects on submit, still adds to the
      // score above as it did before the breakdown existed; it simply has no
      // row to be counted in. What such data should mean is not decided here.
      const counts = placeCounts.get(entry.optionId);
      if (
        counts !== undefined &&
        Number.isInteger(entry.rank) &&
        entry.rank >= 1 &&
        entry.rank <= total
      ) {
        counts[entry.rank - 1] += 1;
      }
    }
  }

  const scores = options
    .map((option) => {
      const breakdown = (placeCounts.get(option.id) ?? []).map(
        (count, index): PlaceTally => {
          const place = index + 1;
          const worth = total - place;
          return {
            place,
            points: worth,
            ballots: count,
            subtotal: worth * count,
          };
        },
      );
      return {
        optionId: option.id,
        text: option.text,
        score: points.get(option.id) ?? 0,
        breakdown,
        order: option.order,
      };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ optionId, text, score, breakdown }) => ({
      optionId,
      text,
      score,
      breakdown,
    }));

  // Without ballots nothing has been chosen: every option sits at 0, which is a
  // tie among all of them rather than a win (docs/09-api-design.md).
  if (ballots.length === 0 || scores.length === 0) {
    return { scores, winners: [] };
  }

  const best = scores[0].score;
  return { scores, winners: scores.filter((entry) => entry.score === best) };
}
