import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFound } from './NotFound';

const renderNotFound = (props?: { title?: string; description?: string }) =>
  render(
    <MemoryRouter>
      <NotFound {...props} />
    </MemoryRouter>,
  );

describe('NotFound', () => {
  it('falls back to the generic route copy', () => {
    renderNotFound();

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('This link does not lead anywhere.')).toBeInTheDocument();
  });

  it('shows the copy a caller passes for a specific missing thing', () => {
    renderNotFound({ title: 'Poll not found', description: 'This poll does not exist.' });

    expect(screen.getByRole('heading', { name: 'Poll not found' })).toBeInTheDocument();
    expect(screen.getByText('This poll does not exist.')).toBeInTheDocument();
  });

  it('always offers a way back to poll creation', () => {
    renderNotFound();

    expect(screen.getByRole('link', { name: 'Create a poll' })).toHaveAttribute('href', '/');
  });
});
