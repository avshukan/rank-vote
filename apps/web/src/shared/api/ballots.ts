import type { BallotResponseDto, SubmitBallotDto } from '@rank-vote/shared';
import { apiFetch } from './client';

/** POST /polls/:id/ballots — submit a strict full ranking for a poll. */
export function submitBallot(pollId: string, dto: SubmitBallotDto): Promise<BallotResponseDto> {
  return apiFetch<BallotResponseDto>(`/polls/${pollId}/ballots`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}
