import { markPollAsVoted, readVotedPollIds } from './voted-polls';

describe('voted-polls', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts empty and appends voted poll ids', () => {
    expect(readVotedPollIds()).toEqual([]);

    markPollAsVoted('poll-1');
    markPollAsVoted('poll-2');

    expect(readVotedPollIds()).toEqual(['poll-1', 'poll-2']);
  });

  it('does not record the same poll twice', () => {
    markPollAsVoted('poll-1');
    markPollAsVoted('poll-1');

    expect(readVotedPollIds()).toEqual(['poll-1']);
  });

  it('ignores corrupted storage instead of throwing', () => {
    window.localStorage.setItem('voted_poll_ids', 'not json');

    expect(readVotedPollIds()).toEqual([]);

    markPollAsVoted('poll-1');
    expect(readVotedPollIds()).toEqual(['poll-1']);
  });

  it('drops non-string entries', () => {
    window.localStorage.setItem('voted_poll_ids', '["poll-1", 42, null]');

    expect(readVotedPollIds()).toEqual(['poll-1']);
  });
});
