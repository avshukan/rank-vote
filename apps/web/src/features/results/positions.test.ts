import type { PollScoreDto } from '@rank-vote/shared';
import { positionLabels } from './positions';

/** Only `score` drives the labels; the rest is filler to satisfy the DTO. */
const withScores = (...scores: number[]): PollScoreDto[] =>
  scores.map((score, index) => ({ optionId: `o${index}`, text: `Option ${index}`, score }));

describe('positionLabels', () => {
  it('numbers a table with no ties straight through', () => {
    expect(positionLabels(withScores(6, 4, 1))).toEqual(['1', '2', '3']);
  });

  it('gives tied leaders a shared range and skips the next position past it', () => {
    expect(positionLabels(withScores(3, 3, 1))).toEqual(['1-2', '1-2', '3']);
  });

  it('applies the range to ties below the winners too', () => {
    expect(positionLabels(withScores(5, 4, 4, 2))).toEqual(['1', '2-3', '2-3', '4']);
  });

  it('spans the whole table when every option is tied', () => {
    expect(positionLabels(withScores(0, 0, 0))).toEqual(['1-3', '1-3', '1-3']);
  });

  it('handles several separate tie groups', () => {
    expect(positionLabels(withScores(9, 9, 5, 2, 2, 2))).toEqual([
      '1-2',
      '1-2',
      '3',
      '4-6',
      '4-6',
      '4-6',
    ]);
  });

  it('labels a single option and an empty table', () => {
    expect(positionLabels(withScores(7))).toEqual(['1']);
    expect(positionLabels([])).toEqual([]);
  });
});
