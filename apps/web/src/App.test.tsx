import { render, screen } from '@testing-library/react';
import App from './App';

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
});
