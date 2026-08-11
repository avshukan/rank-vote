import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { PollResponseDto } from '@rank-vote/shared';
import { BallotForm } from './BallotForm';
import { ApiError } from '../../shared/api/client';
import { submitBallot } from '../../shared/api/ballots';
import { getPoll } from '../../shared/api/polls';

vi.mock('../../shared/api/polls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/polls')>();
  return { ...actual, getPoll: vi.fn() };
});
vi.mock('../../shared/api/ballots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/ballots')>();
  return { ...actual, submitBallot: vi.fn() };
});

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const getPollMock = vi.mocked(getPoll);
const submitBallotMock = vi.mocked(submitBallot);

const POLL: PollResponseDto = {
  id: 'poll-1',
  title: 'Lunch?',
  createdAt: '2026-08-11T00:00:00.000Z',
  options: [
    { id: 'o0', text: 'Pizza', order: 0 },
    { id: 'o1', text: 'Sushi', order: 1 },
    { id: 'o2', text: 'Salad', order: 2 },
  ],
};

/** The option texts in their currently displayed (ranked) order. */
const rankedTexts = () =>
  within(screen.getByRole('list', { name: 'Your ranking' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace(/[↑↓]/g, '').trim());

const renderForm = () =>
  render(
    <MemoryRouter>
      <BallotForm pollId="poll-1" />
    </MemoryRouter>,
  );

describe('BallotForm', () => {
  beforeEach(() => {
    getPollMock.mockReset().mockResolvedValue(POLL);
    submitBallotMock.mockReset();
    navigateMock.mockReset();
    window.localStorage.clear();
  });

  it('lists every option in poll order, ranked from 1', async () => {
    renderForm();

    expect(await screen.findByRole('heading', { name: 'Lunch?' })).toBeInTheDocument();
    expect(rankedTexts()).toEqual(['1PizzaRank 1 of 3', '2SushiRank 2 of 3', '3SaladRank 3 of 3']);
  });

  it('reorders the ranking with the ↑/↓ buttons', async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole('heading', { name: 'Lunch?' });

    await user.click(screen.getByRole('button', { name: 'Move Salad up' }));

    expect(rankedTexts()).toEqual(['1PizzaRank 1 of 3', '2SaladRank 2 of 3', '3SushiRank 3 of 3']);
    // The ends of the list cannot move further out.
    expect(screen.getByRole('button', { name: 'Move Pizza up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Sushi down' })).toBeDisabled();
  });

  it('submits the displayed order as ranks 1..N, stores the vote and redirects', async () => {
    submitBallotMock.mockResolvedValue({
      id: 'ballot-1',
      pollId: 'poll-1',
      createdAt: '2026-08-11T10:00:00.000Z',
    });
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole('heading', { name: 'Lunch?' });

    await user.click(screen.getByRole('button', { name: 'Move Salad up' }));
    await user.click(screen.getByRole('button', { name: 'Submit vote' }));

    expect(submitBallotMock).toHaveBeenCalledWith('poll-1', {
      entries: [
        { optionId: 'o0', rank: 1 },
        { optionId: 'o2', rank: 2 },
        { optionId: 'o1', rank: 3 },
      ],
    });
    expect(window.localStorage.getItem('voted_poll_ids')).toBe('["poll-1"]');
    expect(navigateMock).toHaveBeenCalledWith('/poll/poll-1/results', {
      replace: true,
      state: { justVoted: true },
    });
  });

  it('keeps the ranking and offers a retry when submitting fails', async () => {
    submitBallotMock.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole('heading', { name: 'Lunch?' });

    await user.click(screen.getByRole('button', { name: 'Move Salad up' }));
    await user.click(screen.getByRole('button', { name: 'Submit vote' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not submit your vote. Please try again.',
    );
    expect(rankedTexts()).toEqual(['1PizzaRank 1 of 3', '2SaladRank 2 of 3', '3SushiRank 3 of 3']);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('voted_poll_ids')).toBeNull();

    submitBallotMock.mockResolvedValue({
      id: 'ballot-1',
      pollId: 'poll-1',
      createdAt: '2026-08-11T10:00:00.000Z',
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(navigateMock).toHaveBeenCalledWith('/poll/poll-1/results', {
      replace: true,
      state: { justVoted: true },
    });
  });

  it('reports a missing poll instead of the form', async () => {
    getPollMock.mockRejectedValue(new ApiError(404, 'Poll poll-1 not found'));
    renderForm();

    expect(await screen.findByRole('alert')).toHaveTextContent('This poll does not exist.');
    expect(screen.queryByRole('button', { name: 'Submit vote' })).not.toBeInTheDocument();
  });
});
