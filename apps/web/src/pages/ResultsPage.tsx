import { useLocation, useParams } from 'react-router-dom';
import { ResultsView } from '../features/results/ResultsView';
import { NotFoundPage } from './NotFoundPage';

interface ResultsLocationState {
  justVoted?: boolean;
}

/** Landing page after a vote, and the target of a shared results link. */
export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation() as { state: ResultsLocationState | null };

  if (!id) {
    return <NotFoundPage />;
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      {state?.justVoted && (
        <p
          role="status"
          className="mb-4 rounded border border-green-300 bg-green-50 px-3 py-2 text-green-800"
        >
          Vote submitted
        </p>
      )}
      {/* Keyed by id so switching polls refetches instead of showing stale results. */}
      <ResultsView key={id} pollId={id} />
    </main>
  );
}
