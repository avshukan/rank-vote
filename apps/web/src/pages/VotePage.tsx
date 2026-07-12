import { useParams } from 'react-router-dom';

/**
 * Placeholder target for the shareable link. The full drag-and-drop voting
 * experience lands in a later slice; for now the route resolves cleanly.
 */
export function VotePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Vote</h1>
      <p>
        Voting for poll <code>{id}</code> is coming soon.
      </p>
    </main>
  );
}
