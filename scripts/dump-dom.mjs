#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { basename, isAbsolute, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const BROWSER_FILENAMES = new Set([
  'chrome',
  'chrome.exe',
  'chrome-headless-shell',
  'chrome-headless-shell.exe',
  'chromium',
  'chromium.exe',
  'headless_shell',
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function playwrightExecutables(root, maxDepth = 4) {
  if (!root || !existsSync(root)) return [];

  const matches = [];
  const pending = [{ directory: root, depth: 0 }];

  while (pending.length > 0) {
    const { directory, depth } = pending.pop();
    let entries;

    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isFile() && BROWSER_FILENAMES.has(entry.name)) matches.push(path);
      if (entry.isDirectory() && depth < maxDepth) {
        pending.push({ directory: path, depth: depth + 1 });
      }
    }
  }

  return matches.sort().reverse();
}

export function browserCandidates({
  environment = process.env,
  operatingSystem = platform(),
  userHome = homedir(),
} = {}) {
  const candidates = [environment.BROWSER_BIN];
  const cacheRoots = [
    join(userHome, 'Library', 'Caches', 'ms-playwright'),
    join(userHome, '.cache', 'ms-playwright'),
    environment.LOCALAPPDATA && join(environment.LOCALAPPDATA, 'ms-playwright'),
  ];

  for (const root of cacheRoots) candidates.push(...playwrightExecutables(root));

  if (operatingSystem === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  }

  if (operatingSystem === 'win32') {
    for (const root of [environment.PROGRAMFILES, environment['PROGRAMFILES(X86)']]) {
      if (!root) continue;
      candidates.push(
        join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      );
    }
  }

  candidates.push(
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'chrome',
    'msedge',
  );

  return unique(candidates);
}

function browserIsAvailable(candidate) {
  if (isAbsolute(candidate) || candidate.includes(sep)) {
    try {
      accessSync(candidate, platform() === 'win32' ? constants.F_OK : constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  const result = spawnSync(candidate, ['--version'], {
    stdio: 'ignore',
    timeout: 3000,
  });
  return !result.error && result.status === 0;
}

export function resolveBrowser(candidates, probe = browserIsAvailable) {
  const browser = candidates.find((candidate) => probe(candidate));
  if (browser) return browser;

  throw new Error(
    'No Chromium-compatible browser found. Install Chromium or set BROWSER_BIN to its executable.',
  );
}

export function localUrl(rawUrl) {
  if (!rawUrl) throw new Error('A local URL is required.');

  const url = new URL(rawUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!['http:', 'https:'].includes(url.protocol) || !localHosts.has(url.hostname)) {
    throw new Error(`Only localhost URLs are allowed, received: ${rawUrl}`);
  }

  return url.toString();
}

export function browserArguments(url, profileDirectory) {
  return [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--virtual-time-budget=6000',
    `--user-data-dir=${profileDirectory}`,
    '--dump-dom',
    url,
  ];
}

export function dumpDom(rawUrl) {
  const url = localUrl(rawUrl);
  const browser = resolveBrowser(browserCandidates());
  const profileDirectory = mkdtempSync(join(tmpdir(), 'rank-vote-browser-'));

  try {
    const result = spawnSync(browser, browserArguments(url, profileDirectory), {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30000,
    });

    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${basename(browser)} exited with status ${result.status}`);
    }
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    dumpDom(process.argv[2]);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
