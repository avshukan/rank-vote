import type { CreatePollDto, PollResponseDto } from '@rank-vote/shared';
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
