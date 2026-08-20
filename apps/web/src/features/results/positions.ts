import type { PollScoreDto } from '@rank-vote/shared';

/**
 * Position label for every row of the score table, in the order the rows are
 * rendered. The API returns `scores` already sorted (score DESC, then option
 * order ASC), so equal scores are always adjacent and one pass is enough.
 *
 * Every group of equal scores shares a range and the next position skips past
 * it: scores 5, 4, 4, 2 become "1", "2-3", "2-3", "4". The rule covers the
 * whole table, not only the winners — see docs/acceptance-criteria.md (#5).
 */
export function positionLabels(scores: PollScoreDto[]): string[] {
  const labels: string[] = [];

  for (let start = 0; start < scores.length; ) {
    let end = start + 1;
    while (end < scores.length && scores[end].score === scores[start].score) {
      end += 1;
    }

    const label = end - start === 1 ? `${start + 1}` : `${start + 1}-${end}`;
    for (let row = start; row < end; row += 1) {
      labels.push(label);
    }

    start = end;
  }

  return labels;
}
