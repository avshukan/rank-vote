import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PollOptionDto } from '@rank-vote/shared';

interface SortableOptionProps {
  option: PollOptionDto;
  rank: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/**
 * One row of the ranking list: draggable by pointer, and reorderable with the
 * ↑/↓ buttons — which are the primary control on touch devices.
 */
export function SortableOption({ option, rank, total, onMoveUp, onMoveDown }: SortableOptionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded border border-gray-300 bg-white px-3 py-2 ${
        isDragging ? 'opacity-60 shadow-lg' : ''
      }`}
    >
      <span aria-hidden="true" className="w-6 shrink-0 text-center font-semibold text-gray-500">
        {rank}
      </span>
      <span {...attributes} {...listeners} className="flex-1 cursor-grab touch-none select-none">
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
