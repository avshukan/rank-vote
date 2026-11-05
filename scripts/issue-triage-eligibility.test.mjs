import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { findTriageComments } from './backlog-promotion.mjs';
import { MANUAL_DISPATCH_TRIAGE, manualDispatchComment } from './fixtures/triage-comments.mjs';
import { issueText, run, targetIssue } from './issue-triage-eligibility.mjs';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(repositoryRoot, path), 'utf8');
const SOURCE = read('.github/workflows/issue-triage.md');
const LOCK = read('.github/workflows/issue-triage.lock.yml');

const REPOSITORY = 'avshukan/rank-vote';
const ISSUE_ROUTE = 'GET /repos/{owner}/{repo}/issues/{issue_number}';
const PERMISSION_ROUTE = 'GET /repos/{owner}/{repo}/collaborators/{username}/permission';
const COMMENTS_ROUTE = 'GET /repos/{owner}/{repo}/issues/{issue_number}/comments';

// The same comment from an automatic run: its footer names the opened Issue.
const AUTOMATIC_TRIAGE = MANUAL_DISPATCH_TRIAGE.replace(
  '/actions/runs/37012345678) ·',
  '/actions/runs/37012345678) for #62 ·',
);

const httpError = (status, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });

// An in-memory GitHub REST API that records every request. `comments` is the
// live comment list, so a test can post to it between runs.
function fakeGitHub({ issue = {}, permission = 'write', comments = [], failures = {} } = {}) {
  const calls = [];
  async function request(route, params = {}) {
    calls.push({ route, params });
    if (failures[route]) throw failures[route];
    if (route === ISSUE_ROUTE) {
      return {
        data: {
          number: params.issue_number,
          state: 'open',
          title: 'Short poll links',
          body: 'Poll links are long UUIDs.',
          user: { login: 'avshukan', type: 'User' },
          repository_url: `https://api.github.com/repos/${REPOSITORY}`,
          ...issue,
        },
      };
    }
    if (route === PERMISSION_ROUTE) {
      if (permission === null) throw httpError(404);
      return { data: { permission, user: { login: params.username } } };
    }
    if (route === COMMENTS_ROUTE) return { data: comments };
    throw new Error(`unexpected request: ${route}`);
  }
  return {
    request,
    paginate: async (route, params) => (await request(route, params)).data,
    calls,
    comments,
  };
}

function fakeCore() {
  const core = { outputs: {}, notices: [], failed: null, summaryText: '' };
  core.setOutput = (name, value) => (core.outputs[name] = value);
  core.notice = (message) => core.notices.push(message);
  core.setFailed = (message) => (core.failed = message);
  core.summary = {
    addRaw(text) {
      core.summaryText += text;
      return this;
    },
    async write() {},
  };
  return core;
}

const repo = { owner: 'avshukan', repo: 'rank-vote' };
const automatic = (number = 62) => ({ eventName: 'issues', repo, payload: { issue: { number } } });
// gh-aw adds an `aw_context` input with an empty default to the dispatch form.
const dispatch = (inputs) => ({
  eventName: 'workflow_dispatch',
  repo,
  payload: { inputs: { aw_context: '', ...inputs } },
});

const sanitized = [];
const sanitize = (text) => {
  sanitized.push(text);
  return `[sanitized] ${text}`;
};

async function guard(github, context) {
  sanitized.length = 0;
  const core = fakeCore();
  const result = await run({ github, context, core, sanitize });
  return { result, core };
}

const onlyReads = (github) => github.calls.every(({ route }) => route.startsWith('GET '));

// ---------------------------------------------------------------------------
// Eligible Issues on both triggers

test('an automatic run activates the agent and keeps gh-aw’s own event text', async () => {
  const github = fakeGitHub();
  const { result, core } = await guard(github, automatic());

  assert.equal(result.outcome, 'eligible');
  assert.deepEqual(core.outputs, { eligible: 'true', issue_number: '62', issue_text: '' });
  assert.deepEqual(sanitized, []);
  assert.deepEqual(
    github.calls.map(({ route, params }) => [route, params.issue_number ?? params.username]),
    [
      [ISSUE_ROUTE, 62],
      [PERMISSION_ROUTE, 'avshukan'],
      [COMMENTS_ROUTE, 62],
    ],
  );
  assert.equal(core.failed, null);
  assert.match(core.notices.join('\n'), /Issue #62 is eligible/);
});

test('a manual run hands the agent the selected Issue’s current, sanitized text', async () => {
  const github = fakeGitHub({
    issue: { title: 'Short poll links (edited)', body: 'Current body, edited after opening.' },
  });
  const { result, core } = await guard(github, dispatch({ issue_number: '62' }));

  assert.equal(result.outcome, 'eligible');
  assert.equal(github.calls[0].params.issue_number, 62);
  assert.deepEqual(sanitized, ['Short poll links (edited)\n\nCurrent body, edited after opening.']);
  assert.deepEqual(core.outputs, {
    eligible: 'true',
    issue_number: '62',
    issue_text: '[sanitized] Short poll links (edited)\n\nCurrent body, edited after opening.',
  });
  assert.equal(core.failed, null);
});

test('the Issue text is built like gh-aw builds an issues event: title, blank line, body', () => {
  assert.equal(issueText({ title: 'Title', body: 'Body' }), 'Title\n\nBody');
  assert.equal(issueText({ title: 'Title', body: null }), 'Title\n\n');
});

test('a manual run without a sanitizer fails closed', async () => {
  const core = fakeCore();
  const result = await run({
    github: fakeGitHub(),
    context: dispatch({ issue_number: '62' }),
    core,
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(core.outputs.eligible, 'false');
  assert.equal(core.outputs.issue_text, '');
  assert.match(core.failed, /no sanitizer/);
});

test('write, maintain and admin authors are eligible; maintain reports as write', async () => {
  for (const permission of ['admin', 'write']) {
    const { result } = await guard(fakeGitHub({ permission }), dispatch({ issue_number: '62' }));
    assert.equal(result.outcome, 'eligible', permission);
  }
});

// ---------------------------------------------------------------------------
// Invalid input and ineligible Issues

const invalidNumbers = [
  undefined,
  '',
  'abc',
  '0',
  '-1',
  '07',
  '1.5',
  '1e3',
  ' 62',
  '62 ',
  '62abc',
  '99999999999999999999',
];

for (const issueNumber of invalidNumbers) {
  test(`issue_number ${JSON.stringify(issueNumber)} stops before any API call`, async () => {
    const github = fakeGitHub();
    const { result, core } = await guard(github, dispatch({ issue_number: issueNumber }));

    assert.equal(result.outcome, 'refused');
    assert.deepEqual(github.calls, []);
    assert.deepEqual(core.outputs, { eligible: 'false', issue_number: '', issue_text: '' });
    assert.match(
      core.failed,
      /`issue_number` must be a positive whole number without leading zeros/,
    );
    assert.match(core.failed, /Copilot was not invoked and nothing was posted/);
  });
}

test('a number-typed input is accepted as its canonical digits', () => {
  assert.deepEqual(targetIssue(dispatch({ issue_number: 62 })), { number: 62 });
  assert.equal(targetIssue(dispatch({ issue_number: 1.5 })).eligible, false);
});

test('a manual run takes issue_number alone; aw_context must stay empty', async () => {
  const github = fakeGitHub();
  const context = dispatch({
    issue_number: '62',
    aw_context: JSON.stringify({ item_type: 'issue', item_number: '7' }),
  });
  const { result, core } = await guard(github, context);

  assert.equal(result.outcome, 'refused');
  assert.deepEqual(github.calls, []);
  assert.equal(core.outputs.eligible, 'false');
  assert.match(core.failed, /Manual triage takes only `issue_number`; leave `aw_context` empty/);
});

test('other events never activate the agent', async () => {
  const github = fakeGitHub();
  const { result, core } = await guard(github, { eventName: 'issue_comment', repo, payload: {} });

  assert.equal(result.outcome, 'refused');
  assert.deepEqual(github.calls, []);
  assert.equal(core.outputs.eligible, 'false');
});

// Each: [name, fake GitHub options, expected reason]
const ineligible = [
  [
    'a nonexistent Issue',
    { failures: { [ISSUE_ROUTE]: httpError(404) } },
    /Issue #62 does not exist in avshukan\/rank-vote or is not accessible\./,
  ],
  [
    'a deleted Issue',
    { failures: { [ISSUE_ROUTE]: httpError(410) } },
    /Issue #62 does not exist in avshukan\/rank-vote or is not accessible\./,
  ],
  [
    'an Issue transferred to another repository',
    { issue: { number: 7, repository_url: 'https://api.github.com/repos/someone/elsewhere' } },
    /Issue #62 is no longer an Issue of avshukan\/rank-vote\./,
  ],
  ['a pull request', { issue: { pull_request: { url: 'x' } } }, /#62 is a pull request/],
  ['a closed Issue', { issue: { state: 'closed' } }, /Issue #62 is closed; only open Issues/],
  [
    'an Issue by an outside author',
    { issue: { user: { login: 'outsider', type: 'User' } }, permission: 'read' },
    /opened by `outsider`, who has `read` access; only Issues opened by someone with write, maintain or admin access/,
  ],
  [
    'an Issue by a triage-role author',
    { issue: { user: { login: 'helper', type: 'User' } }, permission: 'read' },
    /opened by `helper`, who has `read` access/,
  ],
  [
    'an Issue by a non-collaborator',
    { issue: { user: { login: 'stranger', type: 'User' } }, permission: null },
    /opened by `stranger`, who has `none` access/,
  ],
  [
    'an Issue by a bot',
    { issue: { user: { login: 'dependabot[bot]', type: 'Bot' } } },
    /opened by `dependabot\[bot\]`, a Bot account/,
  ],
  [
    'an Issue of a deleted account (ghost)',
    { issue: { user: { login: 'ghost', type: 'User' } }, permission: null },
    /opened by `ghost`, who has `none` access/,
  ],
  ['an Issue without an author', { issue: { user: null } }, /has no author account/],
];

for (const [name, options, reason] of ineligible) {
  test(`a manual run refuses ${name} without activating the agent`, async () => {
    const github = fakeGitHub(options);
    const { result, core } = await guard(github, dispatch({ issue_number: '62' }));

    assert.equal(result.outcome, 'refused');
    assert.equal(core.outputs.eligible, 'false');
    assert.equal(core.outputs.issue_text, '');
    assert.deepEqual(sanitized, []);
    assert.ok(onlyReads(github));
    assert.ok(!github.calls.some(({ route }) => route === COMMENTS_ROUTE));
    assert.match(core.failed, reason);
    assert.match(core.summaryText, reason);
  });
}

test('an automatic run skips an ineligible Issue with a notice, not a failure', async () => {
  const github = fakeGitHub({
    issue: { user: { login: 'outsider', type: 'User' } },
    permission: 'read',
  });
  const { result, core } = await guard(github, automatic());

  assert.equal(result.outcome, 'refused');
  assert.equal(core.outputs.eligible, 'false');
  assert.equal(core.failed, null);
  assert.match(core.notices.join('\n'), /who has `read` access/);
});

for (const [name, context] of [
  ['a manual run', dispatch({ issue_number: '62' })],
  ['an automatic run', automatic()],
]) {
  test(`an API error fails ${name} without activating the agent`, async () => {
    for (const failures of [
      { [ISSUE_ROUTE]: httpError(403, 'API rate limit exceeded') },
      { [PERMISSION_ROUTE]: httpError(500, 'Server Error') },
      { [COMMENTS_ROUTE]: httpError(502, 'Bad Gateway') },
    ]) {
      const github = fakeGitHub({ failures });
      const { result, core } = await guard(github, context);

      assert.equal(result.outcome, 'refused');
      assert.equal(core.outputs.eligible, 'false');
      assert.match(core.failed, /The eligibility check failed: `[^`]+`\./);
      assert.ok(onlyReads(github));
    }
  });
}

// ---------------------------------------------------------------------------
// Existing recommendations, repeats and concurrency

for (const [name, body] of [
  ['an automatic', AUTOMATIC_TRIAGE],
  ['a manual-dispatch', MANUAL_DISPATCH_TRIAGE],
]) {
  for (const [trigger, context] of [
    ['manual', dispatch({ issue_number: '62' })],
    ['automatic', automatic()],
  ]) {
    test(`a ${trigger} run stops on an Issue that has ${name} recommendation`, async () => {
      const comment = manualDispatchComment({ body });
      const github = fakeGitHub({ comments: [comment] });
      const { result, core } = await guard(github, context);

      assert.equal(result.outcome, 'triaged');
      assert.deepEqual(core.outputs, { eligible: 'false', issue_number: '62', issue_text: '' });
      assert.equal(core.failed, null);
      assert.match(core.notices.join('\n'), /already has a triage recommendation/);
      assert.ok(core.notices.join('\n').includes(comment.html_url));
      assert.deepEqual(sanitized, []);
    });
  }
}

test('a recommendation means exactly what backlog promotion recognizes', async () => {
  const genuine = manualDispatchComment();
  const candidates = [
    genuine,
    { ...genuine, user: { login: 'avshukan', type: 'User' } },
    { ...genuine, user: { login: 'github-actions[bot]', type: 'User' } },
    { ...genuine, body: genuine.body.replace(/<!-- gh-aw-workflow-call-id[^>]*>/, '') },
    { ...genuine, body: genuine.body.replace(/<!-- gh-aw-agentic-workflow[^>]*>/, '') },
    { ...genuine, body: genuine.body.replaceAll('issue-triage', 'other-workflow') },
    { ...genuine, body: `> quoted\n\n${genuine.body}` },
    { ...genuine, body: '### Backlog promotion failed\n\nReason' },
  ];
  for (const comment of candidates) {
    const recognized = findTriageComments([comment], REPOSITORY).length > 0;
    const { result } = await guard(
      fakeGitHub({ comments: [comment] }),
      dispatch({ issue_number: '62' }),
    );
    assert.equal(result.outcome, recognized ? 'triaged' : 'eligible');
  }
});

test('repeated runs for one Issue, serialized by its queue, post one recommendation', async () => {
  // The workflow's per-Issue concurrency group runs these one after another:
  // the first eligible run posts, and every later one finds that comment.
  const github = fakeGitHub();
  const first = await guard(github, dispatch({ issue_number: '62' }));
  assert.equal(first.result.outcome, 'eligible');
  github.comments.push(manualDispatchComment());

  for (const context of [
    dispatch({ issue_number: '62' }),
    automatic(),
    dispatch({ issue_number: '62' }),
  ]) {
    const { result, core } = await guard(github, context);
    assert.equal(result.outcome, 'triaged');
    assert.equal(core.outputs.eligible, 'false');
  }
  assert.equal(findTriageComments(github.comments, REPOSITORY).length, 1);
});

// ---------------------------------------------------------------------------
// The workflow wiring: .github/workflows/issue-triage.md and its compiled lock

const [, FRONTMATTER, BODY] = SOURCE.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

// The lines of a top-level key, or of a job under `jobs:`, in the lock file.
function lockBlock(name, { job = false } = {}) {
  const lines = LOCK.split('\n');
  const from = job ? lines.indexOf('jobs:') : 0;
  const start = lines.indexOf(job ? `  ${name}:` : `${name}:`, from);
  assert.notEqual(start, -1, `${name} is missing from the lock file`);
  const ends = job ? /^ {0,2}\S/ : /^\S/;
  let end = start + 1;
  while (end < lines.length && !ends.test(lines[end])) end += 1;
  return lines.slice(start, end).join('\n').trimEnd();
}

const lockJobs = () => {
  const jobs = LOCK.slice(LOCK.indexOf('\njobs:\n'));
  return [...jobs.matchAll(/^ {2}(\w+):$/gm)].map(([, name]) => name);
};

const ISSUE_KEY = 'github.event.issue.number || github.event.inputs.issue_number';

test('the workflow keeps issues.opened and adds a dispatch with a required issue_number', () => {
  const on = lockBlock('on');
  assert.match(on, /^ {2}issues:\n {4}types:\n {6}- opened$/m);
  assert.match(
    on,
    /^ {6}issue_number:\n {8}description: .+\n {8}required: true\n {8}type: number$/m,
  );
});

test('automatic and manual runs for one Issue share one queue', () => {
  assert.equal(
    lockBlock('concurrency'),
    `concurrency:\n  group: gh-aw-\${{ github.workflow }}-\${{ ${ISSUE_KEY} || github.run_id }}\n  queue: max`,
  );
  assert.ok(
    lockBlock('conclusion', { job: true }).includes(
      `group: "gh-aw-conclusion-issue-triage-\${{ ${ISSUE_KEY} || github.run_id }}"`,
    ),
  );
});

test('the guard runs before activation and gates the agent', () => {
  const preActivation = lockBlock('pre_activation', { job: true });
  assert.match(preActivation, /^ {6}eligible: \$\{\{ steps\.eligibility\.outputs\.eligible \}\}$/m);
  assert.match(preActivation, /^ {8}id: eligibility$/m);
  assert.match(preActivation, /sanitize_incoming_text\.cjs/);
  assert.match(preActivation, /scripts\/issue-triage-eligibility\.mjs/);
  assert.match(preActivation, /^ {4}permissions:\n {6}contents: read\n {6}issues: read$/m);

  assert.match(
    lockBlock('activation', { job: true }),
    /^ {4}if: needs\.pre_activation\.outputs\.activated == 'true' && \(needs\.pre_activation\.outputs\.eligible == 'true'\)$/m,
  );
  assert.match(lockBlock('agent', { job: true }), /^ {4}needs: activation$/m);
  assert.match(lockBlock('safe_outputs', { job: true }), /needs\.agent\.result != 'skipped'/);
});

test('the one comment goes to the opened Issue or the guarded dispatch input', () => {
  assert.ok(FRONTMATTER.includes(`\n    target: \${{ ${ISSUE_KEY} }}\n`));
  const target = `\\"target\\":\\"\${{ ${ISSUE_KEY} }}\\"`;
  for (const [job, variable] of [
    ['agent', 'GH_AW_SAFE_OUTPUTS_CONFIG'],
    ['safe_outputs', 'GH_AW_SAFE_OUTPUTS_HANDLER_CONFIG'],
  ]) {
    const line = lockBlock(job, { job: true })
      .split('\n')
      .find((text) => text.trimStart().startsWith(`${variable}:`));
    assert.ok(
      line?.includes(`\\"add_comment\\":{\\"discussions\\":false,\\"max\\":1,${target}}`),
      job,
    );
  }
  assert.ok(!LOCK.includes('\\"target\\":\\"*\\"'));
  assert.ok(!LOCK.includes('\\"target\\":\\"triggering\\"'));
});

test('the prompt names the target Issue on both triggers, also for duplicate search', () => {
  assert.match(BODY, /^Issue #\$\{\{ needs\.pre_activation\.outputs\.issue_number \}\}:$/m);
  assert.match(
    BODY,
    /Ignore\n {3}Issue #\$\{\{ needs\.pre_activation\.outputs\.issue_number \}\} itself\./,
  );
  assert.ok(!BODY.includes('github.event.issue.number'));
  // gh-aw's event text on issues events, the guard's text on a dispatch.
  assert.match(
    BODY,
    /^\$\{\{ steps\.sanitized\.outputs\.text \}\}\n\$\{\{ needs\.pre_activation\.outputs\.issue_text \}\}$/m,
  );
  // One recommendation format for both triggers.
  assert.equal(BODY.match(/^## Comment format$/gm).length, 1);
  assert.equal(BODY.match(/^## Triage recommendation$/gm).length, 1);
});

test('triage stays recommendation-only on the Copilot engine and the pinned compiler', () => {
  assert.match(FRONTMATTER, /^engine: copilot$/m);
  assert.match(FRONTMATTER, /^ {2}threat-detection:\n {4}continue-on-error: false$/m);
  assert.match(FRONTMATTER, /^permissions:\n {2}contents: read\n {2}issues: read$/m);
  // Only gh-aw's own safe-output and conclusion jobs can write, and only to Issues.
  const writes = lockJobs().flatMap((job) =>
    [...lockBlock(job, { job: true }).matchAll(/^ {6}(\S+): write$/gm)].map(
      ([, scope]) => `${job}: ${scope}`,
    ),
  );
  assert.deepEqual(writes, ['conclusion: issues', 'safe_outputs: issues']);
  assert.equal(LOCK.match(/: write$/gm).length, writes.length);
  assert.match(LOCK, /^permissions: \{\}$/m);

  const manifest = JSON.parse(LOCK.match(/^# gh-aw-manifest: (.+)$/m)[1]);
  const safeOutputs = manifest.mcp_servers.find((server) => server.name === 'safeoutputs');
  assert.deepEqual(safeOutputs.tools, ['add_comment', 'missing_data', 'missing_tool', 'noop']);

  const metadata = JSON.parse(LOCK.match(/^# gh-aw-metadata: (.+)$/m)[1]);
  const pinned = JSON.parse(read('.github/aw/actions-lock.json')).entries;
  const setup = Object.values(pinned).find((entry) => entry.repo === 'github/gh-aw-actions/setup');
  assert.equal(metadata.compiler_version, setup.version);
});
