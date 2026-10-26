import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PollOptionDto } from '@rank-vote/shared';

// After a cancelled drag the row is no longer dragged while dnd-kit's default
// sortable transition (200 ms ease) animates it back, so it must stay above the
// resting rows until that return ends, yet below a row whose drag starts
// meanwhile. Three layers: the dragged row is z-20, the rest z-0, and on the way
// down `steps(1, jump-both)` holds z-index at the midpoint, 10, for the 200 ms.
// The entry joins the inline transition dnd-kit sets. A transition runs with the
// after-change style, so the entry is left out while the drag is active — there
// it would hold back the raise itself.
const LOWER_AFTER_RETURN = 'z-index 200ms steps(1, jump-both)';

interface SortableOptionProps {
  option: PollOptionDto;
  rank: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/**
 * One row of the ranking list: dragged by its text with a mouse, the keyboard,
 * or a touch after a press and hold, and reorderable with the ↑/↓ buttons.
 */
export function SortableOption({ option, rank, total, onMoveUp, onMoveDown }: SortableOptionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });

  return (
    <li
      ref={setNodeRef}
      // Translate only: dnd-kit also scales the dragged row to the size of the
      // row under it, which stretches or squashes rows of different heights.
      style={{
        transform: CSS.Translate.toString(transform),
        transition: isDragging
          ? transition
          : [transition, LOWER_AFTER_RETURN].filter(Boolean).join(', '),
      }}
      // During a drag every row carries a transform, so rows paint in DOM
      // order and a row dragged downward slides under the rows after it
      // (#118); z-20 raises the dragged row above the rest. No `position`
      // needed: the rows are flex items of the ranking list.
      className={`flex items-center gap-3 rounded border border-gray-300 bg-white px-3 py-2 ${
        isDragging ? 'z-20 opacity-60 shadow-lg' : 'z-0'
      }`}
    >
      <span aria-hidden="true" className="w-6 shrink-0 text-center font-semibold text-gray-500">
        {rank}
      </span>
      {/* Not touch-none: a swipe over the text must scroll the page. The touch
          sensor's hold delay is what tells a drag apart from a swipe. */}
      <span
        {...attributes}
        {...listeners}
        className="flex-1 cursor-grab touch-manipulation select-none wrap-anywhere"
      >
        {option.text}
      </span>
      <span className="sr-only">{`Rank ${rank} of ${total}`}</span>
      <button
        type="button"
        onClick={onMoveUp}
        disabled={rank === 1}
        aria-label={`Move ${option.text} up`}
        className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={rank === total}
        aria-label={`Move ${option.text} down`}
        className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
      >
        ↓
      </button>
    </li>
  );
}
