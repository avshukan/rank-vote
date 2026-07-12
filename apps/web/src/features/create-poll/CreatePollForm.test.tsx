import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PollResponseDto } from '@rank-vote/shared';
import { CreatePollForm } from './CreatePollForm';
import { createPoll } from '../../shared/api/polls';

vi.mock('../../shared/api/polls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/polls')>();
  return { ...actual, createPoll: vi.fn() };
});

const createPollMock = vi.mocked(createPoll);

describe('CreatePollForm', () => {
  beforeEach(() => {
    createPollMock.mockReset();
  });

  it('keeps submit disabled until a title and every option is filled', async () => {
    const user = userEvent.setup();
    render(<CreatePollForm />);

    const submit = screen.getByRole('button', { name: 'Create poll' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Question'), 'Lunch?');
    await user.type(screen.getByLabelText('Option 1'), 'Pizza');
    await user.type(screen.getByLabelText('Option 2'), 'Sushi');

    expect(submit).toBeEnabled();
  });

  it('enforces the 2–10 option bounds', async () => {
    const user = userEvent.setup();
    render(<CreatePollForm />);

    // Starts at the minimum of 2 options, so removal is disabled.
    expect(screen.getByRole('button', { name: 'Remove option 1' })).toBeDisabled();

    const addOption = screen.getByRole('button', { name: '+ Add option' });
    for (let count = 2; count < 10; count++) {
      await user.click(addOption);
    }

    expect(screen.getAllByLabelText(/^Option /)).toHaveLength(10);
    expect(addOption).toBeDisabled();
  });

  it('submits the trimmed poll and shows a shareable link', async () => {
    const poll: PollResponseDto = {
      id: 'poll-123',
      title: 'Lunch?',
      createdAt: new Date().toISOString(),
      options: [
        { id: 'o0', text: 'Pizza', order: 0 },
        { id: 'o1', text: 'Sushi', order: 1 },
      ],
    };
    createPollMock.mockResolvedValue(poll);
    const user = userEvent.setup();
    render(<CreatePollForm />);

    await user.type(screen.getByLabelText('Question'), '  Lunch?  ');
    await user.type(screen.getByLabelText('Option 1'), 'Pizza');
    await user.type(screen.getByLabelText('Option 2'), 'Sushi');
    await user.click(screen.getByRole('button', { name: 'Create poll' }));

    expect(createPollMock).toHaveBeenCalledWith({
      title: 'Lunch?',
      options: ['Pizza', 'Sushi'],
    });
    expect(await screen.findByDisplayValue(/\/poll\/poll-123$/)).toBeInTheDocument();
  });
});
