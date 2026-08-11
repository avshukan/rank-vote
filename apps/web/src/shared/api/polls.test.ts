import { CountingMethod, type PollResultsResponseDto } from '@rank-vote/shared';
import { ApiError } from './client';
import { getResults } from './polls';

const RESULTS: PollResultsResponseDto = {
  pollId: 'poll-1',
  title: 'Lunch?',
  method: CountingMethod.BORDA,
  winners: [{ optionId: 'o0', text: 'Pizza', score: 1 }],
  scores: [
    { optionId: 'o0', text: 'Pizza', score: 1 },
    { optionId: 'o1', text: 'Sushi', score: 0 },
  ],
  totalBallots: 1,
};

describe('getResults', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the results endpoint and returns the parsed body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(RESULTS),
    });

    await expect(getResults('poll-1')).resolves.toEqual(RESULTS);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/polls\/poll-1\/results$/);
  });

  it('raises an ApiError carrying the status of a failed request', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Poll poll-9 not found' }),
    });

    await expect(getResults('poll-9')).rejects.toThrow(ApiError);
  });
});
