// Tagged releases (ID-42). `.github/workflows/prepare-release.yml` and
// `.github/workflows/release.yml` call these entry points through
// actions/github-script; the pure helpers are exported for the tests.
// Deterministic, no LLM. Nothing here creates a tag or approves a deployment.
// Only `releaseOnVps` reads a production secret, and it runs only in the
// approved `production` job. See docs/production.md (Tagged releases).

import { spawn as spawnProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inlineCode } from './backlog-promotion.mjs';

// Strict SemVer core: no leading zeros, no pre-release or build suffix.
export const VERSION_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const SHA_PATTERN = /^[0-9a-f]{40}$/;
export const CHANGELOG_PATH = 'CHANGELOG.md';
export const CI_WORKFLOW = 'ci.yml';
export const REQUIRED_JOBS = ['checks', 'containers'];
export const SWEEP_WORKFLOW = 'backlog-sweep.yml';
export const PRODUCTION_SSH = 'root@165.22.91.190';
const MAIN = 'main';

export const releaseBranch = (version) => `chore/release-${version}`;
export const sweepReason = (tag, sha) => `release ${tag} at ${sha}`;

// A reason to stop, with the recovery step. Nothing has been changed when one
// is thrown, unless its text says otherwise.
export class ReleaseStop extends Error {
  constructor(reason, recovery) {
    super(reason);
    this.reason = reason;
    this.recovery = recovery;
  }
}

const stop = (reason, recovery) => new ReleaseStop(reason, recovery);

// ---------------------------------------------------------------------------
// Versions

export function parseVersion(text) {
  const match = typeof text === 'string' ? VERSION_PATTERN.exec(text) : null;
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  const [a, b] = [parseVersion(left), parseVersion(right)];
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

// Release tags among `refs/tags/...` names; other tags never count.
export function releaseVersions(refs) {
  return refs.map((ref) => ref.replace(/^refs\/tags\//, '')).filter((name) => parseVersion(name));
}

export function highestVersion(versions) {
  return versions.reduce(
    (highest, version) =>
      highest === null || compareVersions(version, highest) > 0 ? version : highest,
    null,
  );
}

// ---------------------------------------------------------------------------
// CHANGELOG.md

const ENTRY_HEADING = /^## (\S+) — (\S+)$/;

export function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text ?? '')) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// The first `## ` heading and its entry, up to the next one.
export function topRelease(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## '));
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const match = ENTRY_HEADING.exec(lines[start]);
  return {
    heading: lines[start],
    version: match?.[1] ?? null,
    date: match?.[2] ?? null,
    body: lines
      .slice(start + 1, next === -1 ? undefined : next)
      .join('\n')
      .trim(),
  };
}

export function hasRelease(text, version) {
  return text
    .split('\n')
    .some((line) => line === `## ${version}` || line.startsWith(`## ${version} `));
}

// The new entry goes above the previous top entry, under the title.
export function addRelease(text, version, date, subjects) {
  const entry = [`## ${version} — ${date}`, '', ...subjects.map((subject) => `- ${subject}`)];
  const lines = text.split('\n');
  const first = lines.findIndex((line) => line.startsWith('## '));
  if (first === -1) return `${text.trimEnd()}\n\n${entry.join('\n')}\n`;
  return [...lines.slice(0, first), ...entry, '', ...lines.slice(first)].join('\n');
}

// Subjects of the first-parent commits from `headSha` back to `baseSha`,
// oldest first: one per merged pull request.
export function firstParentSubjects(commits, headSha, baseSha) {
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]));
  const subjects = [];
  let sha = headSha;
  while (sha !== baseSha) {
    const commit = bySha.get(sha);
    if (!commit) throw new Error(`commit ${sha} is missing from the comparison`);
    if (subjects.length === commits.length) throw new Error('the first-parent chain loops');
    subjects.push(commit.commit.message.split('\n')[0].trim());
    sha = commit.parents[0]?.sha;
  }
  return subjects.reverse();
}

// ---------------------------------------------------------------------------
// CI evidence: the rules of `validate_ci` in scripts/production/core.py.

export function ciProblem(run, jobs, sha) {
  if (!run) return 'No `ci.yml` push run on `main` exists for this commit.';
  if (
    run.head_sha !== sha ||
    run.head_branch !== MAIN ||
    run.event !== 'push' ||
    run.path !== `.github/workflows/${CI_WORKFLOW}`
  ) {
    return 'The latest CI run found is not a `ci.yml` push run on `main` for this commit.';
  }
  if (run.conclusion !== 'success') {
    return (
      `The latest \`ci.yml\` push run on \`main\` for this commit is ` +
      `${inlineCode(run.conclusion ?? run.status ?? 'unknown')}, not \`success\`.`
    );
  }
  for (const name of REQUIRED_JOBS) {
    const job = jobs.find((candidate) => candidate.name === name);
    if (job?.conclusion !== 'success' || job.head_sha !== sha) {
      return `The required \`${name}\` job did not succeed on this commit.`;
    }
  }
  return null;
}

// The `production` Environment as docs/production.md sets it up. A workflow
// that references a missing Environment makes GitHub create it without any
// protection, so the deploy job would run with no approval: refuse first.
export function environmentProblem(environment, policies, owner) {
  if (!environment) return 'The `production` Environment does not exist.';
  const reviewers = environment.protection_rules?.find(
    (rule) => rule.type === 'required_reviewers',
  );
  if (
    !reviewers?.reviewers?.some(
      ({ type, reviewer }) => type === 'User' && reviewer?.login === owner,
    )
  ) {
    return `The \`production\` Environment does not require \`${owner}\` as a reviewer.`;
  }
  if (reviewers.prevent_self_review !== false) {
    return 'The `production` Environment prevents self-review, so the owner who tags cannot approve.';
  }
  if (environment.can_admins_bypass !== false) {
    return 'The `production` Environment lets administrators bypass its protection.';
  }
  const policy = environment.deployment_branch_policy;
  if (
    !policy?.custom_branch_policies ||
    policy.protected_branches ||
    !policies.length ||
    policies.some(({ name, type }) => name !== 'v*' || type !== 'tag')
  ) {
    return 'The `production` Environment does not limit deployments to the tag rule `v*`.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// GitHub reads shared by both workflows

async function listReleaseVersions(github, owner, repo) {
  // A slash inside a route parameter would be encoded, so the ref is in the path.
  const refs = await github.paginate('GET /repos/{owner}/{repo}/git/matching-refs/tags/v', {
    owner,
    repo,
    per_page: 100,
  });
  return releaseVersions(refs.map(({ ref }) => ref));
}

async function readChangelog(github, owner, repo, ref) {
  const { data } = await github.request(`GET /repos/{owner}/{repo}/contents/${CHANGELOG_PATH}`, {
    owner,
    repo,
    ref,
  });
  return { text: Buffer.from(data.content, 'base64').toString('utf8'), blobSha: data.sha };
}

async function branchExists(github, owner, repo, branch) {
  try {
    await github.request(`GET /repos/{owner}/{repo}/git/ref/heads/${branch}`, { owner, repo });
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

// Every commit of `base...head`, across the pages of the comparison.
async function compareRange(github, owner, repo, base, head) {
  const page = async (number) =>
    (
      await github.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
        owner,
        repo,
        basehead: `${base}...${head}`,
        per_page: 100,
        page: number,
      })
    ).data;
  const first = await page(1);
  const commits = [...first.commits];
  for (let number = 2; commits.length < first.total_commits; number += 1) {
    const more = (await page(number)).commits;
    if (!more.length) break;
    commits.push(...more);
  }
  return { status: first.status, baseSha: first.base_commit.sha, commits };
}

// ---------------------------------------------------------------------------
// Reporting

function codeBlock(text) {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

async function attempt(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ReleaseStop) return { stop: error };
    return {
      stop: stop(
        `Unexpected error: ${inlineCode(error.message)}.`,
        'Nothing past the last completed step was changed. Re-run the failed jobs of this ' +
          'workflow run from the Actions tab.',
      ),
    };
  }
}

async function report(core, heading, lines, failed) {
  const text = [`## ${heading}`, '', ...lines].join('\n');
  core.info(text);
  await core.summary.addRaw(text).write();
  if (failed) core.setFailed(failed);
}

const stopLines = (result) => [result.stop.reason, '', `**Recovery:** ${result.stop.recovery}`];

// ---------------------------------------------------------------------------
// Prepare release

export function pullRequestBody({ version, previous, date, baseSha, headSha, runUrl }) {
  const branch = releaseBranch(version);
  return [
    `Release preparation for \`${version}\`, opened by the [Prepare release](${runUrl}) workflow.`,
    '',
    `It adds the \`${CHANGELOG_PATH}\` entry for \`${version}\`, dated ${date} (UTC), with a ` +
      `summary drafted from the subjects of the first-parent commits in \`${previous}..main\` ` +
      `(\`${baseSha.slice(0, 7)}..${headSha.slice(0, 7)}\`). **Review and edit the entry here ` +
      'before merging:** the release ships exactly the changes this pull request was prepared for.',
    '',
    `After this pull request merges and the \`main\` push CI run of its merge commit passes ` +
      '`checks` and `containers`, tag **exactly that merge commit**, never a later one:',
    '',
    '```sh',
    'git fetch origin',
    `sha=$(gh pr view ${branch} --json mergeCommit --jq .mergeCommit.oid)`,
    `git tag -a ${version} "$sha" -m "Release ${version}"`,
    `git push origin ${version}`,
    '```',
    '',
    'Push one release tag at a time. The tag starts the **Release** workflow, which validates ' +
      'the commit and waits for the `production` approval before anything touches production. ' +
      'If more changes must ship, run **Prepare release** again instead of tagging a later commit.',
  ].join('\n');
}

// The only writes: the branch, one commit to CHANGELOG.md and the pull request.
// If the commit or the pull request fails, the branch is deleted again.
async function openPullRequest({ github, owner, repo, plan }) {
  try {
    await github.request('POST /repos/{owner}/{repo}/git/refs', {
      owner,
      repo,
      ref: `refs/heads/${plan.branch}`,
      sha: plan.headSha,
    });
  } catch (error) {
    if (error.status !== 422) throw error;
    throw stop(
      `The \`${plan.branch}\` branch appeared while this preparation was running.`,
      'Check the Actions tab for another Prepare release run for this version. If there is none, ' +
        `delete the \`${plan.branch}\` branch, then run Prepare release again.`,
    );
  }
  try {
    await github.request(`PUT /repos/{owner}/{repo}/contents/${CHANGELOG_PATH}`, {
      owner,
      repo,
      branch: plan.branch,
      sha: plan.blobSha,
      message: plan.title,
      content: Buffer.from(plan.text, 'utf8').toString('base64'),
    });
    const { data: pull } = await github.request('POST /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      base: MAIN,
      head: plan.branch,
      title: plan.title,
      body: plan.body,
    });
    return pull;
  } catch (error) {
    let cleanup = `The \`${plan.branch}\` branch it had created was deleted again.`;
    try {
      await github.request(`DELETE /repos/{owner}/{repo}/git/refs/heads/${plan.branch}`, {
        owner,
        repo,
      });
    } catch (cleanupError) {
      cleanup =
        `Deleting the \`${plan.branch}\` branch it had created also failed: ` +
        `${inlineCode(cleanupError.message)}. Delete it before preparing again.`;
    }
    throw stop(
      `Writing the release preparation failed: ${inlineCode(error.message)}. ${cleanup}`,
      'Run Prepare release again. If GitHub refused to create the pull request, a repository ' +
        'admin enables Settings → Actions → General → Workflow permissions → **Allow GitHub ' +
        'Actions to create and approve pull requests** first.',
    );
  }
}

async function planPreparation({ github, owner, repo, input, now, runUrl }) {
  if (!parseVersion(input)) {
    throw stop(
      `The version ${inlineCode(input ?? '')} is not \`vMAJOR.MINOR.PATCH\` without leading ` +
        'zeros or suffixes.',
      'Run Prepare release again with a version such as `v0.2.0`.',
    );
  }
  const version = input;
  const versions = await listReleaseVersions(github, owner, repo);
  if (versions.includes(version)) {
    throw stop(
      `The release tag \`${version}\` already exists.`,
      'Release tags are immutable: prepare a greater version.',
    );
  }
  const previous = highestVersion(versions);
  if (!previous) {
    throw stop(
      'No release tag exists, so there is no previous release to prepare from.',
      'The first release is deployed and tagged manually (docs/production.md).',
    );
  }
  if (compareVersions(version, previous) <= 0) {
    throw stop(
      `\`${version}\` is not greater than the latest release tag \`${previous}\`.`,
      'Prepare a greater version.',
    );
  }
  const branch = releaseBranch(version);
  const pulls = await github.paginate('GET /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    state: 'all',
    head: `${owner}:${branch}`,
    per_page: 100,
  });
  const open = pulls.find((pull) => pull.state === 'open');
  if (open) {
    throw stop(
      `The release-prep pull request [#${open.number}](${open.html_url}) for \`${version}\` is ` +
        'already open.',
      'Review and merge that pull request, or close it and delete its branch to prepare again.',
    );
  }
  const merged = pulls.find((pull) => pull.merged_at);
  if (merged) {
    throw stop(
      `\`${version}\` was already prepared by [#${merged.number}](${merged.html_url}), which is ` +
        'merged.',
      'Tag the merge commit of that pull request as its description shows, or prepare a greater ' +
        'version.',
    );
  }
  if (await branchExists(github, owner, repo, branch)) {
    throw stop(
      `The \`${branch}\` branch already exists.`,
      `Delete the \`${branch}\` branch, then run Prepare release again.`,
    );
  }
  const { data: main } = await github.request(`GET /repos/{owner}/{repo}/git/ref/heads/${MAIN}`, {
    owner,
    repo,
  });
  const headSha = main.object.sha;
  const changelog = await readChangelog(github, owner, repo, headSha);
  if (hasRelease(changelog.text, version)) {
    throw stop(
      `\`${CHANGELOG_PATH}\` on \`main\` already has an entry for \`${version}\`.`,
      'Prepare a greater version.',
    );
  }
  const range = await compareRange(github, owner, repo, previous, headSha);
  if (range.status !== 'ahead') {
    throw stop(
      range.status === 'identical'
        ? `\`main\` has no changes since \`${previous}\`.`
        : `\`${previous}\` is not an ancestor of \`main\` (${inlineCode(range.status)}).`,
      'Nothing to prepare: merge the changes to release first.',
    );
  }
  const subjects = firstParentSubjects(range.commits, headSha, range.baseSha);
  const date = now.toISOString().slice(0, 10);
  const title = `chore: prepare release ${version}`;
  return {
    version,
    previous,
    branch,
    headSha,
    blobSha: changelog.blobSha,
    subjects,
    title,
    text: addRelease(changelog.text, version, date, subjects),
    body: pullRequestBody({ version, previous, date, baseSha: range.baseSha, headSha, runUrl }),
  };
}

export async function prepare({ github, context, core, now = new Date() }) {
  const { owner, repo } = context.repo;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  // The input is untrusted: it is validated before any use, and only ever
  // rendered as inline code.
  const input = context.payload.inputs?.version;
  const result = await attempt(async () => {
    const plan = await planPreparation({ github, owner, repo, input, now, runUrl });
    return { plan, pull: await openPullRequest({ github, owner, repo, plan }) };
  });
  if (result.stop) {
    await report(core, 'Prepare release', stopLines(result), result.stop.reason);
    return result;
  }
  const { plan, pull } = result;
  await report(core, `Prepare release ${plan.version}`, [
    `Opened [#${pull.number}](${pull.html_url}): ${plan.title}`,
    '',
    `Branch \`${plan.branch}\` from \`main\` at \`${plan.headSha.slice(0, 7)}\`; ` +
      `${plan.subjects.length} commit(s) since \`${plan.previous}\`. No tag was created.`,
  ]);
  return result;
}

// ---------------------------------------------------------------------------
// Release: validation before the `production` approval

async function checkRelease({ github, context, owner, repo }) {
  const ref = context.ref ?? '';
  const tag = ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : '';
  if (context.eventName !== 'push' || !parseVersion(tag)) {
    throw stop(
      `${inlineCode(ref)} is not a release tag push (\`vMAJOR.MINOR.PATCH\`).`,
      'Nothing was deployed. Release tags are created only as docs/production.md describes.',
    );
  }
  const newVersion = 'Release tags are immutable: prepare a new version with Prepare release.';
  const { data: tagRef } = await github.request(`GET /repos/{owner}/{repo}/git/ref/tags/${tag}`, {
    owner,
    repo,
  });
  if (tagRef.object.type !== 'tag') {
    throw stop(`\`${tag}\` is a lightweight tag; a release tag must be annotated.`, newVersion);
  }
  const { data: tagObject } = await github.request('GET /repos/{owner}/{repo}/git/tags/{tag_sha}', {
    owner,
    repo,
    tag_sha: tagRef.object.sha,
  });
  if (tagObject.object.type !== 'commit') {
    throw stop(`\`${tag}\` does not point to a commit.`, newVersion);
  }
  const sha = tagObject.object.sha;
  // GitHub documents GITHUB_SHA as the commit; the tag object is accepted too,
  // because either one names this same tag.
  if (sha !== context.sha && tagRef.object.sha !== context.sha) {
    throw stop(`\`${tag}\` no longer points to the commit this run started for.`, newVersion);
  }

  const branch = releaseBranch(tag);
  const pulls = await github.paginate('GET /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    state: 'closed',
    base: MAIN,
    head: `${owner}:${branch}`,
    per_page: 100,
  });
  if (!pulls.some((pull) => pull.merged_at && pull.merge_commit_sha === sha)) {
    throw stop(
      `\`${tag}\` is not on the merge commit of the merged \`${branch}\` pull request.`,
      'A release tag goes on exactly the merge commit of its reviewed release-prep pull request. ' +
        newVersion,
    );
  }
  const { data: comparison } = await github.request(
    'GET /repos/{owner}/{repo}/compare/{basehead}',
    {
      owner,
      repo,
      basehead: `${sha}...${MAIN}`,
      per_page: 1,
    },
  );
  if (!['ahead', 'identical'].includes(comparison.status)) {
    throw stop(`\`${sha}\` is not reachable from \`main\`.`, newVersion);
  }

  const { data: runs } = await github.request(
    'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
    {
      owner,
      repo,
      workflow_id: CI_WORKFLOW,
      head_sha: sha,
      branch: MAIN,
      event: 'push',
      per_page: 100,
    },
  );
  // The latest run or attempt decides, not an older green run followed by red.
  const run = runs.workflow_runs.reduce(
    (latest, item) => (!latest || item.id > latest.id ? item : latest),
    null,
  );
  const jobs = run
    ? (
        await github.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
          owner,
          repo,
          run_id: run.id,
          per_page: 100,
        })
      ).data.jobs
    : [];
  const problem = ciProblem(run, jobs, sha);
  if (problem) {
    throw stop(
      problem,
      'This commit cannot be released until its own `main` push CI run passes; CI is never ' +
        're-run here. If that run was cancelled by a later merge or failed for a transient reason, ' +
        're-run it from the Actions tab, then re-run this workflow run. Otherwise prepare a new release.',
    );
  }

  const highest = highestVersion(await listReleaseVersions(github, owner, repo));
  if (highest !== tag) {
    throw stop(
      `\`${tag}\` is not the highest release tag: \`${highest}\` exists.`,
      'An older version is never released after a newer tag; release the newest prepared version.',
    );
  }
  let environment = null;
  let policies = [];
  try {
    ({ data: environment } = await github.request(
      'GET /repos/{owner}/{repo}/environments/{environment_name}',
      { owner, repo, environment_name: 'production' },
    ));
    if (environment.deployment_branch_policy?.custom_branch_policies) {
      ({
        data: { branch_policies: policies },
      } = await github.request(
        'GET /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies',
        { owner, repo, environment_name: 'production', per_page: 100 },
      ));
    }
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const settings = environmentProblem(environment, policies, owner);
  if (settings) {
    throw stop(
      `${settings} Without its protection the deploy job could run without the owner's approval.`,
      'Set up the `production` Environment as docs/production.md (section 9, One-time owner ' +
        'setup) describes, then re-run this workflow run.',
    );
  }
  const entry = topRelease((await readChangelog(github, owner, repo, sha)).text);
  if (!entry || entry.version !== tag || !isValidDate(entry.date) || !entry.body) {
    throw stop(
      `The top entry of \`${CHANGELOG_PATH}\` at this commit is not a dated, non-empty entry ` +
        `for \`${tag}\` (${inlineCode(entry?.heading ?? 'no entry')}).`,
      newVersion,
    );
  }
  return { tag, sha, run };
}

export async function validate({ github, context, core }) {
  const { owner, repo } = context.repo;
  const result = await attempt(() => checkRelease({ github, context, owner, repo }));
  if (result.stop) {
    await report(
      core,
      'Release: validation failed, so no approval was requested',
      stopLines(result),
      result.stop.reason,
    );
    return result;
  }
  const { tag, sha, run } = result;
  core.setOutput('tag', tag);
  core.setOutput('sha', sha);
  await report(core, `Release ${tag}: validated`, [
    `\`${tag}\` is an annotated tag on \`${sha}\`, the merge commit of its release-prep pull ` +
      `request, reachable from \`main\` and the highest release tag. Its \`main\` push CI run ` +
      `[${run.id}](${run.html_url}) passed \`checks\` and \`containers\`; its changelog entry is ` +
      'in place; and the `production` Environment requires approval by the owner. The deploy job ' +
      'now waits for it.',
  ]);
  return result;
}

// ---------------------------------------------------------------------------
// Release: the approved deploy job

export function sshArguments({ keyPath, knownHostsPath, tag, sha }) {
  return [
    '-i',
    keyPath,
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `UserKnownHostsFile=${knownHostsPath}`,
    '-o',
    'GlobalKnownHostsFile=/dev/null',
    '-o',
    'ConnectTimeout=30',
    '-o',
    'ServerAliveInterval=30',
    '-o',
    'ServerAliveCountMax=6',
    '-T',
    PRODUCTION_SSH,
    // The forced command reads this as SSH_ORIGINAL_COMMAND and validates it.
    `${tag} ${sha}`,
  ];
}

// What an exit status of the remote release means. 255 is ssh's own error;
// 64 and 75 are the wrapper's refusals.
export function remoteOutcome(code, received) {
  if (code === 0)
    return { ok: true, text: 'The VPS reports the release verified, or already current.' };
  if (code === 255 && !received) {
    return {
      ok: false,
      text:
        'SSH failed before any remote command ran: nothing changed. Check the pinned host key ' +
        '(`PRODUCTION_SSH_KNOWN_HOSTS`) and the deploy key, then re-run this workflow run.',
    };
  }
  if (code === 255) {
    return {
      ok: false,
      text:
        'The SSH connection was lost during the release. The release continues on the VPS ' +
        'under its deployment lock. Re-run this workflow run later: it reports the release as ' +
        'already current, is refused while the lock is held, or retries the same tag and SHA.',
    };
  }
  if (code === 64)
    return { ok: false, text: 'The VPS wrapper refused the request: nothing changed.' };
  if (code === 75) {
    return {
      ok: false,
      text:
        'Another production operation holds the deployment lock, possibly this release after a ' +
        'lost connection: this run changed nothing. Re-run this workflow run once it has finished.',
    };
  }
  if (code === null) return { ok: false, text: '`ssh` could not be started: nothing changed.' };
  return {
    ok: false,
    text: 'The release did not complete. The status above names the state of production and the next step.',
  };
}

function runSsh(spawn, args, core) {
  return new Promise((resolve) => {
    const lines = [];
    let received = false;
    const child = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = (stream, remote) => {
      let pending = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        if (remote) received = true;
        const parts = (pending + chunk).split('\n');
        pending = parts.pop();
        for (const line of parts) {
          lines.push(line);
          core.info(line);
        }
      });
      stream.on('end', () => {
        if (pending) {
          lines.push(pending);
          core.info(pending);
        }
      });
    };
    collect(child.stdout, true);
    collect(child.stderr, false);
    child.on('error', () => resolve({ code: null, received, lines }));
    child.on('close', (code) => resolve({ code, received, lines }));
  });
}

export async function releaseOnVps({
  core,
  env = process.env,
  spawn = spawnProcess,
  workdir = env.RUNNER_TEMP || tmpdir(),
}) {
  const tag = env.RELEASE_TAG ?? '';
  const sha = env.RELEASE_SHA ?? '';
  if (!parseVersion(tag) || !SHA_PATTERN.test(sha)) {
    const text = 'The validated tag and SHA are missing: nothing changed.';
    await report(core, 'Release on the VPS', [text], 'Missing release identity');
    return { ok: false };
  }
  const heading = `Release ${tag} on the VPS`;
  const key = env.PRODUCTION_SSH_KEY ?? '';
  const knownHosts = env.PRODUCTION_SSH_KNOWN_HOSTS ?? '';
  if (!key.trim() || !knownHosts.trim()) {
    const text =
      'The `production` Environment lacks the `PRODUCTION_SSH_KEY` secret or the ' +
      '`PRODUCTION_SSH_KNOWN_HOSTS` variable: nothing changed. See docs/production.md (Tagged releases).';
    await report(core, heading, [text], 'Missing production SSH settings');
    return { ok: false };
  }
  const directory = mkdtempSync(join(workdir, 'release-ssh-'));
  try {
    const keyPath = join(directory, 'key');
    const knownHostsPath = join(directory, 'known_hosts');
    writeFileSync(keyPath, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 });
    writeFileSync(knownHostsPath, knownHosts.endsWith('\n') ? knownHosts : `${knownHosts}\n`, {
      mode: 0o600,
    });
    const { code, received, lines } = await runSsh(
      spawn,
      sshArguments({ keyPath, knownHostsPath, tag, sha }),
      core,
    );
    const outcome = remoteOutcome(code, received);
    await report(
      core,
      heading,
      [lines.length ? codeBlock(lines.join('\n')) : '_No output from the VPS._', '', outcome.text],
      outcome.ok ? null : outcome.text,
    );
    return { ok: outcome.ok, code };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Release: the backlog sweep request after a verified release

export async function requestSweep({ github, context, core, env = process.env }) {
  const { owner, repo } = context.repo;
  const tag = env.RELEASE_TAG ?? '';
  const sha = env.RELEASE_SHA ?? '';
  if (!parseVersion(tag) || !SHA_PATTERN.test(sha)) {
    await report(
      core,
      'Backlog sweep request',
      ['The validated tag and SHA are missing.'],
      'Missing release identity',
    );
    return { ok: false };
  }
  const reason = sweepReason(tag, sha);
  try {
    await github.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
      owner,
      repo,
      workflow_id: SWEEP_WORKFLOW,
      ref: MAIN,
      inputs: { reason },
    });
  } catch (error) {
    const text =
      `The release is verified; only the backlog sweep request failed: ${inlineCode(error.message)}. ` +
      'Re-run the failed jobs of this workflow run: that repeats only this request, without ' +
      `approval or deployment. Or run \`gh workflow run ${SWEEP_WORKFLOW} -f reason="${reason}"\`. ` +
      'A repeated reason is recorded once.';
    await report(core, 'Backlog sweep request', [text], 'Backlog sweep request failed');
    return { ok: false };
  }
  await report(core, 'Backlog sweep request', [
    `Requested a backlog sweep through \`${SWEEP_WORKFLOW}\` with the reason \`${reason}\`.`,
  ]);
  return { ok: true, reason };
}
