import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CountingMethod, type PollResultsResponseDto } from '@rank-vote/shared';
import { ResultsView } from './ResultsView';
import { ApiError } from '../../shared/api/client';
import { getResults } from '../../shared/api/polls';

vi.mock('../../shared/api/polls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/polls')>();
  return { ...actual, getResults: vi.fn() };
});

const getResultsMock = vi.mocked(getResults);

const results = (
  entries: [text: string, score: number][],
  totalBallots: number,
): PollResultsResponseDto => {
  const scores = entries.map(([text, score], index) => ({
    optionId: `o${index}`,
    text,
    score,
  }));
  const best = Math.max(...scores.map((score) => score.score));
  return {
    pollId: 'poll-1',
    title: 'Lunch?',
    method: CountingMethod.BORDA,
    winners: totalBallots === 0 ? [] : scores.filter((score) => score.score === best),
    scores,
    totalBallots,
  };
};

const renderResults = () =>
  render(
    <MemoryRouter>
      <ResultsView pollId="poll-1" />
    </MemoryRouter>,
  );

/** The table body as [position, option, score] triples, in rendered order. */
const scoreRows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    );

describe('ResultsView', () => {
  beforeEach(() => {
    getResultsMock.mockReset();
  });

  it('shows the poll title, the winner and the score table', async () => {
    getResultsMock.mockResolvedValue(
      results(
        [
          ['Pizza', 4],
          ['Sushi', 2],
        ],
        3,
      ),
    );

    renderResults();

    expect(await screen.findByRole('heading', { name: 'Lunch?' })).toBeInTheDocument();
    expect(screen.getByText('Winner')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Pizza');
    expect(scoreRows()).toEqual([
      ['1', 'Pizza', '4'],
      ['2', 'Sushi', '2'],
    ]);
    expect(screen.getByText('3 ballots counted')).toBeInTheDocument();
  });

  it('labels a tie as tied winners and lists every leader', async () => {
    getResultsMock.mockResolvedValue(
      results(
        [
          ['Pizza', 3],
          ['Sushi', 3],
          ['Burgers', 1],
        ],
        2,
      ),
    );

    renderResults();

    expect(await screen.findByText('Tied winners')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Pizza',
      'Sushi',
    ]);
  });

  it('gives every group of equal scores a shared position range', async () => {
    getResultsMock.mockResolvedValue(
      results(
        [
          ['Pizza', 5],
          ['Sushi', 4],
          ['Burgers', 4],
          ['Salad', 2],
        ],
        4,
      ),
    );

    renderResults();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(scoreRows().map(([position]) => position)).toEqual(['1', '2-3', '2-3', '4']);
  });

  it('replaces the winner and the table with a share prompt when nobody has voted', async () => {
    getResultsMock.mockResolvedValue(
      results(
        [
          ['Pizza', 0],
          ['Sushi', 0],
        ],
        0,
      ),
    );

    renderResults();

    expect(await screen.findByText('No votes yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Vote link')).toHaveValue(`${window.location.origin}/poll/poll-1`);
    expect(screen.getByRole('heading', { name: 'Lunch?' })).toBeInTheDocument();
    expect(screen.getByText('0 ballots counted')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Winner')).not.toBeInTheDocument();
  });

  it('shows the shared not-found copy for a poll that does not exist, with no retry', async () => {
    getResultsMock.mockRejectedValue(new ApiError(404, 'Poll not found'));

    renderResults();

    expect(await screen.findByRole('heading', { name: 'Poll not found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('offers a retry that refetches after a network failure', async () => {
    const user = userEvent.setup();
    getResultsMock.mockRejectedValueOnce(new Error('offline'));

    renderResults();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the results.');

    getResultsMock.mockResolvedValue(
      results(
        [
          ['Pizza', 4],
          ['Sushi', 2],
        ],
        3,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(getResultsMock).toHaveBeenCalledTimes(2);
  });
});
