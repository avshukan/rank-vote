import { describe, expect, it } from 'vitest';
import { BallotFormat, CountingMethod, MAX_OPTIONS, MIN_OPTIONS } from './index.js';

describe('@rank-vote/shared', () => {
  it('exposes the MVP option-count bounds', () => {
    expect(MIN_OPTIONS).toBe(2);
    expect(MAX_OPTIONS).toBe(10);
    expect(MIN_OPTIONS).toBeLessThan(MAX_OPTIONS);
  });

  it('exposes the MVP ballot format and counting method', () => {
    expect(BallotFormat.STRICT_RANKING).toBe('STRICT_RANKING');
    expect(CountingMethod.BORDA).toBe('BORDA');
  });
});
