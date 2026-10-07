import { calculateBorda, type CountedBallot, type OptionScore } from './borda';

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

/** Scores without their breakdowns, for the tests about the totals alone. */
const totals = (entries: OptionScore[]) =>
  entries.map(({ optionId, text, score }) => ({ optionId, text, score }));

describe('calculateBorda', () => {
  it('awards N − rank points per ballot', () => {
    const { scores } = calculateBorda(OPTIONS, [ballot('a', 'b', 'c')]);

    expect(totals(scores)).toEqual([
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

    expect(totals(scores)).toEqual([
      { optionId: 'b', text: 'Sushi', score: 5 },
      { optionId: 'a', text: 'Pizza', score: 3 },
      { optionId: 'c', text: 'Salad', score: 1 },
    ]);
    expect(totals(winners)).toEqual([
      { optionId: 'b', text: 'Sushi', score: 5 },
    ]);
  });

  it('returns every option tied at the top as a winner', () => {
    const { winners } = calculateBorda(OPTIONS, [
      ballot('a', 'b', 'c'),
      ballot('b', 'a', 'c'),
    ]);

    expect(totals(winners)).toEqual([
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

    expect(totals(scores)).toEqual([
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

    expect(totals(scores)).toEqual([
      { optionId: 'a', text: 'Pizza', score: 2 },
      { optionId: 'b', text: 'Sushi', score: 1 },
      { optionId: 'c', text: 'Salad', score: 0 },
    ]);
  });

  it('scores an option nobody ranked as 0', () => {
    const { scores } = calculateBorda(OPTIONS, [ballot('a', 'b')]);

    expect(totals(scores)).toContainEqual({
      optionId: 'c',
      text: 'Salad',
      score: 0,
    });
  });

  describe('breakdown', () => {
    const THREE_BALLOTS = [
      ballot('a', 'b', 'c'),
      ballot('b', 'a', 'c'),
      ballot('b', 'c', 'a'),
    ];

    /** The breakdown of one option, by id. */
    const breakdownOf = (entries: OptionScore[], optionId: string) =>
      entries.find((entry) => entry.optionId === optionId)?.breakdown;

    it('lists every place with its points, ballot count and subtotal', () => {
      const { scores } = calculateBorda(OPTIONS, THREE_BALLOTS);

      expect(breakdownOf(scores, 'b')).toEqual([
        { place: 1, points: 2, ballots: 2, subtotal: 4 },
        { place: 2, points: 1, ballots: 1, subtotal: 1 },
        { place: 3, points: 0, ballots: 0, subtotal: 0 },
      ]);
      expect(breakdownOf(scores, 'a')).toEqual([
        { place: 1, points: 2, ballots: 1, subtotal: 2 },
        { place: 2, points: 1, ballots: 1, subtotal: 1 },
        { place: 3, points: 0, ballots: 1, subtotal: 0 },
      ]);
      expect(breakdownOf(scores, 'c')).toEqual([
        { place: 1, points: 2, ballots: 0, subtotal: 0 },
        { place: 2, points: 1, ballots: 1, subtotal: 1 },
        { place: 3, points: 0, ballots: 2, subtotal: 0 },
      ]);
    });

    it('adds up to the score and to the ballot count for every option', () => {
      const { scores } = calculateBorda(OPTIONS, THREE_BALLOTS);

      for (const entry of scores) {
        const sum = (field: 'subtotal' | 'ballots') =>
          entry.breakdown.reduce((total, row) => total + row[field], 0);
        expect(sum('subtotal')).toBe(entry.score);
        expect(sum('ballots')).toBe(THREE_BALLOTS.length);
      }
    });

    it('gives winners the same breakdown as their score entry', () => {
      const { scores, winners } = calculateBorda(OPTIONS, THREE_BALLOTS);

      expect(winners).toEqual([scores[0]]);
      expect(winners[0].breakdown).toHaveLength(OPTIONS.length);
    });

    it('lists every place with zero ballots when nobody voted', () => {
      const { scores } = calculateBorda(OPTIONS, []);

      for (const entry of scores) {
        expect(entry.breakdown).toEqual([
          { place: 1, points: 2, ballots: 0, subtotal: 0 },
          { place: 2, points: 1, ballots: 0, subtotal: 0 },
          { place: 3, points: 0, ballots: 0, subtotal: 0 },
        ]);
      }
    });

    it('ignores entries for a foreign option or a place outside 1..N', () => {
      const { scores } = calculateBorda(OPTIONS, [
        {
          entries: [
            { optionId: 'foreign', rank: 1 },
            { optionId: 'c', rank: 4 },
            ...ballot('a', 'b').entries,
          ],
        },
      ]);

      expect(breakdownOf(scores, 'a')).toEqual([
        { place: 1, points: 2, ballots: 1, subtotal: 2 },
        { place: 2, points: 1, ballots: 0, subtotal: 0 },
        { place: 3, points: 0, ballots: 0, subtotal: 0 },
      ]);
      expect(breakdownOf(scores, 'c')?.every((row) => row.ballots === 0)).toBe(
        true,
      );
      expect(scores.map((entry) => entry.optionId)).not.toContain('foreign');
    });
  });
});
