import { useParams } from 'react-router-dom';
import { BallotForm } from '../features/vote/BallotForm';

/** Target of the shareable link: rank the options and cast a ballot. */
export function VotePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="mx-auto max-w-xl p-6">
      {/* Keyed by id so navigating between polls starts from a clean form. */}
      {id ? <BallotForm key={id} pollId={id} /> : <p>Poll not found.</p>}
    </main>
  );
}
