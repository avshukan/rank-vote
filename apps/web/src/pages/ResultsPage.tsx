import { useLocation, useParams } from 'react-router-dom';

interface ResultsLocationState {
  justVoted?: boolean;
}

/**
 * Landing page after a vote. The winner and score table arrive with backlog
 * items #4 (Borda count) and #5 (Show results); for now the route resolves and
 * confirms the submitted ballot.
 */
export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation() as { state: ResultsLocationState | null };

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
      <h1 className="mb-4 text-2xl font-bold">Results</h1>
      <p>
        Results for poll <code>{id}</code> are coming soon.
      </p>
    </main>
  );
}
