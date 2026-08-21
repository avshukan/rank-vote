import { useEffect, useState } from 'react';
import type { PollResultsResponseDto } from '@rank-vote/shared';
import { ApiError } from '../../shared/api/client';
import { getResults } from '../../shared/api/polls';
import { NotFound } from '../../shared/ui/NotFound';
import { ShareLink } from '../../shared/ui/ShareLink';
import { positionLabels } from './positions';

/**
 * The finished poll: who won and by how much. Readable by anyone holding the
 * link — viewing results never requires having voted.
 */
export function ResultsView({ pollId }: { pollId: string }) {
  const [results, setResults] = useState<PollResultsResponseDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getResults(pollId)
      .then((loaded) => {
        if (!active) return;
        setResults(loaded);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setMissing(true);
          return;
        }
        setLoadError('Could not load the results.');
      });
    return () => {
      active = false;
    };
  }, [pollId, reloadKey]);

  // Same split as the vote flow: a 404 is final and gets the shared not-found
  // surface, everything else keeps a retry.
  if (missing) {
    return <NotFound title="Poll not found" description="This poll does not exist." />;
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-red-600">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadError(null);
            setReloadKey((key) => key + 1);
          }}
          className="rounded border border-gray-300 px-3 py-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!results) {
    return <p>Loading results…</p>;
  }

  const { title, winners, scores, totalBallots } = results;
  const positions = positionLabels(scores);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{title}</h1>

      {totalBallots === 0 ? (
        // Every option sits at score 0 here, so the table would be an empty
        // state pretending to be data — the share link is the useful next step.
        <div className="flex flex-col gap-3">
          <p className="text-lg font-medium">No votes yet</p>
          <p className="text-gray-600">Share the link so people can vote:</p>
          <ShareLink url={`${window.location.origin}/poll/${pollId}`} label="Vote link" />
        </div>
      ) : (
        <>
          <div className="rounded border border-green-300 bg-green-50 px-4 py-3">
            <p className="text-sm font-medium text-green-800">
              {winners.length === 1 ? 'Winner' : 'Tied winners'}
            </p>
            <ul className="flex flex-col gap-1">
              {winners.map((winner) => (
                <li key={winner.optionId} className="text-xl font-bold text-green-900">
                  {winner.text}
                </li>
              ))}
            </ul>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-300">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Position
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Option
                </th>
                <th scope="col" className="py-2 font-medium">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score, row) => (
                <tr key={score.optionId} className="border-b border-gray-200">
                  <td className="py-2 pr-4 tabular-nums">{positions[row]}</td>
                  <td className="py-2 pr-4">{score.text}</td>
                  <td className="py-2 tabular-nums">{score.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="text-gray-600">
        {totalBallots === 1 ? '1 ballot counted' : `${totalBallots} ballots counted`}
      </p>
    </div>
  );
}
