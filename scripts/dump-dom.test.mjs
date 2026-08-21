import assert from 'node:assert/strict';
import test from 'node:test';

import { browserArguments, browserCandidates, localUrl, resolveBrowser } from './dump-dom.mjs';

test('BROWSER_BIN takes precedence over discovered browsers', () => {
  const candidates = browserCandidates({
    environment: { BROWSER_BIN: '/custom/chromium' },
    operatingSystem: 'linux',
    userHome: '/missing-home',
  });

  assert.equal(candidates[0], '/custom/chromium');
});

test('resolveBrowser returns the first available candidate', () => {
  const browser = resolveBrowser(['missing', 'available', 'later'], (candidate) => {
    return candidate === 'available';
  });

  assert.equal(browser, 'available');
});

test('localUrl allows loopback URLs and rejects external targets', () => {
  assert.equal(localUrl('http://localhost:5173/poll/123'), 'http://localhost:5173/poll/123');
  assert.equal(localUrl('http://127.0.0.1:5173/'), 'http://127.0.0.1:5173/');
  assert.throws(() => localUrl('https://example.com'), /Only localhost URLs/);
});

test('browserArguments isolates the profile and waits for rendered DOM', () => {
  const args = browserArguments('http://localhost:5173/', '/tmp/profile');

  assert.ok(args.includes('--dump-dom'));
  assert.ok(args.includes('--virtual-time-budget=6000'));
  assert.ok(args.includes('--user-data-dir=/tmp/profile'));
  assert.equal(args.at(-1), 'http://localhost:5173/');
});
