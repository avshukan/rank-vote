import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareLink } from './ShareLink';

const URL = 'http://localhost:3000/poll/poll-1';

/** Put back by the teardown of the test that takes the clipboard API away. */
let clipboard: PropertyDescriptor | undefined;

describe('ShareLink', () => {
  afterEach(() => {
    if (!clipboard) return;
    Object.defineProperty(navigator, 'clipboard', clipboard);
    clipboard = undefined;
  });

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

  it('points at the field instead of confirming when there is no clipboard', async () => {
    const user = userEvent.setup();
    // What a page served over plain http sees: no secure context, so the
    // browser exposes no clipboard at all. Overridden after `setup()`, which
    // installs a working stub of its own.
    clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard') ?? {
      value: undefined,
      configurable: true,
    };
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<ShareLink url={URL} />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('copy it by hand');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('lets a caller name what the link points at', () => {
    render(<ShareLink url={URL} label="Vote link" />);

    expect(screen.getByLabelText('Vote link')).toHaveValue(URL);
  });
});
