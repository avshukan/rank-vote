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
  // jsdom has no layout. The ranking rows get boxes stacked in DOM order with a
  // 10 px gap, 40 px tall unless a test sets `rowHeights`, so a drag can end
  // over a particular row: row 0 is centred on y = 20, row 2 on y = 120.
  let rowHeights: number[];

  beforeEach(() => {
    getPollMock.mockReset().mockResolvedValue(POLL);
    rowHeights = [40, 40, 40];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const row = this.closest('li');
      const index = row?.parentElement ? [...row.parentElement.children].indexOf(row) : -1;
      const [top, height] =
        index === -1
          ? [0, 0]
          : [
              rowHeights.slice(0, index).reduce((sum, above) => sum + above + 10, 0),
              rowHeights[index],
            ];
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

  it('drags a row at its own height over taller and shorter rows', async () => {
    // Long text wraps onto more lines: Pizza spans y = 0–40, Sushi 50–130 and
    // Salad 140–260.
    rowHeights = [40, 80, 120];
    await renderLoaded();
    const sushi = screen.getByText('Sushi');
    const row = sushi.closest('li');

    touch(sushi, 'touchstart', 90);
    act(() => vi.advanceTimersByTime(250));
    touch(sushi, 'touchmove', 20);
    const overPizza = row?.style.transform;
    touch(sushi, 'touchmove', 200);
    const overSalad = row?.style.transform;
    touch(sushi, 'touchend', 200);

    // dnd-kit scales the dragged row to the row under it, to ½ over Pizza and
    // 1½ over Salad; the row must only follow the finger. Checked after the
    // drop, so a failure cannot leave a drag running into the next test.
    expect([overPizza, overSalad]).toEqual([
      'translate3d(0px, -70px, 0)',
      'translate3d(0px, 110px, 0)',
    ]);
    expect(rankedTexts()).toEqual(['1PizzaRank 1 of 3', '2SaladRank 2 of 3', '3SushiRank 3 of 3']);
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

  it('raises only the dragged row, lowering it only after the return of a cancel', async () => {
    await renderLoaded();
    const pizza = screen.getByText('Pizza');
    const rows = screen.getAllByRole('listitem');

    fireEvent.mouseDown(pizza, { clientX: 150, clientY: 20 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 30 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 120 });

    expect(rows.map((row) => row.classList.contains('z-20'))).toEqual([true, false, false]);
    expect(rows.map((row) => row.classList.contains('z-0'))).toEqual([false, true, true]);
    expect(rows[0]).toHaveClass('opacity-60', 'shadow-lg');
    // No z-index entry in the dragged row's transition: it would hold back
    // the raise itself at the start of the next drag.
    expect(rows[0].style.transition).not.toContain('z-index');

    // Escape cancels the drag. The row is no longer dragged while dnd-kit's
    // 200 ms sortable transition brings it back, so z-index must step down
    // from 20 to 0 only after that long, holding 10 meanwhile. jsdom runs no
    // CSS transitions, so it observes the declared transition; the paint
    // order is the PR's browser check.
    fireEvent.keyDown(document, { code: 'Escape' });
    expect(rows[0]).not.toHaveClass('opacity-60');
    expect(rows[0]).toHaveClass('z-0');
    expect(rows[0].style.transition).toContain('transform 200ms ease');
    expect(rows[0].style.transition).toContain('z-index 200ms steps(1, jump-both)');
    expect(rankedTexts()).toEqual(['1PizzaRank 1 of 3', '2SushiRank 2 of 3', '3SaladRank 3 of 3']);
  });

  it('raises a new drag above a row still returning from a cancel', async () => {
    await renderLoaded();
    const rows = screen.getAllByRole('listitem');

    // Sushi is dragged down over Salad and cancelled, then Pizza, above it in
    // the DOM, is picked up within the 200 ms of Sushi's return. With equal
    // layers the later row in the DOM paints on top and would hide Pizza.
    fireEvent.mouseDown(screen.getByText('Sushi'), { clientX: 150, clientY: 70 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 80 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 120 });
    fireEvent.keyDown(document, { code: 'Escape' });
    act(() => vi.advanceTimersByTime(80));

    fireEvent.mouseDown(screen.getByText('Pizza'), { clientX: 150, clientY: 20 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 30 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 70 });
    const [pizza, sushi] = rows.map((row) => ({
      layer: row.className.match(/\bz-\d+\b/)?.[0],
      transition: row.style.transition,
    }));
    fireEvent.keyDown(document, { code: 'Escape' });

    // The new drag is z-20 at once, with no transition holding it back. The
    // returning row is z-0 on a stepped transition from 20, which holds the
    // midpoint, 10: above the resting rows, below the new drag. Checked after
    // the cancel, so a failure cannot leave a drag running into the next test.
    expect(pizza.layer).toBe('z-20');
    expect(pizza.transition).not.toContain('z-index');
    expect(sushi.layer).toBe('z-0');
    expect(sushi.transition).toContain('z-index 200ms steps(1, jump-both)');
  });
});
