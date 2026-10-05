// Backlog sweep request: the common entry point that asks for a backlog sweep.
// .github/workflows/backlog-sweep.yml calls `run` through actions/github-script;
// the pure helpers are exported for the tests.
//
// It only requests and tracks sweeps, on the one Issue labelled `backlog-sweep`:
// open means a sweep is requested, closed means none is pending. The sweep
// itself is the backlog-sweep skill; nothing here runs it or closes the tracker.

import { createHash } from 'node:crypto';

import { inlineCode } from './backlog-promotion.mjs';

export const TRACKER_LABEL = 'backlog-sweep';
export const SKILL_PATH = '.claude/skills/backlog-sweep/SKILL.md';
export const WORKFLOW_FILE = 'backlog-sweep.yml';
export const PERIODIC_DAYS = 60;

const TRACKER_TITLE = 'Backlog sweep tracker';
const LABEL_COLOR = '5319e7';
const LABEL_DESCRIPTION = 'Reserved: the one tracker Issue for backlog sweep requests';
const REQUEST_AUTHOR = 'github-actions[bot]';
const DAY_MS = 24 * 60 * 60 * 1000;

// A reason to stop without changing anything, with the recovery step.
export class SweepStop extends Error {
  constructor(reason, recovery) {
    super(reason);
    this.reason = reason;
    this.recovery = recovery;
  }
}

// The reason is untrusted free text: it is shown as inline code, and only its
// digest goes into the hidden marker.
export function normalizeReason(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function reasonMarker(reason) {
  const digest = createHash('sha256').update(reason).digest('hex');
  return `<!-- backlog-sweep-request: ${digest} -->`;
}

// The workflow writes the marker as the last line of its comment. Only that
// line counts: the same text quoted anywhere else in a comment does not.
const markerLine = (body) => body.trimEnd().split(/\r?\n/).at(-1);

const isoDate = (time) => new Date(time).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Tracker and comment texts

function links({ serverUrl, owner, repo }) {
  const base = `${serverUrl}/${owner}/${repo}`;
  return {
    skill: `${base}/blob/HEAD/${SKILL_PATH}`,
    workflow: `${base}/actions/workflows/${WORKFLOW_FILE}`,
  };
}

export function trackerBody(urls) {
  const workflow = `[Backlog sweep request](${urls.workflow})`;
  return [
    `This Issue tracks backlog sweep requests. It is the only Issue with the \`${TRACKER_LABEL}\` ` +
      'label; keep it that way.',
    '',
    `- **Open:** a sweep is requested. Each comment from the ${workflow} workflow records why.`,
    '- **Closed:** no sweep is pending.',
    '',
    'The repository owner closes this Issue once the approved changes of a sweep have merged, or ' +
      'once they accept a no-change sweep, after checking that the latest reasons were covered. ' +
      "Nothing closes it automatically: a sweep's pull request links it without a closing keyword.",
    '',
    `The procedure is the [\`backlog-sweep\` skill](${urls.skill}). To request a sweep, run the ` +
      `${workflow} workflow with a \`reason\`.`,
  ].join('\n');
}

export function requestComment({ reason, source, runUrl }) {
  return [
    '### Backlog sweep requested',
    '',
    `**Reason:** ${inlineCode(reason)}`,
    '',
    `**Source:** ${source}`,
    '',
    `<sub>[Backlog sweep request run](${runUrl})</sub>`,
    '',
    reasonMarker(reason),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The periodic check

// Measured from the last closing, the last completed sweep. An open tracker
// already requests one, and with no tracker there is nothing to measure from.
export function periodicCheck(tracker, now) {
  if (!tracker) return { kind: 'no-tracker' };
  if (tracker.state === 'open') return { kind: 'pending' };
  const closed = Date.parse(tracker.closed_at);
  if (Number.isNaN(closed)) {
    throw new Error(`tracker #${tracker.number} is closed but has no closing time`);
  }
  const due = closed + PERIODIC_DAYS * DAY_MS;
  const closedOn = isoDate(closed);
  if (now.getTime() < due) return { kind: 'not-due', closedOn, dueOn: isoDate(due) };
  return {
    kind: 'due',
    closedOn,
    reason: `periodic check: the last sweep closed on ${closedOn}, ${PERIODIC_DAYS}+ days ago`,
  };
}

// ---------------------------------------------------------------------------
// GitHub

// Open and closed Issues with the label; the Issues API lists pull requests
// too, and they never count.
export async function findTrackers(github, owner, repo) {
  const issues = await github.paginate('GET /repos/{owner}/{repo}/issues', {
    owner,
    repo,
    labels: TRACKER_LABEL,
    state: 'all',
    per_page: 100,
  });
  return issues.filter((issue) => !issue.pull_request);
}

function singleTracker(trackers) {
  if (trackers.length <= 1) return trackers[0] ?? null;
  const list = trackers.map((issue) => `#${issue.number} (${issue.state})`).join(', ');
  throw new SweepStop(
    `${trackers.length} Issues carry the \`${TRACKER_LABEL}\` label: ${list}. Exactly one ` +
      'tracker is allowed, so nothing was changed.',
    `Remove the \`${TRACKER_LABEL}\` label from all but the one tracker to keep, then re-run ` +
      'this workflow.',
  );
}

async function ensureLabel(github, owner, repo) {
  try {
    await github.request('GET /repos/{owner}/{repo}/labels/{name}', {
      owner,
      repo,
      name: TRACKER_LABEL,
    });
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await github.request('POST /repos/{owner}/{repo}/labels', {
    owner,
    repo,
    name: TRACKER_LABEL,
    color: LABEL_COLOR,
    description: LABEL_DESCRIPTION,
  });
}

// When the tracker was last opened: its latest reopening, or its creation.
async function openedAt(github, owner, repo, tracker) {
  const events = await github.paginate('GET /repos/{owner}/{repo}/issues/{issue_number}/events', {
    owner,
    repo,
    issue_number: tracker.number,
    per_page: 100,
  });
  return Math.max(
    Date.parse(tracker.created_at),
    ...events
      .filter((event) => event.event === 'reopened')
      .map((event) => Date.parse(event.created_at)),
  );
}

// A retry of the same request finds its own comment from the current opening.
async function alreadyRecorded(github, owner, repo, tracker, reason) {
  const since = await openedAt(github, owner, repo, tracker);
  const comments = await github.paginate(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    {
      owner,
      repo,
      issue_number: tracker.number,
      since: new Date(since).toISOString(),
      per_page: 100,
    },
  );
  const marker = reasonMarker(reason);
  return comments.some(
    ({ user, body, created_at: createdAt }) =>
      user?.login === REQUEST_AUTHOR &&
      user?.type === 'Bot' &&
      Date.parse(createdAt) >= since &&
      typeof body === 'string' &&
      markerLine(body) === marker,
  );
}

// The only writes: the label and the tracker when there is none, reopening a
// closed tracker, and one reason comment. Reopening comes first, so repeating
// a request whose comment failed still records its reason: a re-run of a
// dispatched request, or a manual request with the reason of a failed periodic
// check (`periodicFailure`).
async function requestSweep({ github, owner, repo, tracker, reason, source, runUrl, urls }) {
  let outcome;
  if (!tracker) {
    await ensureLabel(github, owner, repo);
    ({ data: tracker } = await github.request('POST /repos/{owner}/{repo}/issues', {
      owner,
      repo,
      title: TRACKER_TITLE,
      body: trackerBody(urls),
      labels: [TRACKER_LABEL],
    }));
    outcome = 'created';
  } else if (tracker.state === 'closed') {
    await github.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo,
      issue_number: tracker.number,
      state: 'open',
    });
    outcome = 'reopened';
  } else if (await alreadyRecorded(github, owner, repo, tracker, reason)) {
    return { outcome: 'already-recorded', tracker };
  } else {
    outcome = 'recorded';
  }
  await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
    owner,
    repo,
    issue_number: tracker.number,
    body: requestComment({ reason, source, runUrl }),
  });
  return { outcome, tracker };
}

// ---------------------------------------------------------------------------
// Entry points

function describe(result) {
  const tracker = result.tracker
    ? `[#${result.tracker.number}](${result.tracker.html_url})`
    : 'The tracker';
  switch (result.outcome) {
    case 'created':
      return `Created the tracker ${tracker} and recorded the reason.`;
    case 'reopened':
      return `Reopened the tracker ${tracker} and recorded the reason.`;
    case 'recorded':
      return `The tracker ${tracker} was already open; recorded the reason.`;
    case 'already-recorded':
      return `The tracker ${tracker} already records this reason since it was last opened; nothing was added.`;
    case 'no-tracker':
      return (
        'No tracker exists yet, so there is no completed sweep to measure from; nothing was ' +
        'requested. The first explicit request creates it.'
      );
    case 'pending':
      return `The tracker ${tracker} is open: a sweep is already requested, so nothing was added.`;
    case 'not-due':
      return `The tracker ${tracker} was closed on ${result.closedOn}; the periodic check is due on ${result.dueOn}.`;
    default:
      return `${result.stop.reason}\n\n**Recovery:** ${result.stop.recovery}`;
  }
}

async function report(core, heading, result) {
  const text = [`## Backlog sweep request: ${heading}`, '', describe(result)].join('\n');
  core.info(text);
  await core.summary.addRaw(text).write();
  if (result.outcome === 'refused') core.setFailed(result.stop.reason);
  else core.notice(describe(result));
  return result;
}

// A periodic request that fails after its reason is known cannot be repeated by
// re-running the scheduled job: once the tracker was reopened, the re-run finds
// it open and adds nothing. The manual entry point records the same reason
// whether the tracker is open or still closed.
function periodicFailure(reason, error) {
  const command = `gh workflow run ${WORKFLOW_FILE} -f reason="${reason}"`;
  return new SweepStop(
    `Requesting the periodic sweep failed: ${inlineCode(error.message)}. The tracker may now be ` +
      `open without its reason, which was ${inlineCode(reason)}.`,
    'Re-running this scheduled job does not record the reason: once the tracker is open, the ' +
      'periodic check adds nothing. Request the sweep manually with exactly that reason: run ' +
      `${inlineCode(command)}, or **Run workflow** on _Backlog sweep request_ in the Actions tab ` +
      'with that `reason`. A reason the tracker already records is not added again.',
  );
}

async function attempt(work) {
  try {
    return await work();
  } catch (error) {
    const stop =
      error instanceof SweepStop
        ? error
        : new SweepStop(
            `Unexpected error: ${inlineCode(error.message)}.`,
            'Re-run the failed jobs of this workflow run from the Actions tab.',
          );
    return { outcome: 'refused', stop };
  }
}

// Entry point for actions/github-script: an explicit request through
// `workflow_dispatch`, or the weekly periodic check through `schedule`.
export async function run({ github, context, core, now = new Date() }) {
  const { owner, repo } = context.repo;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const urls = links({ serverUrl: context.serverUrl, owner, repo });

  if (context.eventName === 'workflow_dispatch') {
    const reason = normalizeReason(context.payload.inputs?.reason);
    if (!reason) {
      core.setFailed('The `reason` input is empty; a sweep request must say why it is made.');
      return { outcome: 'invalid' };
    }
    const result = await attempt(async () => {
      const tracker = singleTracker(await findTrackers(github, owner, repo));
      const source = `manual request by ${inlineCode(context.actor ?? 'unknown')}`;
      return requestSweep({ github, owner, repo, tracker, reason, source, runUrl, urls });
    });
    return report(core, 'request', result);
  }

  if (context.eventName === 'schedule') {
    const result = await attempt(async () => {
      const tracker = singleTracker(await findTrackers(github, owner, repo));
      const check = periodicCheck(tracker, now);
      if (check.kind !== 'due') return { outcome: check.kind, tracker, ...check };
      const source = 'weekly periodic check';
      try {
        return await requestSweep({
          github,
          owner,
          repo,
          tracker,
          reason: check.reason,
          source,
          runUrl,
          urls,
        });
      } catch (error) {
        throw periodicFailure(check.reason, error);
      }
    });
    return report(core, 'periodic check', result);
  }

  core.setFailed(`Unsupported event \`${context.eventName}\`; use workflow_dispatch or schedule.`);
  return { outcome: 'invalid' };
}
