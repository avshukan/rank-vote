import { Link } from 'react-router-dom';

interface NotFoundProps {
  /** Headline — override it when a specific thing is missing, not the route. */
  title?: string;
  /** One line under the headline explaining what went wrong. */
  description?: string;
}

/**
 * The single "there is nothing here" surface. Rendered on its own by
 * `NotFoundPage` for the catch-all route, and inline by flows that discover a
 * missing entity mid-page (the vote flow) — those already own a `<main>`, so
 * this piece deliberately contributes no landmark of its own.
 */
export function NotFound({
  title = 'Page not found',
  description = 'This link does not lead anywhere.',
}: NotFoundProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-gray-600">{description}</p>
      <Link to="/" className="rounded bg-blue-600 px-4 py-2 font-medium text-white">
        Create a poll
      </Link>
    </div>
  );
}
