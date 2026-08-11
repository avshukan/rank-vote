import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PollResponseDto } from '@rank-vote/shared';
import { ResultsPage } from './ResultsPage';
import { VotePage } from './VotePage';
import { submitBallot } from '../shared/api/ballots';
import { getPoll } from '../shared/api/polls';

vi.mock('../shared/api/polls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/api/polls')>();
  return { ...actual, getPoll: vi.fn() };
});
vi.mock('../shared/api/ballots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/api/ballots')>();
  return { ...actual, submitBallot: vi.fn() };
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
  ],
};

/** The real routes involved in voting, so redirects are exercised for real. */
const openVotePage = () =>
  render(
    <MemoryRouter initialEntries={['/poll/poll-1']}>
      <Routes>
        <Route path="/poll/:id" element={<VotePage />} />
        <Route path="/poll/:id/results" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('VotePage duplicate-vote protection', () => {
  beforeEach(() => {
    getPollMock.mockReset().mockResolvedValue(POLL);
    submitBallotMock.mockReset().mockResolvedValue({
      id: 'ballot-1',
      pollId: 'poll-1',
      createdAt: '2026-08-11T10:00:00.000Z',
    });
    window.localStorage.clear();
  });

  it('shows the ballot form when this browser has not voted yet', async () => {
    openVotePage();

    expect(await screen.findByRole('button', { name: 'Submit vote' })).toBeInTheDocument();
  });

  it('redirects a poll listed in voted_poll_ids to the results, without loading the poll', async () => {
    window.localStorage.setItem('voted_poll_ids', '["poll-1"]');

    openVotePage();

    expect(await screen.findByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit vote' })).not.toBeInTheDocument();
    expect(getPollMock).not.toHaveBeenCalled();
  });

  it('blocks a second ballot after reopening the poll link', async () => {
    const user = userEvent.setup();
    const first = openVotePage();

    await user.click(await screen.findByRole('button', { name: 'Submit vote' }));
    expect(await screen.findByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Vote submitted');
    expect(submitBallotMock).toHaveBeenCalledTimes(1);

    // The voter reopens the shared link in the same browser.
    first.unmount();
    getPollMock.mockClear();
    openVotePage();

    expect(await screen.findByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit vote' })).not.toBeInTheDocument();
    expect(getPollMock).not.toHaveBeenCalled();
    expect(submitBallotMock).toHaveBeenCalledTimes(1);
  });

  it('still lets this browser vote in a different poll', async () => {
    window.localStorage.setItem('voted_poll_ids', '["another-poll"]');

    openVotePage();

    expect(await screen.findByRole('button', { name: 'Submit vote' })).toBeInTheDocument();
    expect(getPollMock).toHaveBeenCalledWith('poll-1');
  });
});
