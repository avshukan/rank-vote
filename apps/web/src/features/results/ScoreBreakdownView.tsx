import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PollResultsResponseDto } from '@rank-vote/shared';
import { ApiError } from '../../shared/api/client';
import { getResults } from '../../shared/api/polls';
import { NotFound } from '../../shared/ui/NotFound';
import { ordinal, pointsLabel } from './format';

/**
 * How one option's score was built: per place, the points it is worth, how many
 * ballots put the option there and what that added up to. Every number comes
 * from the API's `breakdown` as is — the counting rule lives in the API.
 */
export function ScoreBreakdownView({ pollId, optionId }: { pollId: string; optionId: string }) {
  const [results, setResults] = useState<PollResultsResponseDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // The same load, 404 and retry handling as ResultsView; extracting it is ID-26.
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
        setLoadError('Could not load the score breakdown.');
      });
    return () => {
      active = false;
    };
  }, [pollId, reloadKey]);

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
    return <p>Loading score breakdown…</p>;
  }

  const option = results.scores.find((score) => score.optionId === optionId);
  if (!option) {
    return <NotFound title="Option not found" description="This poll has no such option." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/poll/${pollId}/results`}
        className="inline-flex min-h-6 items-center gap-1 self-start text-blue-600 underline"
      >
        <span aria-hidden="true">←</span>
        Back to results
      </Link>

      <div className="flex flex-col gap-1">
        <p className="text-gray-600 wrap-anywhere">{results.title}</p>
        <h1 className="text-2xl font-bold wrap-anywhere">{option.text}</h1>
      </div>

      {results.totalBallots === 0 ? (
        <p className="text-lg font-medium">No votes yet</p>
      ) : (
        <>
          <p className="text-gray-600">
            <span className="font-semibold text-gray-900">{pointsLabel(option.score)}</span> in
            total. Each ballot adds the points for the place it gave this option.
          </p>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-300">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Place
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Points
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Count
                </th>
                <th scope="col" className="py-2 font-medium">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {option.breakdown.map((row) => (
                <tr key={row.place} className="border-b border-gray-200">
                  <th scope="row" className="py-2 pr-4 font-normal tabular-nums">
                    {ordinal(row.place)}
                  </th>
                  <td className="py-2 pr-4 tabular-nums">{row.points}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.ballots}</td>
                  <td className="py-2 tabular-nums">{row.subtotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
