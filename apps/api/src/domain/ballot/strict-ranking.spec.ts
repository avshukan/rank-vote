import { validateStrictRanking } from './strict-ranking';

const OPTIONS = ['a', 'b', 'c'];

describe('validateStrictRanking', () => {
  it('accepts a full ranking of every option', () => {
    expect(
      validateStrictRanking(
        [
          { optionId: 'a', rank: 1 },
          { optionId: 'b', rank: 2 },
          { optionId: 'c', rank: 3 },
        ],
        OPTIONS,
      ),
    ).toBeNull();
  });

  it('accepts entries in any order as long as the ranks form 1..N', () => {
    expect(
      validateStrictRanking(
        [
          { optionId: 'c', rank: 2 },
          { optionId: 'a', rank: 3 },
          { optionId: 'b', rank: 1 },
        ],
        OPTIONS,
      ),
    ).toBeNull();
  });

  it('rejects a ballot that leaves an option unranked', () => {
    expect(
      validateStrictRanking(
        [
          { optionId: 'a', rank: 1 },
          { optionId: 'b', rank: 2 },
        ],
        OPTIONS,
      ),
    ).toBe('Ballot must rank all 3 options, got 2');
  });

  it('rejects an empty ballot', () => {
    expect(validateStrictRanking([], OPTIONS)).toBe(
      'Ballot must rank all 3 options, got 0',
    );
  });

  it('rejects an option that belongs to another poll', () => {
    expect(
      validateStrictRanking(
        [
          { optionId: 'a', rank: 1 },
          { optionId: 'b', rank: 2 },
          { optionId: 'foreign', rank: 3 },
        ],
        OPTIONS,
      ),
    ).toBe('Option foreign does not belong to this poll');
  });

  it('rejects the same option ranked twice', () => {
    expect(
      validateStrictRanking(
        [
          { optionId: 'a', rank: 1 },
          { optionId: 'b', rank: 2 },
          { optionId: 'a', rank: 3 },
        ],
        OPTIONS,
      ),
    ).toBe('Option a is ranked more than once');
  });

  it('rejects duplicate ranks', () => {
    expect(
      validateStrictRanking(
        [
          { optionId: 'a', rank: 1 },
          { optionId: 'b', rank: 1 },
          { optionId: 'c', rank: 2 },
        ],
        OPTIONS,
      ),
    ).toBe('Ranks must be the unique consecutive integers 1..3');
  });

  it.each([0, -1, 4])('rejects an out-of-range rank (%p)', (rank) => {
    expect(
      validateStrictRanking(
        [
          { optionId: 'a', rank },
          { optionId: 'b', rank: 2 },
          { optionId: 'c', rank: 3 },
        ],
        OPTIONS,
      ),
    ).toBe('Ranks must be the unique consecutive integers 1..3');
  });

  it('rejects a non-integer rank', () => {
    expect(
      validateStrictRanking(
        [
          { optionId: 'a', rank: 1.5 },
          { optionId: 'b', rank: 2 },
          { optionId: 'c', rank: 3 },
        ],
        OPTIONS,
      ),
    ).toBe('Ranks must be the unique consecutive integers 1..3');
  });
});
