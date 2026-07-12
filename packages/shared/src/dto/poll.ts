// Poll DTOs — the single source of truth for the poll API contract.
// Mirrors docs/09-api-design.md. These are plain data shapes; input
// validation (class-validator) lives at the API's presentation edge.

/** A selectable option within a poll. */
export interface PollOptionDto {
  id: string;
  text: string;
  order: number;
}

/** Request body for creating a poll: POST /api/v1/polls. */
export interface CreatePollDto {
  title: string;
  options: string[];
}

/**
 * A poll as returned by the API. Used for both the create response
 * (201) and the get response (200) — they share the same shape.
 */
export interface PollResponseDto {
  id: string;
  title: string;
  options: PollOptionDto[];
  createdAt: string;
}
