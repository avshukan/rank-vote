import { Navigate, useParams } from 'react-router-dom';
import { BallotForm } from '../features/vote/BallotForm';
import { readVotedPollIds } from '../shared/lib/voted-polls';

/** Target of the shareable link: rank the options and cast a ballot. */
export function VotePage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <p>Poll not found.</p>
      </main>
    );
  }

  // Soft duplicate-vote protection (docs/06-decisions.md): a browser that has
  // already voted goes straight to the results, so the form is never shown and
  // the poll is never fetched. Bypassable by clearing storage — by design.
  if (readVotedPollIds().includes(id)) {
    return <Navigate to={`/poll/${id}/results`} replace />;
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      {/* Keyed by id so navigating between polls starts from a clean form. */}
      <BallotForm key={id} pollId={id} />
    </main>
  );
}
