import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareLink } from './ShareLink';

const URL = 'http://localhost:3000/poll/poll-1';

describe('ShareLink', () => {
  it('shows the URL in a read-only field so it can always be selected by hand', () => {
    render(<ShareLink url={URL} />);

    const field = screen.getByLabelText('Shareable poll link');
    expect(field).toHaveValue(URL);
    expect(field).toHaveAttribute('readonly');
  });

  it('copies the URL and confirms it on the button', async () => {
    const user = userEvent.setup();
    render(<ShareLink url={URL} />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await navigator.clipboard.readText()).toBe(URL);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('lets a caller name what the link points at', () => {
    render(<ShareLink url={URL} label="Vote link" />);

    expect(screen.getByLabelText('Vote link')).toHaveValue(URL);
  });
});
