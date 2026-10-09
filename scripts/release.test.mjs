import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PRODUCTION_SSH,
  addRelease,
  ciProblem,
  compareVersions,
  environmentProblem,
  firstParentSubjects,
  hasRelease,
  highestVersion,
  isValidDate,
  parseVersion,
  prepare,
  releaseBranch,
  releaseOnVps,
  releaseVersions,
  remoteOutcome,
  requestSweep,
  sshArguments,
  topRelease,
  validate,
} from './release.mjs';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const CHANGELOG = readFileSync(join(repositoryRoot, 'CHANGELOG.md'), 'utf8');
const NOW = new Date('2026-10-12T09:30:00Z');
const PREVIOUS = '1'.repeat(40);
const MIDDLE = '2'.repeat(40);
const SIDE = '5'.repeat(40);
const HEAD = '3'.repeat(40);
const RELEASE = '4'.repeat(40);
const TAG_OBJECT = 'f'.repeat(40);
const RUN_URL = 'https://github.com/avshukan/rank-vote/actions/runs/99';

const httpError = (status, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });

const RELEASED_CHANGELOG = addRelease(CHANGELOG, 'v0.2.0', '2026-10-12', [
  'feat: explain score calculation (ID-19) (#86)',
]);

function commit(sha, parents, subject) {
  return {
    sha,
    parents: parents.map((parent) => ({ sha: parent })),
    commit: { message: `${subject}\n\nBody text.` },
  };
}

function ciRun(overrides = {}) {
  return {
    id: 12,
    head_sha: RELEASE,
    head_branch: 'main',
    event: 'push',
    conclusion: 'success',
    status: 'completed',
    path: '.github/workflows/ci.yml',
    html_url: 'https://github.com/avshukan/rank-vote/actions/runs/12',
    ...overrides,
  };
}

function ciJobs(overrides = {}) {
  return ['checks', 'containers'].map((name) => ({
    name,
    conclusion: 'success',
    head_sha: RELEASE,
    ...(overrides[name] ?? {}),
  }));
}

function prepPull(overrides = {}) {
  return {
    number: 95,
    state: 'closed',
    html_url: 'https://github.com/avshukan/rank-vote/pull/95',
    head: { ref: 'chore/release-v0.2.0' },
    base: { ref: 'main' },
    merged_at: '2026-10-12T10:00:00Z',
    merge_commit_sha: RELEASE,
    ...overrides,
  };
}

// The `production` Environment as docs/production.md sets it up.
function productionEnvironment(overrides = {}) {
  return {
    name: 'production',
    can_admins_bypass: false,
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    protection_rules: [
      {
        type: 'required_reviewers',
        prevent_self_review: false,
        reviewers: [{ type: 'User', reviewer: { login: 'avshukan' } }],
      },
      { type: 'branch_policy' },
    ],
    ...overrides,
  };
}

// An in-memory GitHub REST API that records every request.
function fakeGitHub(options = {}) {
  const state = {
    tags: ['v0.1.0', 'docs-snapshot'],
    tagRef: { type: 'tag', sha: TAG_OBJECT },
    tagTarget: { type: 'commit', sha: RELEASE },
    pulls: [],
    branches: ['main'],
    mainSha: HEAD,
    changelogs: { [HEAD]: CHANGELOG, [RELEASE]: RELEASED_CHANGELOG },
    rangeStatus: 'ahead',
    rangeCommits: [
      commit(MIDDLE, [PREVIOUS], 'feat: explain score calculation (ID-19) (#86)'),
      commit(SIDE, [PREVIOUS], 'wip: a commit inside a merged branch'),
      commit(HEAD, [MIDDLE, SIDE], 'docs: update ID-38 backlog note (#91)'),
    ],
    releaseStatus: 'identical',
    runs: [ciRun({ id: 11, conclusion: 'failure' }), ciRun()],
    jobs: ciJobs(),
    environment: productionEnvironment(),
    policies: [{ name: 'v*', type: 'tag' }],
    failures: {},
    calls: [],
    ...options,
  };
  const prefix = '/repos/{owner}/{repo}';
  const route = (method, path) => `${method} ${prefix}${path}`;

  async function request(name, params = {}) {
    state.calls.push({ route: name, params });
    if (state.failures[name]) throw state.failures[name];
    const [method] = name.split(' ');
    const path = name.slice(method.length + 1 + prefix.length);
    if (name === route('GET', '/git/matching-refs/tags/v')) {
      return { data: state.tags.map((tag) => ({ ref: `refs/tags/${tag}` })) };
    }
    if (name === route('GET', '/pulls')) {
      const [, branch] = params.head.split(':');
      return {
        data: state.pulls.filter(
          (pull) =>
            pull.head.ref === branch &&
            (params.state === 'all' || pull.state === params.state) &&
            (!params.base || pull.base.ref === params.base),
        ),
      };
    }
    if (method === 'GET' && path.startsWith('/git/ref/heads/')) {
      const branch = path.slice('/git/ref/heads/'.length);
      if (!state.branches.includes(branch)) throw httpError(404);
      return { data: { object: { sha: branch === 'main' ? state.mainSha : 'e'.repeat(40) } } };
    }
    if (method === 'GET' && path.startsWith('/git/ref/tags/')) {
      return { data: { object: state.tagRef } };
    }
    if (name === route('GET', '/git/tags/{tag_sha}')) {
      assert.equal(params.tag_sha, state.tagRef.sha);
      return { data: { object: state.tagTarget } };
    }
    if (name === route('GET', '/contents/CHANGELOG.md')) {
      const text = state.changelogs[params.ref];
      return { data: { content: Buffer.from(text).toString('base64'), sha: 'blob-sha' } };
    }
    if (name === route('GET', '/compare/{basehead}')) {
      if (params.basehead.endsWith('...main')) return { data: { status: state.releaseStatus } };
      const per = params.per_page;
      const start = (params.page - 1) * per;
      return {
        data: {
          status: state.rangeStatus,
          base_commit: { sha: PREVIOUS },
          total_commits: state.rangeCommits.length,
          commits: state.rangeCommits.slice(start, start + per),
        },
      };
    }
    if (name === route('GET', '/actions/workflows/{workflow_id}/runs')) {
      assert.deepEqual(
        [params.workflow_id, params.head_sha, params.branch, params.event],
        ['ci.yml', state.tagTarget.sha, 'main', 'push'],
      );
      return { data: { workflow_runs: state.runs } };
    }
    if (name === route('GET', '/actions/runs/{run_id}/jobs')) {
      return { data: { jobs: state.jobs.map((job) => ({ ...job, run_id: params.run_id })) } };
    }
    if (name === route('GET', '/environments/{environment_name}')) {
      assert.equal(params.environment_name, 'production');
      if (!state.environment) throw httpError(404);
      return { data: state.environment };
    }
    if (name === route('GET', '/environments/{environment_name}/deployment-branch-policies')) {
      return { data: { total_count: state.policies.length, branch_policies: state.policies } };
    }
    if (name === route('POST', '/git/refs')) {
      state.branches.push(params.ref.slice('refs/heads/'.length));
      return { data: {} };
    }
    if (name === route('PUT', '/contents/CHANGELOG.md')) return { data: {} };
    if (name === route('POST', '/pulls')) {
      return { data: { number: 96, html_url: 'https://github.com/avshukan/rank-vote/pull/96' } };
    }
    if (method === 'DELETE' && path.startsWith('/git/refs/heads/')) return { data: {} };
    if (name === route('POST', '/actions/workflows/{workflow_id}/dispatches')) return { data: {} };
    throw new Error(`unexpected request ${name}`);
  }

  return {
    state,
    request,
    paginate: async (name, params) => (await request(name, params)).data,
    writes: () =>
      state.calls
        .filter(({ route: name }) => !name.startsWith('GET '))
        .map(({ route: name }) => name.replace(prefix, '')),
    call: (name) => state.calls.find(({ route: candidate }) => candidate.includes(name)),
  };
}

function fakeCore() {
  const core = { failed: null, outputs: {}, summaryText: '', infos: [] };
  core.setFailed = (message) => (core.failed = message);
  core.setOutput = (name, value) => (core.outputs[name] = value);
  core.info = (line) => core.infos.push(line);
  core.summary = {
    addRaw(text) {
      core.summaryText += text;
      return this;
    },
    async write() {},
  };
  return core;
}

function context(overrides = {}) {
  return {
    repo: { owner: 'avshukan', repo: 'rank-vote' },
    serverUrl: 'https://github.com',
    runId: 99,
    eventName: 'push',
    ref: 'refs/tags/v0.2.0',
    sha: RELEASE,
    payload: {},
    ...overrides,
  };
}

async function runPrepare(github, version = 'v0.2.0') {
  const core = fakeCore();
  const result = await prepare({
    github,
    context: context({ eventName: 'workflow_dispatch', payload: { inputs: { version } } }),
    core,
    now: NOW,
  });
  return { result, core };
}

async function runValidate(github, overrides) {
  const core = fakeCore();
  const result = await validate({ github, context: context(overrides), core });
  return { result, core };
}

// ---------------------------------------------------------------------------
// Versions and the changelog

test('versions are strict vMAJOR.MINOR.PATCH and compare numerically', () => {
  for (const version of ['v0.2.0', 'v10.0.1', 'v0.0.0']) assert.ok(parseVersion(version));
  for (const version of [
    '0.2.0',
    'v0.2',
    'v01.2.3',
    'v0.2.0-rc.1',
    'v0.2.0+build',
    'V0.2.0',
    ' v0.2.0',
    'v0.2.0\n',
    'v0.2.0;id',
    undefined,
    2,
  ]) {
    assert.equal(parseVersion(version), null, String(version));
  }
  assert.equal(compareVersions('v0.10.0', 'v0.9.9'), 1);
  assert.equal(compareVersions('v0.2.0', 'v0.2.0'), 0);
  assert.equal(compareVersions('v0.2.0', 'v1.0.0'), -1);
  assert.deepEqual(releaseVersions(['refs/tags/v0.1.0', 'refs/tags/notes', 'refs/tags/v1.2']), [
    'v0.1.0',
  ]);
  assert.equal(highestVersion(['v0.1.0', 'v0.10.0', 'v0.9.0']), 'v0.10.0');
  assert.equal(highestVersion([]), null);
  assert.equal(releaseBranch('v0.2.0'), 'chore/release-v0.2.0');
});

test('the changelog entry goes on top, dated, with one bullet per merged change', () => {
  assert.deepEqual((({ version, date }) => ({ version, date }))(topRelease(CHANGELOG)), {
    version: 'v0.1.0',
    date: '2026-09-19',
  });
  const text = addRelease(CHANGELOG, 'v0.2.0', '2026-10-12', ['first (#1)', 'second (#2)']);
  const entry = topRelease(text);
  assert.equal(entry.heading, '## v0.2.0 — 2026-10-12');
  assert.equal(entry.body, '- first (#1)\n- second (#2)');
  assert.ok(text.startsWith('# Changelog\n\n## v0.2.0 — 2026-10-12\n'));
  assert.ok(text.endsWith(CHANGELOG.slice(CHANGELOG.indexOf('## v0.1.0'))));
  assert.doesNotMatch(text, /Unreleased/);
  assert.ok(hasRelease(text, 'v0.2.0'));
  assert.ok(!hasRelease(text, 'v0.2.1'));
  assert.ok(isValidDate('2026-10-12'));
  for (const date of ['2026-02-30', '2026-13-01', '12.10.2026', '', undefined]) {
    assert.ok(!isValidDate(date), String(date));
  }
});

test('the draft follows first parents only, oldest first', () => {
  const commits = fakeGitHub().state.rangeCommits;
  assert.deepEqual(firstParentSubjects(commits, HEAD, PREVIOUS), [
    'feat: explain score calculation (ID-19) (#86)',
    'docs: update ID-38 backlog note (#91)',
  ]);
  assert.throws(() => firstParentSubjects(commits.slice(1), HEAD, PREVIOUS), /missing/);
  const loop = [commit(HEAD, [MIDDLE], 'a'), commit(MIDDLE, [HEAD], 'b')];
  assert.throws(() => firstParentSubjects(loop, HEAD, PREVIOUS), /loops/);
});

test('CI evidence is the latest main push run of the exact commit with both jobs', () => {
  assert.equal(ciProblem(ciRun(), ciJobs(), RELEASE), null);
  const problems = [
    [null, ciJobs()],
    [ciRun({ head_sha: HEAD }), ciJobs()],
    [ciRun({ head_branch: 'feat/x' }), ciJobs()],
    [ciRun({ event: 'pull_request' }), ciJobs()],
    [ciRun({ path: '.github/workflows/other.yml' }), ciJobs()],
    [ciRun({ conclusion: 'cancelled' }), ciJobs()],
    [ciRun({ conclusion: null, status: 'in_progress' }), ciJobs()],
    [ciRun(), ciJobs({ containers: { conclusion: 'failure' } })],
    [ciRun(), ciJobs({ checks: { head_sha: HEAD } })],
    [ciRun(), ciJobs().slice(1)],
  ];
  for (const [run, jobs] of problems) assert.ok(ciProblem(run, jobs, RELEASE));
  assert.match(ciProblem(ciRun({ conclusion: 'cancelled' }), ciJobs(), RELEASE), /`cancelled`/);
});

// ---------------------------------------------------------------------------
// Prepare release

test('preparing a release opens one ordinary pull request and creates no tag', async () => {
  const github = fakeGitHub();
  const { result, core } = await runPrepare(github);

  assert.equal(core.failed, null);
  assert.deepEqual(github.writes(), [
    'POST /git/refs',
    'PUT /contents/CHANGELOG.md',
    'POST /pulls',
  ]);
  assert.equal(
    github.call('POST /repos/{owner}/{repo}/git/refs').params.ref,
    'refs/heads/chore/release-v0.2.0',
  );
  assert.equal(github.call('POST /repos/{owner}/{repo}/git/refs').params.sha, HEAD);
  const put = github.call('PUT /repos/{owner}/{repo}/contents/CHANGELOG.md').params;
  assert.equal(put.branch, 'chore/release-v0.2.0');
  assert.equal(put.sha, 'blob-sha');
  assert.equal(put.message, 'chore: prepare release v0.2.0');
  const text = Buffer.from(put.content, 'base64').toString('utf8');
  assert.equal(topRelease(text).heading, '## v0.2.0 — 2026-10-12');
  assert.equal(
    topRelease(text).body,
    '- feat: explain score calculation (ID-19) (#86)\n- docs: update ID-38 backlog note (#91)',
  );
  const pull = github.call('POST /repos/{owner}/{repo}/pulls').params;
  assert.equal(pull.draft, undefined);
  assert.equal((pull.base, pull.head), 'chore/release-v0.2.0');
  assert.equal(pull.base, 'main');
  assert.match(pull.body, /Review and edit the entry here before merging/);
  assert.match(pull.body, /tag \*\*exactly that merge commit\*\*, never a later one/);
  assert.match(pull.body, /git tag -a v0\.2\.0 "\$sha"/);
  assert.match(pull.body, /`v0\.1\.0\.\.main`/);
  assert.match(core.summaryText, /Opened \[#96\]/);
  assert.match(core.summaryText, /No tag was created/);
  assert.equal(result.pull.number, 96);
  // No tag object, tag ref or dispatch: the only ref it creates is the branch.
  assert.ok(!github.writes().some((write) => /\/git\/tags|dispatches/.test(write)));
  for (const { route, params } of github.state.calls) {
    if (route.startsWith('POST') && route.includes('/git/refs'))
      assert.match(params.ref, /^refs\/heads\//);
  }
});

test('the draft pages through a long comparison', async () => {
  const many = [];
  let parent = PREVIOUS;
  for (let index = 0; index < 230; index += 1) {
    const sha = `b${index.toString(16).padStart(39, '0')}`;
    many.push(commit(sha, [parent], `change ${index}`));
    parent = sha;
  }
  const github = fakeGitHub({ rangeCommits: many, mainSha: parent });
  github.state.changelogs[parent] = CHANGELOG;
  const { core } = await runPrepare(github);

  assert.equal(core.failed, null);
  const pages = github.state.calls.filter(({ route }) => route.includes('/compare/'));
  assert.equal(pages.length, 3);
  const put = github.call('PUT /repos/{owner}/{repo}/contents/CHANGELOG.md').params;
  const body = topRelease(Buffer.from(put.content, 'base64').toString('utf8')).body.split('\n');
  assert.equal(body.length, 230);
  assert.equal(body[0], '- change 0');
});

test('an invalid version is refused before any request, rendered as inline code', async () => {
  for (const version of ['0.2.0', 'v0.2', 'v0.2.0-rc.1', '`$(id)`', '', null]) {
    const github = fakeGitHub();
    const { core } = await runPrepare(github, version);
    assert.match(core.failed, /is not `vMAJOR\.MINOR\.PATCH`/);
    assert.deepEqual(github.state.calls, []);
  }
  const { core } = await runPrepare(fakeGitHub(), '`$(id)`');
  assert.match(core.summaryText, /`` `\$\(id\)` ``/);
});

test('every refusal of a preparation changes nothing and names the recovery', async () => {
  const open = prepPull({ state: 'open', merged_at: null, merge_commit_sha: null });
  const cases = [
    [{ tags: ['v0.1.0', 'v0.2.0'] }, /`v0\.2\.0` already exists/],
    [{ tags: ['v0.1.0', 'v0.3.0'] }, /not greater than the latest release tag `v0\.3\.0`/],
    [{ tags: ['notes'] }, /No release tag exists/],
    [{ pulls: [open] }, /\[#95\]\(.+\) for `v0\.2\.0` is already open/],
    [{ pulls: [prepPull()] }, /already prepared by \[#95\]/],
    [
      { branches: ['main', 'chore/release-v0.2.0'] },
      /`chore\/release-v0\.2\.0` branch already exists/,
    ],
    [{ changelogs: { [HEAD]: RELEASED_CHANGELOG } }, /already has an entry for `v0\.2\.0`/],
    [{ rangeStatus: 'identical', rangeCommits: [] }, /`main` has no changes since `v0\.1\.0`/],
    [{ rangeStatus: 'diverged' }, /`v0\.1\.0` is not an ancestor of `main`/],
  ];
  for (const [options, message] of cases) {
    const github = fakeGitHub(options);
    const { core } = await runPrepare(github);
    assert.match(core.failed, message);
    assert.match(core.summaryText, /\*\*Recovery:\*\*/);
    assert.deepEqual(github.writes(), [], String(message));
  }
});

test('starting the same preparation twice never opens a second pull request', async () => {
  const github = fakeGitHub();
  await runPrepare(github);
  github.state.pulls.push(prepPull({ number: 96, state: 'open', merged_at: null }));
  const { core } = await runPrepare(github);

  assert.match(core.failed, /already open/);
  assert.equal(github.writes().filter((write) => write === 'POST /pulls').length, 1);
});

test('a closed, unmerged preparation does not block a new one', async () => {
  const github = fakeGitHub({ pulls: [prepPull({ merged_at: null, merge_commit_sha: null })] });
  const { core } = await runPrepare(github);
  assert.equal(core.failed, null);
});

test('a failed pull request deletes the branch it created', async () => {
  const github = fakeGitHub({
    failures: {
      'POST /repos/{owner}/{repo}/pulls': httpError(
        403,
        'GitHub Actions is not permitted to create or approve pull requests.',
      ),
    },
  });
  const { core } = await runPrepare(github);

  assert.deepEqual(github.writes(), [
    'POST /git/refs',
    'PUT /contents/CHANGELOG.md',
    'POST /pulls',
    'DELETE /git/refs/heads/chore/release-v0.2.0',
  ]);
  assert.match(core.failed, /was deleted again/);
  assert.match(core.summaryText, /Allow GitHub Actions to create and approve pull requests/);
});

// ---------------------------------------------------------------------------
// Release: validation before approval

test('a valid release tag is validated without any write and passes its identity on', async () => {
  const github = fakeGitHub({ pulls: [prepPull()], tags: ['v0.1.0', 'v0.2.0'] });
  const { core } = await runValidate(github);

  assert.equal(core.failed, null);
  assert.deepEqual(core.outputs, { tag: 'v0.2.0', sha: RELEASE });
  assert.deepEqual(github.writes(), []);
  assert.match(
    core.summaryText,
    /requires approval by the owner\. The deploy job now waits for it/,
  );
  const pulls = github.call('GET /repos/{owner}/{repo}/pulls').params;
  assert.deepEqual(
    [pulls.state, pulls.base, pulls.head],
    ['closed', 'main', 'avshukan:chore/release-v0.2.0'],
  );
});

test('the production Environment must exist with its protection before approval', async () => {
  assert.equal(
    environmentProblem(productionEnvironment(), [{ name: 'v*', type: 'tag' }], 'avshukan'),
    null,
  );
  const reviewers = (overrides) => ({
    protection_rules: [{ ...productionEnvironment().protection_rules[0], ...overrides }],
  });
  const cases = [
    [{ environment: null }, /does not exist/],
    [
      { environment: productionEnvironment({ protection_rules: [] }) },
      /does not require `avshukan`/,
    ],
    [
      {
        environment: productionEnvironment(
          reviewers({ reviewers: [{ type: 'User', reviewer: { login: 'someone' } }] }),
        ),
      },
      /does not require `avshukan`/,
    ],
    [
      { environment: productionEnvironment(reviewers({ prevent_self_review: true })) },
      /prevents self-review/,
    ],
    [{ environment: productionEnvironment({ can_admins_bypass: true }) }, /bypass/],
    [{ environment: productionEnvironment({ deployment_branch_policy: null }) }, /tag rule `v\*`/],
    [
      {
        environment: productionEnvironment({
          deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
        }),
      },
      /tag rule `v\*`/,
    ],
    [{ policies: [] }, /tag rule `v\*`/],
    [
      {
        policies: [
          { name: 'v*', type: 'tag' },
          { name: 'main', type: 'branch' },
        ],
      },
      /tag rule `v\*`/,
    ],
    [{ policies: [{ name: '*', type: 'tag' }] }, /tag rule `v\*`/],
  ];
  for (const [options, message] of cases) {
    const github = fakeGitHub({ pulls: [prepPull()], tags: ['v0.1.0', 'v0.2.0'], ...options });
    const { core } = await runValidate(github);
    assert.match(core.failed ?? '', message, String(message));
    assert.match(core.failed, /could run without the owner's approval/);
    assert.deepEqual(core.outputs, {});
  }
});

test('GITHUB_SHA may name the tag object of the same tag', async () => {
  const github = fakeGitHub({ pulls: [prepPull()], tags: ['v0.1.0', 'v0.2.0'] });
  const { core } = await runValidate(github, { sha: TAG_OBJECT });
  assert.equal(core.failed, null);
  assert.equal(core.outputs.sha, RELEASE);
});

test('every validation failure stops before approval with no output', async () => {
  const valid = { pulls: [prepPull()], tags: ['v0.1.0', 'v0.2.0'] };
  const cases = [
    [{}, { ref: 'refs/heads/main' }, /not a release tag push/],
    [{}, { ref: 'refs/tags/v0.2.0-rc.1' }, /not a release tag push/],
    [{}, { eventName: 'workflow_dispatch' }, /not a release tag push/],
    [{ tagRef: { type: 'commit', sha: RELEASE } }, {}, /lightweight tag/],
    [{ tagTarget: { type: 'tag', sha: 'e'.repeat(40) } }, {}, /does not point to a commit/],
    [{}, { sha: HEAD }, /no longer points to the commit/],
    [{ pulls: [] }, {}, /not on the merge commit of the merged `chore\/release-v0\.2\.0`/],
    [{ pulls: [prepPull({ merge_commit_sha: HEAD })] }, {}, /not on the merge commit/],
    [{ pulls: [prepPull({ merged_at: null })] }, {}, /not on the merge commit/],
    [{ releaseStatus: 'diverged' }, {}, /not reachable from `main`/],
    [{ releaseStatus: 'behind' }, {}, /not reachable from `main`/],
    [{ runs: [] }, {}, /No `ci\.yml` push run/],
    [{ runs: [ciRun(), ciRun({ id: 13, conclusion: 'cancelled' })] }, {}, /`cancelled`/],
    [{ jobs: ciJobs({ containers: { conclusion: 'failure' } }) }, {}, /`containers` job/],
    [{ tags: ['v0.1.0', 'v0.2.0', 'v0.2.1'] }, {}, /not the highest release tag: `v0\.2\.1`/],
    [
      { changelogs: { [RELEASE]: CHANGELOG } },
      {},
      /top entry of `CHANGELOG\.md` .* for `v0\.2\.0` \(`## v0\.1\.0 — 2026-09-19`\)/,
    ],
    [
      { changelogs: { [RELEASE]: addRelease(CHANGELOG, 'v0.2.0', '2026-02-30', ['x']) } },
      {},
      /not a dated, non-empty entry/,
    ],
    [
      { changelogs: { [RELEASE]: addRelease(CHANGELOG, 'v0.2.0', '2026-10-12', []) } },
      {},
      /not a dated, non-empty entry/,
    ],
  ];
  for (const [options, overrides, message] of cases) {
    const github = fakeGitHub({ ...valid, ...options });
    const { core } = await runValidate(github, overrides);
    assert.match(core.failed ?? '', message, String(message));
    assert.deepEqual(core.outputs, {}, String(message));
    assert.match(core.summaryText, /no approval was requested/);
    assert.deepEqual(github.writes(), []);
  }
});

test('a cancelled main push run fails closed and names its recovery, never a CI rerun', async () => {
  const github = fakeGitHub({
    pulls: [prepPull()],
    tags: ['v0.1.0', 'v0.2.0'],
    runs: [ciRun({ conclusion: 'cancelled' })],
  });
  const { core } = await runValidate(github);
  assert.match(core.summaryText, /re-run it from the Actions tab, then re-run this workflow run/);
  assert.ok(!github.state.calls.some(({ route }) => /rerun|dispatches/.test(route)));
});

// ---------------------------------------------------------------------------
// Release: the approved deploy job

function fakeSpawn({ code = 0, stdout = '', stderr = '', error = null } = {}) {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const keyPath = args[args.indexOf('-i') + 1];
    calls.push({
      command,
      args,
      options,
      key: readFileSync(keyPath, 'utf8'),
      mode: statSync(keyPath).mode & 0o777,
      keyPath,
    });
    setImmediate(() => {
      if (error) {
        child.emit('error', error);
        return;
      }
      child.stdout.end(stdout);
      child.stderr.end(stderr);
      setImmediate(() => child.emit('close', code));
    });
    return child;
  };
  return { spawn, calls };
}

const vpsEnv = (overrides = {}) => ({
  RELEASE_TAG: 'v0.2.0',
  RELEASE_SHA: RELEASE,
  PRODUCTION_SSH_KEY: '-----BEGIN OPENSSH PRIVATE KEY-----\nkey\n-----END OPENSSH PRIVATE KEY-----',
  PRODUCTION_SSH_KNOWN_HOSTS: '165.22.91.190 ssh-ed25519 AAAAhost',
  ...overrides,
});

async function runVps(env, spawnOptions) {
  const workdir = mkdtempSync(join(tmpdir(), 'release-test-'));
  try {
    const { spawn, calls } = fakeSpawn(spawnOptions);
    const core = fakeCore();
    const result = await releaseOnVps({ core, env, spawn, workdir });
    return { result, core, calls, workdir };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

test('the deploy job calls only the forced command, with a pinned host key', async () => {
  const status = 'rank-vote-release: accepted v0.2.0\nVerified: v0.2.0 is the current release\n';
  const { result, core, calls } = await runVps(vpsEnv(), { stdout: status });

  assert.equal(result.ok, true);
  assert.equal(core.failed, null);
  const [call] = calls;
  assert.equal(call.command, 'ssh');
  assert.equal(call.mode, 0o600);
  assert.ok(call.key.endsWith('-----\n'));
  for (const option of [
    'StrictHostKeyChecking=yes',
    'BatchMode=yes',
    'IdentitiesOnly=yes',
    'GlobalKnownHostsFile=/dev/null',
  ]) {
    assert.ok(call.args.includes(option), option);
  }
  assert.ok(call.args.some((arg) => arg.startsWith('UserKnownHostsFile=')));
  assert.ok(call.args.includes('-T'));
  assert.deepEqual(call.args.slice(-2), [PRODUCTION_SSH, `v0.2.0 ${RELEASE}`]);
  assert.deepEqual(
    sshArguments({ keyPath: 'k', knownHostsPath: 'h', tag: 'v0.2.0', sha: RELEASE }),
    call.args.map((arg) =>
      arg.replace(call.keyPath, 'k').replace(/UserKnownHostsFile=.*/, 'UserKnownHostsFile=h'),
    ),
  );
  assert.ok(!existsSync(call.keyPath), 'the key file is removed afterwards');
  assert.match(core.summaryText, /Verified: v0\.2\.0 is the current release/);
  assert.doesNotMatch(core.summaryText, /BEGIN OPENSSH/);
});

test('missing identity or SSH settings stop before ssh runs', async () => {
  for (const env of [
    vpsEnv({ RELEASE_TAG: '' }),
    vpsEnv({ RELEASE_SHA: 'abc' }),
    vpsEnv({ RELEASE_TAG: 'v0.2.0; id' }),
    vpsEnv({ PRODUCTION_SSH_KEY: '' }),
    vpsEnv({ PRODUCTION_SSH_KNOWN_HOSTS: ' ' }),
  ]) {
    const { result, core, calls } = await runVps(env);
    assert.equal(result.ok, false);
    assert.ok(core.failed);
    assert.deepEqual(calls, []);
  }
});

test('each remote exit status names what happened and the next step', async () => {
  const cases = [
    [{ code: 255 }, /SSH failed before any remote command ran: nothing changed/],
    [
      { code: 255, stdout: 'rank-vote-release: release started\n' },
      /connection was lost during the release.*continues on the VPS/s,
    ],
    [{ code: 75, stdout: 'rank-vote-release: refused\n' }, /holds the deployment lock/],
    [
      { code: 64, stdout: 'rank-vote-release: refused\n' },
      /wrapper refused the request: nothing changed/,
    ],
    [{ code: 1, stdout: 'Release failed: x\nNext step: y\n' }, /status above names the state/],
    [{ error: new Error('ENOENT') }, /`ssh` could not be started/],
  ];
  for (const [spawnOptions, message] of cases) {
    const { result, core } = await runVps(vpsEnv(), spawnOptions);
    assert.equal(result.ok, false);
    assert.match(core.failed, message);
  }
  assert.equal(remoteOutcome(0, true).ok, true);
});

// ---------------------------------------------------------------------------
// Release: the backlog sweep request

test('a verified release requests the sweep through backlog-sweep.yml on main', async () => {
  const github = fakeGitHub();
  const core = fakeCore();
  const result = await requestSweep({
    github,
    context: context(),
    core,
    env: { RELEASE_TAG: 'v0.2.0', RELEASE_SHA: RELEASE },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(github.writes(), ['POST /actions/workflows/{workflow_id}/dispatches']);
  const { params } = github.call('dispatches');
  assert.deepEqual(
    [params.workflow_id, params.ref, params.inputs],
    ['backlog-sweep.yml', 'main', { reason: `release v0.2.0 at ${RELEASE}` }],
  );
});

test('a failed sweep request keeps the release verified and names the retry', async () => {
  const github = fakeGitHub({
    failures: {
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches': httpError(500),
    },
  });
  const core = fakeCore();
  await requestSweep({
    github,
    context: context(),
    core,
    env: { RELEASE_TAG: 'v0.2.0', RELEASE_SHA: RELEASE },
  });
  assert.match(core.summaryText, /The release is verified; only the backlog sweep request failed/);
  assert.match(core.summaryText, /without approval or deployment/);
  assert.match(core.summaryText, new RegExp(`reason="release v0\\.2\\.0 at ${RELEASE}"`));
  assert.ok(core.failed);
});

test('the sweep request refuses an unvalidated identity', async () => {
  const github = fakeGitHub();
  const core = fakeCore();
  await requestSweep({
    github,
    context: context(),
    core,
    env: { RELEASE_TAG: 'main', RELEASE_SHA: RELEASE },
  });
  assert.deepEqual(github.state.calls, []);
  assert.ok(core.failed);
});

// ---------------------------------------------------------------------------
// The workflow files: the boundary that the code above relies on

const workflow = (name) => readFileSync(join(repositoryRoot, '.github/workflows', name), 'utf8');

function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  return Object.fromEntries(
    body.split(/\n(?= {2}[a-z][\w-]*:\n)/).map((block) => [block.trim().split(':')[0], block]),
  );
}

test('only the approved deploy job holds the production Environment and its secret', () => {
  const text = workflow('release.yml');
  assert.match(text, /\non:\n {2}push:\n {4}tags: \['v\*'\]\n/);
  assert.match(text, /\npermissions: \{\}\n/);
  const { validate: check, deploy, sweep } = jobs(text);
  assert.ok(check && deploy && sweep);
  assert.equal(text.match(/environment:/g).length, 1);
  assert.match(deploy, /environment: production/);
  assert.match(deploy, /needs: validate/);
  assert.match(deploy, /cancel-in-progress: false/);
  assert.match(deploy, /queue: max/);
  assert.match(sweep, /needs: \[validate, deploy\]/);
  for (const block of [check, sweep]) {
    assert.doesNotMatch(block, /secrets\.|vars\.|environment:/);
  }
  assert.doesNotMatch(check, /: write/);
  assert.match(sweep, /actions: write/);
  assert.doesNotMatch(deploy, /: write/);
});

test('Prepare release cannot tag, deploy or read a secret', () => {
  const text = workflow('prepare-release.yml');
  assert.match(text, /\non:\n {2}workflow_dispatch:\n/);
  assert.match(text, /\npermissions: \{\}\n/);
  assert.doesNotMatch(
    text,
    /secrets\.|vars\.|environment:|actions: write|git tag|\$\{\{ (github|inputs)\./,
  );
});

test('every action in the release workflows is pinned by SHA', () => {
  for (const name of ['release.yml', 'prepare-release.yml']) {
    for (const [, reference] of workflow(name).matchAll(/uses: (\S+)/g)) {
      assert.match(reference, /@[0-9a-f]{40}$/, reference);
    }
  }
});
