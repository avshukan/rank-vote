import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the create-poll page at the root route', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /create a ranked poll/i })).toBeInTheDocument();
  });
});
