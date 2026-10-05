import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { inlineCode } from './backlog-promotion.mjs';
import {
  PERIODIC_DAYS,
  SKILL_PATH,
  TRACKER_LABEL,
  findTrackers,
  normalizeReason,
  periodicCheck,
  reasonMarker,
  requestComment,
  run,
} from './backlog-sweep.mjs';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REPOSITORY = 'avshukan/rank-vote';
const NOW = new Date('2026-10-05T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const BOT = { login: 'github-actions[bot]', type: 'Bot' };

const daysAgo = (days) => new Date(NOW.getTime() - days * DAY_MS).toISOString();
const httpError = (status, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });

function tracker(overrides = {}) {
  return {
    number: 80,
    state: 'open',
    labels: [{ name: TRACKER_LABEL }],
    html_url: `https://github.com/${REPOSITORY}/issues/80`,
    created_at: daysAgo(200),
    closed_at: null,
    ...overrides,
  };
}

function botComment(reason, createdAt) {
  return {
    user: BOT,
    body: requestComment({ reason, source: 'x', runUrl: 'https://github.com/run' }),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

// An in-memory GitHub REST API that records every request. A list route
// returns only its first page to `request`; `paginate` returns every page.
function fakeGitHub({
  issues = [],
  labelExists = false,
  events = {},
  comments = {},
  failures = {},
} = {}) {
  const state = {
    issues: structuredClone(issues),
    events: structuredClone(events),
    comments: structuredClone(comments),
    labels: labelExists ? [TRACKER_LABEL] : [],
    calls: [],
  };
  const hasLabel = (issue, name) => issue.labels.some((label) => label.name === name);
  const issue = (number) => state.issues.find((item) => item.number === number);
  const routes = {
    'GET /repos/{owner}/{repo}/issues': (params) =>
      state.issues
        .filter((item) => hasLabel(item, params.labels))
        .filter(
          (item) => (params.state ?? 'open') === 'all' || item.state === (params.state ?? 'open'),
        ),
    'GET /repos/{owner}/{repo}/labels/{name}': (params) => {
      if (!state.labels.includes(params.name)) throw httpError(404);
      return { name: params.name };
    },
    'POST /repos/{owner}/{repo}/labels': (params) => {
      state.labels.push(params.name);
      return { name: params.name };
    },
    'POST /repos/{owner}/{repo}/issues': (params) => {
      const created = tracker({
        number: 90,
        html_url: `https://github.com/${REPOSITORY}/issues/90`,
        created_at: NOW.toISOString(),
        title: params.title,
        body: params.body,
        labels: params.labels.map((name) => ({ name })),
      });
      state.issues.push(created);
      return created;
    },
    'PATCH /repos/{owner}/{repo}/issues/{issue_number}': (params) => {
      Object.assign(issue(params.issue_number), { state: params.state, closed_at: null });
      (state.events[params.issue_number] ??= []).push({
        event: 'reopened',
        created_at: NOW.toISOString(),
      });
      return issue(params.issue_number);
    },
    'GET /repos/{owner}/{repo}/issues/{issue_number}/events': (params) =>
      state.events[params.issue_number] ?? [],
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments': (params) =>
      (state.comments[params.issue_number] ?? []).filter(
        (comment) => !params.since || Date.parse(comment.updated_at) >= Date.parse(params.since),
      ),
    'POST /repos/{owner}/{repo}/issues/{issue_number}/comments': (params) => {
      const comment = { user: BOT, body: params.body, created_at: NOW.toISOString() };
      comment.updated_at = comment.created_at;
      (state.comments[params.issue_number] ??= []).push(comment);
      return comment;
    },
  };
  async function all(route, params = {}) {
    state.calls.push({ route, params });
    if (failures[route]) throw failures[route];
    if (!routes[route]) throw new Error(`unexpected request: ${route}`);
    return routes[route](params);
  }
  return {
    request: async (route, params) => {
      const data = await all(route, params);
      return { data: Array.isArray(data) ? data.slice(0, params?.per_page ?? 30) : data };
    },
    paginate: async (route, params) => all(route, params),
    state,
    writes: () =>
      state.calls
        .filter(({ route }) => !route.startsWith('GET '))
        .map(({ route }) => route.split(' ')[0] + ' ' + route.split('{repo}')[1]),
    posted: (number) =>
      (state.comments[number] ?? []).filter((comment) => comment.created_at === NOW.toISOString()),
  };
}

function fakeCore() {
  const core = { failed: null, notices: [], summaryText: '' };
  core.setFailed = (message) => (core.failed = message);
  core.notice = (message) => core.notices.push(message);
  core.info = () => {};
  core.summary = {
    addRaw(text) {
      core.summaryText += text;
      return this;
    },
    async write() {},
  };
  return core;
}

function context(eventName, inputs) {
  return {
    repo: { owner: 'avshukan', repo: 'rank-vote' },
    serverUrl: 'https://github.com',
    runId: 99,
    actor: 'avshukan',
    eventName,
    payload: inputs ? { inputs } : {},
  };
}

async function request(github, reason = 'release v0.2.0 at ' + 'a'.repeat(40)) {
  const core = fakeCore();
  const result = await run({
    github,
    context: context('workflow_dispatch', { reason }),
    core,
    now: NOW,
  });
  return { result, core };
}

async function weekly(github) {
  const core = fakeCore();
  const result = await run({ github, context: context('schedule'), core, now: NOW });
  return { result, core };
}

// ---------------------------------------------------------------------------
// Finding the tracker

test('tracker lookup covers open and closed Issues, skips pull requests and pages', async () => {
  const pulls = Array.from({ length: 100 }, (_, index) =>
    tracker({ number: index + 1, pull_request: {} }),
  );
  const closed = tracker({ number: 150, state: 'closed', closed_at: daysAgo(3) });
  const github = fakeGitHub({ issues: [...pulls, closed] });

  const found = await findTrackers(github, 'avshukan', 'rank-vote');
  assert.deepEqual(
    found.map((issue) => issue.number),
    [150],
  );
  assert.equal(github.state.calls[0].params.state, 'all');

  const { result } = await request(github);
  assert.equal(result.outcome, 'reopened');
  assert.equal(result.tracker.number, 150);
});

test('more than one tracker changes nothing and names every Issue and the recovery', async () => {
  for (const send of [request, weekly]) {
    const github = fakeGitHub({
      issues: [
        tracker({ number: 5 }),
        tracker({ number: 9, state: 'closed', closed_at: daysAgo(90) }),
      ],
    });
    const { result, core } = await send(github);

    assert.equal(result.outcome, 'refused');
    assert.deepEqual(github.writes(), []);
    assert.match(
      core.failed,
      /2 Issues carry the `backlog-sweep` label: #5 \(open\), #9 \(closed\)/,
    );
    assert.match(
      core.summaryText,
      /Remove the `backlog-sweep` label from all but the one tracker to keep/,
    );
  }
});

// ---------------------------------------------------------------------------
// Explicit requests

test('the first request creates the label, then the tracker, and records the reason', async () => {
  const github = fakeGitHub();
  const { result, core } = await request(github, 'initial backlog sweep');

  assert.equal(result.outcome, 'created');
  assert.deepEqual(github.writes(), [
    'POST /labels',
    'POST /issues',
    'POST /issues/{issue_number}/comments',
  ]);
  const label = github.state.calls.find(({ route }) =>
    route.startsWith('POST /repos/{owner}/{repo}/labels'),
  );
  assert.equal(label.params.name, TRACKER_LABEL);
  const created = github.state.issues.find((issue) => issue.number === 90);
  assert.deepEqual(created.labels, [{ name: TRACKER_LABEL }]);
  assert.equal(created.title, 'Backlog sweep tracker');
  assert.match(
    created.body,
    new RegExp(`https://github.com/${REPOSITORY}/blob/HEAD/${SKILL_PATH}`),
  );
  assert.match(created.body, /\*\*Open:\*\* a sweep is requested/);
  assert.match(created.body, /\*\*Closed:\*\* no sweep is pending/);
  assert.match(created.body, /The repository owner closes this Issue/);
  assert.doesNotMatch(created.body, /still needed|Type and Level|Ready pool/i);
  const [comment] = github.posted(90);
  assert.match(comment.body, /\*\*Reason:\*\* `initial backlog sweep`/);
  assert.match(comment.body, /\*\*Source:\*\* manual request by `avshukan`/);
  assert.match(
    comment.body,
    /\[Backlog sweep request run\]\(https:\/\/github.com\/avshukan\/rank-vote\/actions\/runs\/99\)/,
  );
  assert.equal(core.failed, null);
});

test('an existing label is reused', async () => {
  const github = fakeGitHub({ labelExists: true });
  await request(github);

  assert.deepEqual(github.writes(), ['POST /issues', 'POST /issues/{issue_number}/comments']);
});

test('a closed tracker is reopened before the reason is recorded', async () => {
  const github = fakeGitHub({
    issues: [tracker({ state: 'closed', closed_at: daysAgo(5) })],
    labelExists: true,
  });
  const { result } = await request(github);

  assert.equal(result.outcome, 'reopened');
  assert.deepEqual(github.writes(), [
    'PATCH /issues/{issue_number}',
    'POST /issues/{issue_number}/comments',
  ]);
  assert.equal(
    github.state.calls.find(({ route }) => route.startsWith('PATCH')).params.state,
    'open',
  );
  assert.equal(github.state.issues[0].state, 'open');
  assert.equal(github.posted(80).length, 1);
});

test('an open tracker stays open and records the reason', async () => {
  const github = fakeGitHub({ issues: [tracker()], labelExists: true });
  const { result } = await request(github, 'Ready pool: picked ID-19; 1 Ready left');

  assert.equal(result.outcome, 'recorded');
  assert.deepEqual(github.writes(), ['POST /issues/{issue_number}/comments']);
  assert.match(github.posted(80)[0].body, /`Ready pool: picked ID-19; 1 Ready left`/);
});

test('a retried request records its reason once', async () => {
  const github = fakeGitHub({
    issues: [tracker({ state: 'closed', closed_at: daysAgo(5) })],
    labelExists: true,
  });
  const first = await request(github);
  const second = await request(github);
  const respaced = await request(github, '  release   v0.2.0 at ' + 'a'.repeat(40) + '\n');

  assert.equal(first.result.outcome, 'reopened');
  assert.equal(second.result.outcome, 'already-recorded');
  assert.equal(respaced.result.outcome, 'already-recorded');
  assert.equal(github.posted(80).length, 1);
  assert.equal(second.core.failed, null);
  assert.match(second.core.summaryText, /already records this reason since it was last opened/);
});

test('only a request comment from the current opening counts as already recorded', async () => {
  const reason = 'release v0.2.0 at ' + 'a'.repeat(40);
  const reopened = daysAgo(2);
  const cases = [
    ['before the last reopening', botComment(reason, daysAgo(10)), 'recorded'],
    [
      'before the last reopening, edited after it',
      { ...botComment(reason, daysAgo(10)), updated_at: daysAgo(1) },
      'recorded',
    ],
    [
      'from a person',
      { ...botComment(reason, daysAgo(1)), user: { login: 'avshukan', type: 'User' } },
      'recorded',
    ],
    [
      'from another bot',
      { ...botComment(reason, daysAgo(1)), user: { login: 'other-app[bot]', type: 'Bot' } },
      'recorded',
    ],
    ['for another reason', botComment('initial backlog sweep', daysAgo(1)), 'recorded'],
    ['after the last reopening', botComment(reason, daysAgo(1)), 'already-recorded'],
  ];
  for (const [name, comment, expected] of cases) {
    const github = fakeGitHub({
      issues: [tracker()],
      labelExists: true,
      events: {
        80: [
          { event: 'closed', created_at: daysAgo(20) },
          { event: 'reopened', created_at: reopened },
        ],
      },
      comments: { 80: [comment] },
    });
    const { result } = await request(github, reason);
    assert.equal(result.outcome, expected, name);
  }
});

test('a tracker that was never reopened counts comments since its creation', async () => {
  const reason = 'initial backlog sweep';
  const github = fakeGitHub({
    issues: [tracker({ created_at: daysAgo(3) })],
    labelExists: true,
    comments: { 80: [botComment(reason, daysAgo(3))] },
  });
  const { result } = await request(github, reason);

  assert.equal(result.outcome, 'already-recorded');
});

test('the reason is untrusted text: inline code, and only its digest in the marker', () => {
  const reason = 'Closes #1 `x` @someone --> <script>';
  const body = requestComment({ reason, source: 'x', runUrl: 'https://github.com/run' });

  assert.ok(body.includes(`**Reason:** ${inlineCode(reason)}`));
  assert.match(body, /^<!-- backlog-sweep-request: [0-9a-f]{64} -->$/m);
  assert.equal(body.split(reason).length, 2, 'the reason appears once, inside the code span');
  assert.equal(reasonMarker(normalizeReason(' a\n b ')), reasonMarker('a b'));
});

test('an empty reason is refused before any request', async () => {
  const github = fakeGitHub();
  const { result, core } = await request(github, ' \n ');

  assert.equal(result.outcome, 'invalid');
  assert.deepEqual(github.state.calls, []);
  assert.match(core.failed, /The `reason` input is empty/);
});

// ---------------------------------------------------------------------------
// The weekly periodic check

test('the periodic check measures from the last closing', () => {
  const closed = (days) => tracker({ state: 'closed', closed_at: daysAgo(days) });

  assert.deepEqual(periodicCheck(null, NOW), { kind: 'no-tracker' });
  assert.deepEqual(periodicCheck(tracker(), NOW), { kind: 'pending' });
  assert.equal(periodicCheck(closed(PERIODIC_DAYS - 1), NOW).kind, 'not-due');
  assert.equal(periodicCheck(closed(PERIODIC_DAYS - 1), NOW).dueOn, '2026-10-06');
  assert.deepEqual(periodicCheck(closed(PERIODIC_DAYS), NOW), {
    kind: 'due',
    closedOn: '2026-08-06',
    reason: 'periodic check: the last sweep closed on 2026-08-06, 60+ days ago',
  });
});

test('a due periodic check reopens the tracker with a reason that names the closing date', async () => {
  const github = fakeGitHub({
    issues: [tracker({ state: 'closed', closed_at: daysAgo(64) })],
    labelExists: true,
  });
  const { result } = await weekly(github);

  assert.equal(result.outcome, 'reopened');
  assert.deepEqual(github.writes(), [
    'PATCH /issues/{issue_number}',
    'POST /issues/{issue_number}/comments',
  ]);
  const [comment] = github.posted(80);
  assert.match(
    comment.body,
    /`periodic check: the last sweep closed on 2026-08-02, 60\+ days ago`/,
  );
  assert.match(comment.body, /\*\*Source:\*\* weekly periodic check/);

  const again = await weekly(github);
  assert.equal(again.result.outcome, 'pending');
  assert.equal(github.posted(80).length, 1);
});

for (const [name, issues, outcome, summary] of [
  ['no tracker', [], 'no-tracker', /No tracker exists yet.*nothing was requested/],
  ['an open tracker', [tracker()], 'pending', /a sweep is already requested, so nothing was added/],
  [
    'a tracker closed less than 60 days ago',
    [tracker({ state: 'closed', closed_at: daysAgo(30) })],
    'not-due',
    /was closed on 2026-09-05; the periodic check is due on 2026-11-04/,
  ],
]) {
  test(`the periodic check does nothing with ${name}`, async () => {
    const github = fakeGitHub({ issues });
    const { result, core } = await weekly(github);

    assert.equal(result.outcome, outcome);
    assert.deepEqual(github.writes(), []);
    assert.match(core.summaryText, summary);
    assert.equal(core.failed, null);
  });
}

// ---------------------------------------------------------------------------
// Failures and the workflow

test('an unexpected API error fails the run without writing', async () => {
  const github = fakeGitHub({
    failures: { 'GET /repos/{owner}/{repo}/issues': httpError(502, 'Bad Gateway') },
  });
  const { result, core } = await request(github);

  assert.equal(result.outcome, 'refused');
  assert.deepEqual(github.writes(), []);
  assert.match(core.failed, /Unexpected error: `Bad Gateway`/);
  assert.match(core.summaryText, /Re-run the failed jobs of this workflow run/);
});

test('any other event is refused', async () => {
  const core = fakeCore();
  const github = fakeGitHub();
  const result = await run({ github, context: context('push'), core, now: NOW });

  assert.equal(result.outcome, 'invalid');
  assert.deepEqual(github.state.calls, []);
  assert.match(core.failed, /Unsupported event `push`/);
});

test('the workflow only dispatches and schedules, with least privilege', () => {
  const workflow = readFileSync(
    join(repositoryRoot, '.github/workflows/backlog-sweep.yml'),
    'utf8',
  );
  const triggers = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));

  assert.match(triggers, /^ {2}workflow_dispatch:$/m);
  assert.match(triggers, /^ {6}reason:\n(?: {8}.*\n)*? {8}required: true$/m);
  assert.match(triggers, /^ {2}schedule:$/m);
  assert.doesNotMatch(triggers, /^ {2}(push|pull_request|issues|release|create|workflow_run):/m);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /^ {6}queue: max$/m);
  assert.doesNotMatch(workflow, /inputs\.reason|github\.event\.inputs/);
  assert.doesNotMatch(workflow, /^ {4}cancel-in-progress: true/m);
  for (const [, ref] of workflow.matchAll(/uses: [\w-]+\/[\w-]+@(\S+)/g)) {
    assert.match(ref, /^[0-9a-f]{40}$/);
  }
});
