import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { PollOptionDto, PollResponseDto } from '@rank-vote/shared';
import { ApiError } from '../../shared/api/client';
import { submitBallot } from '../../shared/api/ballots';
import { getPoll } from '../../shared/api/polls';
import { markPollAsVoted } from '../../shared/lib/voted-polls';
import { NotFound } from '../../shared/ui/NotFound';
import { SortableOption } from './SortableOption';

/**
 * The voting form: ranks every option of a poll (strict full ranking) and
 * submits it. The list starts in the poll's own option order, so a ballot is
 * always complete and the submit button never needs to be disabled.
 */
export function BallotForm({ pollId }: { pollId: string }) {
  const navigate = useNavigate();
  const [poll, setPoll] = useState<PollResponseDto | null>(null);
  const [ranking, setRanking] = useState<PollOptionDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getPoll(pollId)
      .then((loaded) => {
        if (!active) return;
        setPoll(loaded);
        setRanking(loaded.options);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setMissing(true);
          return;
        }
        setLoadError('Could not load the poll.');
      });
    return () => {
      active = false;
    };
  }, [pollId, reloadKey]);

  const sensors = useSensors(
    // A small distance threshold keeps taps on the ↑/↓ buttons from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const move = useCallback((from: number, to: number) => {
    setRanking((current) =>
      to < 0 || to >= current.length ? current : arrayMove(current, from, to),
    );
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRanking((current) => {
      const from = current.findIndex((option) => option.id === active.id);
      const to = current.findIndex((option) => option.id === over.id);
      return from === -1 || to === -1 ? current : arrayMove(current, from, to);
    });
  }

  /** Turns the displayed order into ballot entries: position 0 is rank 1. */
  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitBallot(pollId, {
        entries: ranking.map((option, index) => ({
          optionId: option.id,
          rank: index + 1,
        })),
      });
      markPollAsVoted(pollId);
      navigate(`/poll/${pollId}/results`, {
        replace: true,
        state: { justVoted: true },
      });
    } catch (cause) {
      // The ranking is left untouched so the voter can retry without redoing it.
      setSubmitError(
        cause instanceof ApiError ? cause.message : 'Could not submit your vote. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // A 404 is final, so it gets the shared not-found surface rather than the
  // retry affordance below — there is nothing to retry.
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

  if (!poll) {
    return <p>Loading poll…</p>;
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-6"
    >
      <h1 className="text-2xl font-bold">{poll.title}</h1>
      <p className="text-gray-600">
        Rank every option from best (1) to worst — drag a row, or use the ↑/↓ buttons.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={ranking.map((option) => option.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol aria-label="Your ranking" className="flex flex-col gap-2">
            {ranking.map((option, index) => (
              <SortableOption
                key={option.id}
                option={option}
                rank={index + 1}
                total={ranking.length}
                onMoveUp={() => move(index, index - 1)}
                onMoveDown={() => move(index, index + 1)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {submitError && (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-red-600">
            {submitError}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded border border-gray-300 px-3 py-2 disabled:opacity-40"
          >
            Retry
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {submitting ? 'Submitting…' : 'Submit vote'}
      </button>
    </form>
  );
}
