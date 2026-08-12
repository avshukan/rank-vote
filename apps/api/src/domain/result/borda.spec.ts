import { calculateBorda, type CountedBallot } from './borda';

const OPTIONS = [
  { id: 'a', text: 'Pizza', order: 0 },
  { id: 'b', text: 'Sushi', order: 1 },
  { id: 'c', text: 'Salad', order: 2 },
];

/** A ballot ranking the given option ids from best to worst. */
const ballot = (...optionIds: string[]): CountedBallot => ({
  entries: optionIds.map((optionId, index) => ({
    optionId,
    rank: index + 1,
  })),
});

describe('calculateBorda', () => {
  it('awards N − rank points per ballot', () => {
    const { scores } = calculateBorda(OPTIONS, [ballot('a', 'b', 'c')]);

    expect(scores).toEqual([
      { optionId: 'a', text: 'Pizza', score: 2 },
      { optionId: 'b', text: 'Sushi', score: 1 },
      { optionId: 'c', text: 'Salad', score: 0 },
    ]);
  });

  it('sums points across ballots and names the leader as winner', () => {
    const { scores, winners } = calculateBorda(OPTIONS, [
      ballot('a', 'b', 'c'),
      ballot('b', 'a', 'c'),
      ballot('b', 'c', 'a'),
    ]);

    expect(scores).toEqual([
      { optionId: 'b', text: 'Sushi', score: 5 },
      { optionId: 'a', text: 'Pizza', score: 3 },
      { optionId: 'c', text: 'Salad', score: 1 },
    ]);
    expect(winners).toEqual([{ optionId: 'b', text: 'Sushi', score: 5 }]);
  });

  it('returns every option tied at the top as a winner', () => {
    const { winners } = calculateBorda(OPTIONS, [
      ballot('a', 'b', 'c'),
      ballot('b', 'a', 'c'),
    ]);

    expect(winners).toEqual([
      { optionId: 'a', text: 'Pizza', score: 3 },
      { optionId: 'b', text: 'Sushi', score: 3 },
    ]);
  });

  it('reports all options as winners when every one ties', () => {
    const { winners, scores } = calculateBorda(OPTIONS, [
      ballot('a', 'b', 'c'),
      ballot('b', 'c', 'a'),
      ballot('c', 'a', 'b'),
    ]);

    expect(scores.every((entry) => entry.score === 3)).toBe(true);
    expect(winners).toHaveLength(3);
  });

  it('breaks score ties by option order, not by id or text', () => {
    const { scores } = calculateBorda(OPTIONS, [ballot('c', 'a', 'b')]);

    // c: 2, a: 1, b: 0 — then a tie at 0 would follow poll order.
    expect(scores.map((entry) => entry.optionId)).toEqual(['c', 'a', 'b']);
  });

  it('scores all options 0 and picks no winner without ballots', () => {
    const { scores, winners } = calculateBorda(OPTIONS, []);

    expect(scores).toEqual([
      { optionId: 'a', text: 'Pizza', score: 0 },
      { optionId: 'b', text: 'Sushi', score: 0 },
      { optionId: 'c', text: 'Salad', score: 0 },
    ]);
    expect(winners).toEqual([]);
  });

  it('keeps winners a subset of scores', () => {
    const { scores, winners } = calculateBorda(OPTIONS, [
      ballot('a', 'b', 'c'),
    ]);

    for (const winner of winners) {
      expect(scores).toContainEqual(winner);
    }
  });

  it('ignores entries pointing at an option from another poll', () => {
    const { scores } = calculateBorda(OPTIONS, [
      {
        entries: [
          { optionId: 'foreign', rank: 1 },
          ...ballot('a', 'b').entries,
        ],
      },
    ]);

    expect(scores).toEqual([
      { optionId: 'a', text: 'Pizza', score: 2 },
      { optionId: 'b', text: 'Sushi', score: 1 },
      { optionId: 'c', text: 'Salad', score: 0 },
    ]);
  });

  it('scores an option nobody ranked as 0', () => {
    const { scores } = calculateBorda(OPTIONS, [ballot('a', 'b')]);

    expect(scores).toContainEqual({ optionId: 'c', text: 'Salad', score: 0 });
  });
});
