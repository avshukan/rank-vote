import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('shows the not-found surface for a missing poll, with no retry', async () => {
    getPollMock.mockRejectedValue(new ApiError(404, 'Poll poll-1 not found'));
    renderForm();

    expect(await screen.findByRole('heading', { name: 'Poll not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a poll' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit vote' })).not.toBeInTheDocument();
  });

  it('keeps the retry affordance for a load failure that is not a 404', async () => {
    getPollMock.mockRejectedValue(new ApiError(500, 'boom'));
    renderForm();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the poll.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

/**
 * Dispatches a one-finger touch event at height y; only vertical movement
 * matters to the ranking. jsdom has `TouchEvent` but no `Touch`, so the touch
 * point is attached as a plain object.
 */
function touch(target: Element, type: 'touchstart' | 'touchmove' | 'touchend', y: number) {
  const point = { identifier: 0, target, clientX: 150, clientY: y };
  const event = new TouchEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: type === 'touchend' ? [] : [point] },
    changedTouches: { value: [point] },
  });
  fireEvent(target, event);
  return event;
}

describe('BallotForm dragging', () => {
  // jsdom has no layout. Every ranking row gets a 40 px tall box, 50 px below
  // the previous one in DOM order, so a drag can end over a particular row:
  // row 0 is centred on y = 20, row 2 on y = 120.
  beforeEach(() => {
    getPollMock.mockReset().mockResolvedValue(POLL);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const row = this.closest('li');
      const index = row?.parentElement ? [...row.parentElement.children].indexOf(row) : -1;
      const [top, height] = index === -1 ? [0, 0] : [index * 50, 40];
      return {
        x: 0,
        y: top,
        left: 0,
        top,
        right: 300,
        bottom: top + height,
        width: 300,
        height,
      } as DOMRect;
    });
  });

  afterEach(() => {
    // After a drag, dnd-kit removes its click-swallowing document listener on a
    // timer. Run it, or that listener eats the clicks of the next test.
    if (vi.isFakeTimers()) act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Renders the form and switches to fake timers once the poll is shown. */
  async function renderLoaded() {
    renderForm();
    await screen.findByRole('heading', { name: 'Lunch?' });
    vi.useFakeTimers();
  }

  it('leaves a touch swipe over an option to scroll the page', async () => {
    await renderLoaded();
    const pizza = screen.getByText('Pizza');

    touch(pizza, 'touchstart', 20);
    const swipe = [40, 80, 120].map((y) => touch(pizza, 'touchmove', y));
    act(() => vi.advanceTimersByTime(1000));

    // No move was cancelled, so the browser scrolls, and holding still after
    // the swipe does not start a drag either.
    expect(swipe.map((move) => move.defaultPrevented)).toEqual([false, false, false]);
    expect(pizza).not.toHaveAttribute('aria-pressed');
    touch(pizza, 'touchend', 120);
    expect(rankedTexts()).toEqual(['1PizzaRank 1 of 3', '2SushiRank 2 of 3', '3SaladRank 3 of 3']);
  });

  it('starts a touch drag after a press and hold, and dropping it reorders', async () => {
    await renderLoaded();
    const pizza = screen.getByText('Pizza');

    touch(pizza, 'touchstart', 20);
    act(() => vi.advanceTimersByTime(249));
    expect(pizza).not.toHaveAttribute('aria-pressed');
    act(() => vi.advanceTimersByTime(1));
    expect(pizza).toHaveAttribute('aria-pressed', 'true');
    // Android raises the context menu on a long press; the drag cancels it.
    expect(fireEvent.contextMenu(pizza)).toBe(false);

    const drag = touch(pizza, 'touchmove', 120);
    touch(pizza, 'touchend', 120);

    // A drag in progress keeps the page still.
    expect(drag.defaultPrevented).toBe(true);
    expect(rankedTexts()).toEqual(['1SushiRank 1 of 3', '2SaladRank 2 of 3', '3PizzaRank 3 of 3']);
    expect(fireEvent.contextMenu(pizza)).toBe(true);
  });

  it('never starts a drag from a press on the ↑/↓ buttons', async () => {
    await renderLoaded();
    const moveUp = screen.getByRole('button', { name: 'Move Salad up' });

    touch(moveUp, 'touchstart', 120);
    act(() => vi.advanceTimersByTime(1000));
    touch(moveUp, 'touchend', 120);
    fireEvent.click(moveUp);

    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    expect(rankedTexts()).toEqual(['1PizzaRank 1 of 3', '2SaladRank 2 of 3', '3SushiRank 3 of 3']);
  });

  it('still drags with a mouse after 8 px of movement, with no hold', async () => {
    await renderLoaded();
    const pizza = screen.getByText('Pizza');

    fireEvent.mouseDown(pizza, { clientX: 150, clientY: 20 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 30 });
    expect(pizza).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseMove(document, { clientX: 150, clientY: 120 });
    fireEvent.mouseUp(document, { clientX: 150, clientY: 120 });

    expect(rankedTexts()).toEqual(['1SushiRank 1 of 3', '2SaladRank 2 of 3', '3PizzaRank 3 of 3']);
  });
});
