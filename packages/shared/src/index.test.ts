import { describe, expect, it } from 'vitest';
import * as shared from './index.js';

describe('@rank-vote/shared', () => {
  // Smoke test proving the runner is wired; replace with domain tests in Phase 1.
  it('exposes a module surface', () => {
    expect(shared).toBeTypeOf('object');
  });
});
