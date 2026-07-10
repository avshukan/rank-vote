import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App', () => {
  it('renders the starter heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Get started' })).toBeInTheDocument();
  });

  it('increments the counter on click', async () => {
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole('button', { name: /count is 0/i });
    await user.click(button);
    expect(button).toHaveTextContent('Count is 1');
  });
});
