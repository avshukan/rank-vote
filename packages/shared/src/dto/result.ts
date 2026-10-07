// Result DTOs — the single source of truth for the results API contract.
// Mirrors docs/09-api-design.md. These are plain data shapes; the counting
// logic lives in the API's domain layer.

import type { CountingMethod } from '../enums.js';

/**
 * One place in a Borda breakdown: how many ballots ranked the option there and
 * what that earned it. The API computes every field, so clients hold no
 * counting formula.
 */
export interface BordaPlaceDto {
  /** 1-based place on the ballot. */
  place: number;
  /** Borda points for this place: `N − place`. */
  points: number;
  /** Ballots that ranked the option at this place. */
  ballots: number;
  /** `points × ballots`. */
  subtotal: number;
}

/** One option with its Borda score and the per-place breakdown behind it. */
export interface BordaScoreDto {
  optionId: string;
  text: string;
  score: number;
  /** One row per place `1..N`, ascending; the subtotals add up to `score`. */
  breakdown: BordaPlaceDto[];
}

/**
 * Borda results for a poll. `winners` is the subset of `scores` holding the
 * maximum score — usually one element, several on a tie, none when no ballots
 * have been submitted.
 */
export interface BordaResultsResponseDto {
  pollId: string;
  title: string;
  method: CountingMethod.BORDA;
  winners: BordaScoreDto[];
  scores: BordaScoreDto[];
  totalBallots: number;
}

/**
 * Calculated results for a poll: GET /api/v1/polls/:id/results. Discriminated
 * by `method`; Borda is the only variant so far, and each new counting method
 * adds its own.
 */
export type PollResultsResponseDto = BordaResultsResponseDto;
