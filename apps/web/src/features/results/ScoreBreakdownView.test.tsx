import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CountingMethod, type PollResultsResponseDto } from '@rank-vote/shared';
import { ScoreBreakdownView } from './ScoreBreakdownView';
import { ApiError } from '../../shared/api/client';
import { getResults } from '../../shared/api/polls';

vi.mock('../../shared/api/polls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/polls')>();
  return { ...actual, getResults: vi.fn() };
});

const getResultsMock = vi.mocked(getResults);

/** Sushi after three ballots, as the API counts it: ranked 1st twice, 2nd once. */
const SUSHI = {
  optionId: 'o1',
  text: 'Sushi',
  score: 5,
  breakdown: [
    { place: 1, points: 2, ballots: 2, subtotal: 4 },
    { place: 2, points: 1, ballots: 1, subtotal: 1 },
    { place: 3, points: 0, ballots: 0, subtotal: 0 },
  ],
};

const RESULTS: PollResultsResponseDto = {
  pollId: 'poll-1',
  title: 'Lunch?',
  method: CountingMethod.BORDA,
  winners: [SUSHI],
  scores: [
    SUSHI,
    {
      optionId: 'o0',
      text: 'Pizza',
      score: 3,
      breakdown: [
        { place: 1, points: 2, ballots: 1, subtotal: 2 },
        { place: 2, points: 1, ballots: 1, subtotal: 1 },
        { place: 3, points: 0, ballots: 1, subtotal: 0 },
      ],
    },
  ],
  totalBallots: 3,
};

const NO_BALLOTS: PollResultsResponseDto = {
  ...RESULTS,
  winners: [],
  scores: RESULTS.scores.map((score) => ({
    ...score,
    score: 0,
    breakdown: score.breakdown.map((row) => ({ ...row, ballots: 0, subtotal: 0 })),
  })),
  totalBallots: 0,
};

const renderBreakdown = (optionId = 'o1') =>
  render(
    <MemoryRouter>
      <ScoreBreakdownView pollId="poll-1" optionId={optionId} />
    </MemoryRouter>,
  );

/** The breakdown body as [place, points, count, subtotal] rows, in rendered order. */
const breakdownRows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => Array.from(row.children, (cell) => cell.textContent));

describe('ScoreBreakdownView', () => {
  beforeEach(() => {
    getResultsMock.mockReset();
  });

  it('shows the poll, the option and its score broken down by place', async () => {
    getResultsMock.mockResolvedValue(RESULTS);

    renderBreakdown('o1');

    expect(await screen.findByRole('heading', { name: 'Sushi' })).toBeInTheDocument();
    expect(screen.getByText('Lunch?')).toBeInTheDocument();
    expect(screen.getByText('5 points')).toBeInTheDocument();
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Place', 'Points', 'Count', 'Subtotal']);
    expect(breakdownRows()).toEqual([
      ['1st', '2', '2', '4'],
      ['2nd', '1', '1', '1'],
      ['3rd', '0', '0', '0'],
    ]);
    expect(getResultsMock).toHaveBeenCalledWith('poll-1');
  });

  it('links back to the poll results', async () => {
    getResultsMock.mockResolvedValue(RESULTS);

    renderBreakdown();

    expect(await screen.findByRole('link', { name: 'Back to results' })).toHaveAttribute(
      'href',
      '/poll/poll-1/results',
    );
  });

  it('shows the breakdown of the option in the URL, not the winner', async () => {
    getResultsMock.mockResolvedValue(RESULTS);

    renderBreakdown('o0');

    expect(await screen.findByRole('heading', { name: 'Pizza' })).toBeInTheDocument();
    expect(breakdownRows()).toEqual([
      ['1st', '2', '1', '2'],
      ['2nd', '1', '1', '1'],
      ['3rd', '0', '1', '0'],
    ]);
  });

  it('renders the API numbers as they are, with no counting of its own', async () => {
    getResultsMock.mockResolvedValue({
      ...RESULTS,
      scores: [
        {
          ...SUSHI,
          score: 70,
          breakdown: [
            { place: 1, points: 9, ballots: 7, subtotal: 63 },
            { place: 2, points: 7, ballots: 1, subtotal: 7 },
            { place: 3, points: 5, ballots: 0, subtotal: 0 },
          ],
        },
      ],
    });

    renderBreakdown('o1');

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('70 points')).toBeInTheDocument();
    expect(breakdownRows()).toEqual([
      ['1st', '9', '7', '63'],
      ['2nd', '7', '1', '7'],
      ['3rd', '5', '0', '0'],
    ]);
  });

  it('replaces the breakdown with "No votes yet" when nobody has voted', async () => {
    getResultsMock.mockResolvedValue(NO_BALLOTS);

    renderBreakdown('o1');

    expect(await screen.findByText('No votes yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sushi' })).toBeInTheDocument();
    expect(screen.getByText('Lunch?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to results' })).toHaveAttribute(
      'href',
      '/poll/poll-1/results',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the shared not-found copy for a poll that does not exist, with no retry', async () => {
    getResultsMock.mockRejectedValue(new ApiError(404, 'Poll not found'));

    renderBreakdown();

    expect(await screen.findByRole('heading', { name: 'Poll not found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows an option-specific not-found for an option outside the poll, with no retry', async () => {
    getResultsMock.mockResolvedValue(RESULTS);

    renderBreakdown('no-such-option');

    expect(await screen.findByRole('heading', { name: 'Option not found' })).toBeInTheDocument();
    expect(screen.getByText('This poll has no such option.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a poll' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers a retry that refetches after a network failure', async () => {
    const user = userEvent.setup();
    getResultsMock.mockRejectedValueOnce(new Error('offline'));

    renderBreakdown();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the score breakdown.',
    );

    getResultsMock.mockResolvedValue(RESULTS);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(getResultsMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the retry for a server error, which is not a missing poll', async () => {
    getResultsMock.mockRejectedValue(new ApiError(503, 'Service Unavailable'));

    renderBreakdown();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the score breakdown.',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Poll not found' })).not.toBeInTheDocument();
  });
});
