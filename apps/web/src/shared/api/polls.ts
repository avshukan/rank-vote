import type { CreatePollDto, PollResponseDto, PollResultsResponseDto } from '@rank-vote/shared';
import { apiFetch } from './client';

/** POST /polls — create a poll and return it with generated ids. */
export function createPoll(dto: CreatePollDto): Promise<PollResponseDto> {
  return apiFetch<PollResponseDto>('/polls', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/** GET /polls/:id — fetch a poll by id. */
export function getPoll(id: string): Promise<PollResponseDto> {
  return apiFetch<PollResponseDto>(`/polls/${id}`);
}

/** GET /polls/:id/results — fetch the Borda count for a poll. */
export function getResults(id: string): Promise<PollResultsResponseDto> {
  return apiFetch<PollResultsResponseDto>(`/polls/${id}/results`);
}
