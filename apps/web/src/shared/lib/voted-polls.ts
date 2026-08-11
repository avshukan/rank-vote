// Soft, client-side duplicate-vote protection (docs/06-decisions.md).
// Bypassable by clearing browser storage — acceptable for the MVP.

const STORAGE_KEY = 'voted_poll_ids';

/** Reads the ids of polls this browser has already voted in. */
export function readVotedPollIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // Unavailable or corrupted storage must never block voting.
    return [];
  }
}

/** Records a poll as voted in. Storage failures are ignored by design. */
export function markPollAsVoted(pollId: string): void {
  const ids = readVotedPollIds();
  if (ids.includes(pollId)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, pollId]));
  } catch {
    // Private mode or a full quota: the vote itself already succeeded.
  }
}
