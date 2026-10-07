import { render, screen } from '@testing-library/react';
import { CountingMethod } from '@rank-vote/shared';
import App from './App';
import { getResults } from './shared/api/polls';

vi.mock('./shared/api/polls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shared/api/polls')>();
  return { ...actual, getResults: vi.fn() };
});

/** App mounts a BrowserRouter, so the URL is set on the jsdom history. */
const openPath = (path: string) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

describe('App', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders the create-poll page at the root route', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /create a ranked poll/i })).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown route', () => {
    openPath('/no-such-place');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a poll' })).toBeInTheDocument();
  });

  it('renders the not-found page for a malformed poll URL', () => {
    openPath('/poll/poll-1/results/extra');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('renders the not-found page for a breakdown URL without an option', () => {
    openPath('/poll/poll-1/results/options');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('renders an option score breakdown at its results sub-route', async () => {
    const sushi = {
      optionId: 'o1',
      text: 'Sushi',
      score: 1,
      breakdown: [
        { place: 1, points: 1, ballots: 1, subtotal: 1 },
        { place: 2, points: 0, ballots: 0, subtotal: 0 },
      ],
    };
    vi.mocked(getResults).mockResolvedValue({
      pollId: 'poll-1',
      title: 'Lunch?',
      method: CountingMethod.BORDA,
      winners: [sushi],
      scores: [sushi],
      totalBallots: 1,
    });

    openPath('/poll/poll-1/results/options/o1');

    expect(await screen.findByRole('heading', { name: 'Sushi' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(getResults).toHaveBeenCalledWith('poll-1');
  });
});
