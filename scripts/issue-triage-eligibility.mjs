// Issue triage eligibility: the deterministic guard of
// .github/workflows/issue-triage.md. It runs in the gh-aw pre-activation job,
// before Copilot is invoked, for both the `issues.opened` trigger and a manual
// `workflow_dispatch` with an `issue_number` input. Only an eligible Issue
// activates the agent; every other run stops here without invoking AI or
// commenting.
//
// An Issue is eligible when it is an open Issue of this repository, opened by
// a user who currently has write, maintain or admin access, and has no AI
// triage recommendation yet. A recommendation is whatever `findTriageComments`
// recognizes, the same definition backlog promotion uses.

import { findTriageComments, inlineCode } from './backlog-promotion.mjs';

// The legacy `permission` field reports `maintain` as `write`, so these two
// cover the write, maintain and admin roles.
const TRIAGE_PERMISSIONS = ['admin', 'write'];

// A stop that is not an error: the Issue already has its recommendation.
const TRIAGED = 'triaged';
// A target that cannot be triaged: invalid input or an ineligible Issue.
const REFUSED = 'refused';

const stop = (kind, reason) => ({ eligible: false, kind, reason });

// The Issue a run is about: the opened Issue, or the dispatch input. The input
// must be a canonical positive integer, because the workflow's per-Issue
// concurrency group and the comment target both use it as written.
export function targetIssue(context) {
  if (context.eventName === 'issues') {
    const number = context.payload.issue?.number;
    return Number.isSafeInteger(number) && number > 0
      ? { number }
      : stop(REFUSED, 'The `issues` event carries no valid Issue number.');
  }
  if (context.eventName !== 'workflow_dispatch') {
    return stop(REFUSED, `Issue triage does not run on \`${context.eventName}\` events.`);
  }
  const inputs = context.payload.inputs ?? {};
  // gh-aw adds `aw_context` to every dispatchable workflow for its own
  // workflow-to-workflow relays, which this repository does not use. A value in
  // it would put a second, possibly different Issue number into the agent's
  // context, so a manual run takes `issue_number` alone.
  if (String(inputs.aw_context ?? '').trim() !== '') {
    return stop(REFUSED, 'Manual triage takes only `issue_number`; leave `aw_context` empty.');
  }
  const raw = inputs.issue_number;
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (typeof text !== 'string' || !/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) {
    return stop(
      REFUSED,
      `\`issue_number\` must be a positive whole number without leading zeros, not ${inlineCode(raw ?? '')}.`,
    );
  }
  return { number: Number(text) };
}

async function repositoryPermission(github, owner, repo, username) {
  try {
    const { data } = await github.request(
      'GET /repos/{owner}/{repo}/collaborators/{username}/permission',
      { owner, repo, username },
    );
    return data.permission;
  } catch (error) {
    if (error.status === 404) return 'none';
    throw error;
  }
}

const sameRepository = (url, owner, repo) =>
  typeof url === 'string' && url.toLowerCase().endsWith(`/repos/${owner}/${repo}`.toLowerCase());

// Every check, in order, against the Issue as it is now.
export async function checkEligibility({ github, context }) {
  const target = targetIssue(context);
  if (target.eligible === false) return target;
  const { number } = target;
  const { owner, repo } = context.repo;
  const refuse = (reason) => ({ ...stop(REFUSED, reason), issueNumber: number });

  let issue;
  try {
    ({ data: issue } = await github.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo,
      issue_number: number,
    }));
  } catch (error) {
    // 404 also covers an Issue the token cannot see. Anything else, such as a
    // rate limit, is an error rather than an answer.
    if (error.status !== 404 && error.status !== 410) throw error;
    return refuse(`Issue #${number} does not exist in ${owner}/${repo} or is not accessible.`);
  }
  // A transferred Issue redirects to its new repository; triage stays here.
  if (issue.number !== number || !sameRepository(issue.repository_url, owner, repo)) {
    return refuse(`Issue #${number} is no longer an Issue of ${owner}/${repo}.`);
  }
  if (issue.pull_request) {
    return refuse(`#${number} is a pull request, not an Issue.`);
  }
  if (issue.state !== 'open') {
    return refuse(`Issue #${number} is closed; only open Issues are triaged.`);
  }
  const author = issue.user?.login;
  if (!author) {
    return refuse(`Issue #${number} has no author account (it was deleted).`);
  }
  if (issue.user.type !== 'User') {
    return refuse(
      `Issue #${number} was opened by ${inlineCode(author)}, a ${issue.user.type ?? 'non-user'} ` +
        'account; only Issues opened by a user with write access are triaged.',
    );
  }
  const permission = await repositoryPermission(github, owner, repo, author);
  if (!TRIAGE_PERMISSIONS.includes(permission)) {
    return refuse(
      `Issue #${number} was opened by ${inlineCode(author)}, who has ${inlineCode(permission)} ` +
        'access; only Issues opened by someone with write, maintain or admin access are triaged.',
    );
  }

  const comments = await github.paginate(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: number, per_page: 100 },
  );
  const triage = findTriageComments(comments, `${owner}/${repo}`);
  if (triage.length > 0) {
    return {
      ...stop(
        TRIAGED,
        `Issue #${number} already has a triage recommendation ` +
          `(${triage.map((comment) => comment.html_url).join(', ')}); nothing to do.`,
      ),
      issueNumber: number,
    };
  }
  return { eligible: true, issueNumber: number, issue };
}

// The Issue text as gh-aw's own `issues` event handling builds it.
export function issueText(issue) {
  return `${issue.title ?? ''}\n\n${issue.body ?? ''}`;
}

// Entry point for actions/github-script. `sanitize` is gh-aw's
// `sanitizeIncomingText`, the function that cleans the Issue text of an
// `issues` event before it reaches the prompt; a manual run hands the agent the
// selected Issue's current text through it. On `issues` events the prompt keeps
// using gh-aw's own sanitized event text, so this text output stays empty.
export async function run({ github, context, core, sanitize }) {
  const manual = context.eventName === 'workflow_dispatch';
  let result;
  let text = '';
  try {
    result = await checkEligibility({ github, context });
    if (result.eligible && manual) {
      if (typeof sanitize !== 'function') throw new Error('no sanitizer for the Issue text');
      text = sanitize(issueText(result.issue));
    }
  } catch (error) {
    const reason = `The eligibility check failed: ${inlineCode(error.message)}.`;
    result = { ...stop(REFUSED, reason), error: true };
    text = '';
  }

  core.setOutput('eligible', String(result.eligible));
  core.setOutput('issue_number', result.issueNumber ? String(result.issueNumber) : '');
  core.setOutput('issue_text', text);

  const subject = result.issueNumber ? `Issue #${result.issueNumber}` : 'This run';
  const outcome = result.eligible
    ? `${subject} is eligible for triage.`
    : `${result.reason} Copilot was not invoked and nothing was posted.`;
  await core.summary.addRaw(`## Issue triage eligibility\n\n${outcome}\n`).write();

  // A manual run that cannot proceed fails, so whoever dispatched it sees why.
  // The automatic trigger routinely meets ineligible Issues and only notes it.
  if (result.eligible || result.kind === TRIAGED || (!manual && !result.error)) {
    core.notice(outcome);
  } else {
    core.setFailed(outcome);
  }
  return {
    outcome: result.eligible ? 'eligible' : result.kind,
    issueNumber: result.issueNumber,
    reason: result.reason,
    text,
  };
}
