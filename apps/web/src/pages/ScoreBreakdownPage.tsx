import { useParams } from 'react-router-dom';
import { ScoreBreakdownView } from '../features/results/ScoreBreakdownView';
import { NotFoundPage } from './NotFoundPage';

/** One option's score, broken down by place. Public, like the results page. */
export function ScoreBreakdownPage() {
  const { id, optionId } = useParams<{ id: string; optionId: string }>();

  if (!id || !optionId) {
    return <NotFoundPage />;
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      {/* Keyed by poll so switching polls refetches instead of showing stale results. */}
      <ScoreBreakdownView key={id} pollId={id} optionId={optionId} />
    </main>
  );
}
