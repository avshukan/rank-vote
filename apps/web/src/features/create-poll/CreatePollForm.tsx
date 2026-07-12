import { useState } from 'react';
import { MAX_OPTIONS, MIN_OPTIONS } from '@rank-vote/shared';
import type { PollResponseDto } from '@rank-vote/shared';
import { ApiError } from '../../shared/api/client';
import { createPoll } from '../../shared/api/polls';

const initialOptions = (): string[] => ['', ''];

export function CreatePollForm() {
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>(initialOptions);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PollResponseDto | null>(null);

  const trimmedOptions = options.map((option) => option.trim());
  const canSubmit =
    title.trim().length > 0 &&
    trimmedOptions.length >= MIN_OPTIONS &&
    trimmedOptions.every((option) => option.length > 0);

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? value : option)));
  }

  function addOption() {
    setOptions((current) => (current.length < MAX_OPTIONS ? [...current, ''] : current));
  }

  function removeOption(index: number) {
    setOptions((current) =>
      current.length > MIN_OPTIONS ? current.filter((_, i) => i !== index) : current,
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const poll = await createPoll({
        title: title.trim(),
        options: trimmedOptions,
      });
      setCreated(poll);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Could not create the poll. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return <PollCreated poll={created} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="poll-title" className="font-medium">
          Question
        </label>
        <input
          id="poll-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What should we decide?"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Options</legend>
        {options.map((option, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              value={option}
              aria-label={`Option ${index + 1}`}
              onChange={(event) => updateOption(index, event.target.value)}
              placeholder={`Option ${index + 1}`}
              className="flex-1 rounded border border-gray-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={() => removeOption(index)}
              disabled={options.length <= MIN_OPTIONS}
              aria-label={`Remove option ${index + 1}`}
              className="rounded border border-gray-300 px-3 disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addOption}
          disabled={options.length >= MAX_OPTIONS}
          className="self-start text-sm text-blue-600 disabled:opacity-40"
        >
          + Add option
        </button>
      </fieldset>

      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {submitting ? 'Creating…' : 'Create poll'}
      </button>
    </form>
  );
}

function PollCreated({ poll }: { poll: PollResponseDto }) {
  const shareUrl = `${window.location.origin}/poll/${poll.id}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Poll created 🎉</h2>
      <p>Share this link so people can vote:</p>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={shareUrl}
          aria-label="Shareable poll link"
          className="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
