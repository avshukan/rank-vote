// Ballot DTOs — the single source of truth for the ballot API contract.
// Mirrors docs/09-api-design.md. These are plain data shapes; input
// validation (class-validator) lives at the API's presentation edge.

/** One ranked option inside a ballot. Ranks start at 1 (best). */
export interface BallotEntryDto {
  optionId: string;
  rank: number;
}

/**
 * Request body for submitting a ballot: POST /api/v1/polls/:id/ballots.
 * MVP accepts STRICT_RANKING only: every poll option appears exactly once
 * and ranks are the consecutive integers 1..N.
 */
export interface SubmitBallotDto {
  entries: BallotEntryDto[];
}

/** A submitted ballot as returned by the API (201). Entries are not echoed. */
export interface BallotResponseDto {
  id: string;
  pollId: string;
  createdAt: string;
}
