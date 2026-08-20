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
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
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
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
