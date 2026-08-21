import { useState } from 'react';

interface ShareLinkProps {
  /** Absolute URL to hand out. */
  url: string;
  /** Input label — name what the link points at, for screen readers. */
  label?: string;
}

/**
 * The single "here is the link, take it" control: the URL stays visible and
 * selectable so a failed or unavailable clipboard never traps the user. Used
 * after creating a poll (#2) and by the zero-ballot results state (#5).
 */
export function ShareLink({ url, label = 'Shareable poll link' }: ShareLinkProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  // `navigator.clipboard` only exists in a secure context, so the app opened
  // over plain http on a LAN IP — how a poll gets shown around a room — has
  // none at all, and even where it exists `writeText` rejects without focus or
  // permission. Both cases must say so: a "Copied" over an untouched clipboard
  // sends the user off to paste nothing.
  async function copy() {
    try {
      if (!navigator.clipboard) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={url}
          aria-label={label}
          className="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white"
        >
          {status === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      {status === 'failed' && (
        <p role="alert" className="text-sm text-gray-600">
          Could not reach the clipboard — select the link above and copy it by hand.
        </p>
      )}
    </div>
  );
}
