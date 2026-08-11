// Result DTOs — the single source of truth for the results API contract.
// Mirrors docs/09-api-design.md. These are plain data shapes; the counting
// logic lives in the API's domain layer.

import type { CountingMethod } from '../enums.js';

/** One option with the points it scored under the poll's counting method. */
export interface PollScoreDto {
  optionId: string;
  text: string;
  score: number;
}

/**
 * Calculated results for a poll: GET /api/v1/polls/:id/results.
 * `winners` is the subset of `scores` holding the maximum score — usually one
 * element, several on a tie, none when no ballots have been submitted.
 */
export interface PollResultsResponseDto {
  pollId: string;
  title: string;
  method: CountingMethod;
  winners: PollScoreDto[];
  scores: PollScoreDto[];
  totalBallots: number;
}
