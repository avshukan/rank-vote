// Backlog promotion: turns an Issue whose triage recommendation the repository
// owner accepted (the `triage: accepted` label) into new `Todo` rows of
// docs/backlog.md and opens a pull request for the owner to review and merge.
// .github/workflows/backlog-promotion.yml calls `run` through
// actions/github-script; the pure helpers are exported for the tests.
//
// The recommendation is used exactly as written and never re-evaluated. Every
// check runs before the first write, so a refusal leaves the repository
// untouched and tells the owner on the Issue how to recover.

export const ACCEPTED_LABEL = 'triage: accepted';
export const BACKLOG_PATH = 'docs/backlog.md';

const TRIAGE_AUTHOR = 'github-actions[bot]';
const TRIAGE_WORKFLOW_ID = 'issue-triage';
const TRIAGE_HEADING = '## Triage recommendation';
const NEW_ITEM_STATE = '—';
const ENTRY_FIELDS = ['Title', 'Type', 'Level', 'State', 'Notes'];
const DEPENDENCIES_FIELD = 'Dependencies / context';
const TABLE_COLUMNS = {
  Todo: ['ID', 'Title', 'Type', 'Level', 'State', 'Notes'],
  Done: ['ID', 'Title', 'Type', 'Level', 'Notes'],
  Cancelled: ['ID', 'Title', 'Type', 'Level', 'Notes'],
};
const REPORT_MARKER = '<!-- backlog-promotion-report -->';

// A backlog cell must stay one terminal column per character, or the fixed
// widths stop lining up: no control, format or combining characters, no emoji
// and no East Asian wide characters.
const NOT_ONE_COLUMN =
  /[\p{C}\p{M}\p{Extended_Pictographic}ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦\u{10000}-\u{10FFFF}]/u;

// A closing keyword in the promotion's title or commit would close an unrelated
// Issue when the pull request merges.
const CLOSING_REFERENCE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:[\w.-]+\/[\w.-]+#\d+|#\d+|https?:\/\/\S+\/(?:issues|pull)\/\d+)/i;

export function promotionBranch(issueNumber) {
  return `docs/backlog-promote-${issueNumber}`;
}

// A reason to stop without promoting. `noop` means the promotion already
// exists; `refused` means it cannot proceed safely. Both reach the Issue with
// a concrete recovery action.
export class PromotionStop extends Error {
  constructor(kind, reason, recovery, { untouched = true } = {}) {
    super(reason);
    this.kind = kind;
    this.reason = reason;
    this.recovery = recovery;
    this.untouched = untouched;
  }
}

const refuse = (reason, recovery, options) =>
  new PromotionStop('refused', reason, recovery, options);
const noop = (reason, recovery) => new PromotionStop('noop', reason, recovery);

function retryHint(issueNumber) {
  return (
    `remove and re-apply the \`${ACCEPTED_LABEL}\` label (or run the **Backlog promotion** ` +
    `workflow from the Actions tab with \`issue: ${issueNumber}\` and \`dry_run\` unchecked).`
  );
}

const charLength = (text) => [...text].length;

export function inlineCode(text) {
  const value = String(text).replace(/\s+/g, ' ');
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = '`'.repeat(longest + 1);
  const padding = /^`|`$/.test(value) ? ' ' : '';
  return `${fence}${padding}${value}${padding}${fence}`;
}

function codeBlock(text) {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

const bullets = (items) => items.map((item) => `- ${item}`).join('\n');

// ---------------------------------------------------------------------------
// docs/backlog.md

function splitRow(line) {
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function pad(value, width, right) {
  const fill = ' '.repeat(Math.max(0, width - charLength(value)));
  return right ? fill + value : value + fill;
}

export function renderRow(columns, values) {
  const cells = columns.map((column, index) => pad(values[index], column.width, column.right));
  return `| ${cells.join(' | ')} |`;
}

// The separator row under a table header is its ruler: each column is as wide
// as its dashes, and a trailing colon right-aligns it.
function tableAfter(lines, headingIndex, name) {
  let header = headingIndex + 1;
  while (header < lines.length && !lines[header].startsWith('|')) {
    if (lines[header].startsWith('#')) break;
    header += 1;
  }
  if (!lines[header]?.startsWith('|')) {
    throw new Error(`${BACKLOG_PATH}: the \`${name}\` section has no table`);
  }
  const ruler = splitRow(lines[header + 1] ?? '');
  if (!ruler.every((cell) => /^:?-+:?$/.test(cell))) {
    throw new Error(`${BACKLOG_PATH}: the \`${name}\` table has no separator row under its header`);
  }
  const names = splitRow(lines[header]);
  if (names.length !== ruler.length) {
    throw new Error(`${BACKLOG_PATH}: the \`${name}\` header and separator rows differ in columns`);
  }
  const columns = names.map((columnName, index) => ({
    name: columnName,
    width: ruler[index].length,
    right: ruler[index].endsWith(':') && !ruler[index].startsWith(':'),
  }));
  const rows = [];
  let line = header + 2;
  while (line < lines.length && lines[line].startsWith('|')) {
    rows.push({ line, text: lines[line], cells: splitRow(lines[line]) });
    line += 1;
  }
  return {
    name,
    header,
    headerText: lines[header],
    ignored: lines[header - 1] === '<!-- prettier-ignore -->',
    columns,
    rows,
    end: line,
  };
}

function sectionTable(lines, name) {
  const heading = lines.indexOf(`## ${name}`);
  if (heading === -1) throw new Error(`${BACKLOG_PATH} has no \`## ${name}\` section`);
  return tableAfter(lines, heading, name);
}

function legendValues(lines, name) {
  const legend = lines.indexOf('## Legend');
  const heading = legend === -1 ? -1 : lines.indexOf(`### ${name}`, legend);
  if (heading === -1) throw new Error(`${BACKLOG_PATH} has no \`### ${name}\` Legend table`);
  return tableAfter(lines, heading, name).rows.map((row) => row.cells[0]);
}

export function parseBacklog(text) {
  const lines = text.split('\n');
  return {
    lines,
    legend: {
      Type: legendValues(lines, 'Type'),
      Level: legendValues(lines, 'Level'),
      State: legendValues(lines, 'State'),
    },
    todo: sectionTable(lines, 'Todo'),
    done: sectionTable(lines, 'Done'),
    cancelled: sectionTable(lines, 'Cancelled'),
  };
}

const backlogTables = (backlog) => [backlog.todo, backlog.done, backlog.cancelled];

// The `Format` rules of docs/backlog.md for its `Todo`, `Done` and `Cancelled`
// tables.
export function lintBacklog(text) {
  let backlog;
  try {
    backlog = parseBacklog(text);
  } catch (error) {
    return [error.message];
  }
  const problems = [];
  const seenIds = new Map();
  const ruler = (table) => backlog.lines[table.header + 1];
  for (const table of backlogTables(backlog)) {
    const at = (line) => `${table.name} line ${line + 1}`;
    const names = table.columns.map((column) => column.name);
    if (names.join('|') !== TABLE_COLUMNS[table.name].join('|')) {
      problems.push(
        `${table.name}: columns are ${names.join(', ')}, expected ${TABLE_COLUMNS[table.name].join(', ')}`,
      );
      continue;
    }
    // `Cancelled` has the exact shape of `Done`, widths included.
    if (table === backlog.cancelled && ruler(table) !== ruler(backlog.done)) {
      problems.push(`${at(table.header + 1)}: the separator row differs from the \`Done\` table's`);
    }
    if (!table.ignored) {
      problems.push(`${table.name}: the table must be preceded by \`<!-- prettier-ignore -->\``);
    }
    if (table.headerText !== renderRow(table.columns, names)) {
      problems.push(`${at(table.header)}: the header row is not padded to the separator row`);
    }
    const column = Object.fromEntries(names.map((name, index) => [name, index]));
    for (const row of table.rows) {
      if (!row.text.endsWith('|') || row.cells.length !== names.length) {
        problems.push(`${at(row.line)}: expected ${names.length} cells`);
        continue;
      }
      const overflowing = table.columns.filter(
        (tableColumn, index) => charLength(row.cells[index]) > tableColumn.width,
      );
      for (const tableColumn of overflowing) {
        const length = charLength(row.cells[column[tableColumn.name]]);
        problems.push(
          `${at(row.line)}: ${tableColumn.name} is ${length} characters; the column fits ${tableColumn.width}`,
        );
      }
      if (overflowing.length === 0 && row.text !== renderRow(table.columns, row.cells)) {
        problems.push(`${at(row.line)}: cells are not padded to the column widths`);
      }
      const id = row.cells[column.ID];
      if (!/^[1-9]\d*$/.test(id)) {
        problems.push(`${at(row.line)}: ID ${inlineCode(id)} is not a positive integer`);
      } else if (seenIds.has(id)) {
        problems.push(`${at(row.line)}: ID ${id} is already used on line ${seenIds.get(id) + 1}`);
      } else {
        seenIds.set(id, row.line);
      }
      for (const name of ['Type', 'Level', 'State']) {
        if (!(name in column)) continue;
        const value = row.cells[column[name]];
        if (!backlog.legend[name].includes(value)) {
          problems.push(`${at(row.line)}: ${name} ${inlineCode(value)} is not a Legend value`);
        }
      }
    }
  }
  return problems;
}

// Backlog IDs are never reused: the next one follows every ID on the default
// branch, cancelled items included, and every ID an open pull request is about
// to add.
export function nextIds(backlog, reservedIds, count) {
  const used = backlogTables(backlog)
    .flatMap((table) => table.rows)
    .map((row) => Number(row.cells[0]))
    .concat(reservedIds)
    .filter(Number.isInteger);
  const first = Math.max(0, ...used) + 1;
  return Array.from({ length: count }, (_, index) => first + index);
}

export function addedRowIds(patch) {
  return [...patch.matchAll(/^\+\|\s*(\d+)\s*\|/gm)].map(([, id]) => Number(id));
}

// New rows go to the end of `Todo`, so two promotions opened side by side
// conflict on merge instead of landing silently.
export function appendTodoRows(backlog, entries) {
  const { todo } = backlog;
  const rows = entries.map((entry) =>
    renderRow(
      todo.columns,
      todo.columns.map((column) => entry[column.name]),
    ),
  );
  const lines = [...backlog.lines];
  lines.splice(todo.end, 0, ...rows);
  return { rows, text: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// The triage recommendation

// Only comments the issue-triage workflow posted count: its bot identity, its
// heading and both markers gh-aw appends to what it posts.
export function findTriageComments(comments, repository) {
  const callMarker = `<!-- gh-aw-workflow-call-id: ${repository}/${TRIAGE_WORKFLOW_ID} -->`;
  const runMarker = new RegExp(
    `<!-- gh-aw-agentic-workflow: [^\\n]*\\bworkflow_id: ${TRIAGE_WORKFLOW_ID},`,
  );
  return comments.filter(
    ({ user, body }) =>
      user?.login === TRIAGE_AUTHOR &&
      user?.type === 'Bot' &&
      typeof body === 'string' &&
      body.trimStart().startsWith(TRIAGE_HEADING) &&
      body.includes(callMarker) &&
      runMarker.test(body),
  );
}

export function parseTriage(body) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const verdicts = lines
    .map((line) => line.match(/^\*\*Verdict:\*\*\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, verdict]) => verdict);
  const entries = [];
  const duplicates = [];
  let current = null;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      current = /^###\s+Candidate backlog entry\s*$/.test(line) ? {} : null;
      if (current) entries.push(current);
      continue;
    }
    const field = current && line.match(/^\s*[-*]\s+\*\*(.+?):\*\*\s*(.*?)\s*$/);
    if (!field) continue;
    const [, name, value] = field;
    if (![...ENTRY_FIELDS, DEPENDENCIES_FIELD].includes(name)) continue;
    if (name in current) duplicates.push({ entry: entries.length, name });
    current[name] = value;
  }
  return { verdicts, entries, duplicates };
}

function cellProblems(label, name, value, width) {
  const problems = [];
  if (value.includes('|')) {
    problems.push(
      `${label}: ${name} contains \`|\`, which would split the table cell: ${inlineCode(value)}`,
    );
  }
  if (NOT_ONE_COLUMN.test(value)) {
    problems.push(
      `${label}: ${name} contains a character that is not one column wide (emoji, CJK or an invisible character): ${inlineCode(value)}`,
    );
  }
  if (CLOSING_REFERENCE.test(value)) {
    problems.push(
      `${label}: ${name} contains an issue-closing reference, which would close that Issue on merge: ${inlineCode(value)}`,
    );
  }
  const length = charLength(value);
  if (length > width) {
    problems.push(
      `${label}: ${name} is ${length} characters; the \`Todo\` ${name} column fits ${width}: ${inlineCode(value)}`,
    );
  }
  return problems;
}

// Checks the candidate entries against the backlog format without changing
// them: a value that does not fit is reported, never shortened.
export function validateEntries(parsed, backlog) {
  const problems = [];
  const { entries } = parsed;
  if (entries.length === 0) {
    problems.push('It has no `### Candidate backlog entry` section.');
  }
  for (const { entry, name } of parsed.duplicates) {
    problems.push(`Candidate entry ${entry} has more than one \`- **${name}:**\` line.`);
  }
  const widths = Object.fromEntries(
    backlog.todo.columns.map((column) => [column.name, column.width]),
  );
  entries.forEach((fields, index) => {
    const label =
      entries.length > 1
        ? `Candidate entry ${index + 1} of ${entries.length}`
        : 'The candidate entry';
    for (const name of ENTRY_FIELDS) {
      const value = fields[name];
      if (value === undefined) {
        problems.push(`${label} has no \`- **${name}:**\` line.`);
      } else if (value === '' || value === '…') {
        problems.push(`${label}: ${name} is empty.`);
      } else if (name === 'State') {
        if (value !== NEW_ITEM_STATE) {
          problems.push(
            `${label}: State is ${inlineCode(value)}; a new backlog item starts with \`—\`.`,
          );
        }
      } else if (name in backlog.legend && !backlog.legend[name].includes(value)) {
        problems.push(
          `${label}: ${name} ${inlineCode(value)} is not a Legend value (${backlog.legend[name].join(', ')}).`,
        );
      } else {
        problems.push(...cellProblems(label, name, value, widths[name]));
      }
    }
  });
  const valid = entries.map((fields) => ({
    Title: fields.Title,
    Type: fields.Type,
    Level: fields.Level,
    State: NEW_ITEM_STATE,
    Notes: fields.Notes,
    dependencies: fields[DEPENDENCIES_FIELD] ?? '',
  }));
  return { entries: valid, problems };
}

// ---------------------------------------------------------------------------
// Pull request and Issue texts

export function pullRequestTitle(issueNumber, entries) {
  return entries.length === 1
    ? `backlog: promote #${issueNumber} — ${entries[0].Title}`
    : `backlog: promote #${issueNumber} (${entries.length} items)`;
}

export function pullRequestBody({ issueNumber, entries, rows, comment, runUrl }) {
  const ids = entries.map((entry) => `ID-${entry.ID}`).join(', ');
  const split =
    entries.length > 1
      ? ' The recommendation splits the Issue, so each item gets its own row.'
      : '';
  const edited = comment.updated_at && comment.updated_at !== comment.created_at;
  return [
    '## What & why',
    '',
    `Promotes #${issueNumber} to the \`Todo\` backlog as ${ids}, exactly as its accepted ` +
      `[triage recommendation](${comment.html_url}) proposes; nothing was re-evaluated.${split}`,
    '',
    codeBlock(rows.join('\n')),
    '',
    'Dependencies / context from the recommendation:',
    '',
    bullets(
      entries.map(
        (entry) =>
          `ID-${entry.ID}: ${entry.dependencies ? inlineCode(entry.dependencies) : 'none given'}`,
      ),
    ),
    ...(edited
      ? [
          '',
          '_The triage comment was edited after the triage workflow posted it; this uses the edited text._',
        ]
      : []),
    '',
    '## Review',
    '',
    `Opened by a [Backlog promotion run](${runUrl}). CI on a pull request opened by ` +
      '`github-actions[bot]` starts only after someone with write access selects ' +
      "**Approve workflows to run**. Merging is the repository owner's decision; the " +
      `\`${ACCEPTED_LABEL}\` label stays on the Issue as a record.`,
    '',
    `Closes #${issueNumber}`,
    '',
    `<!-- backlog-promotion: issue=${issueNumber}; ids=${entries.map((entry) => entry.ID).join(',')}; triage-comment=${comment.id} -->`,
  ].join('\n');
}

export function reportComment(stop, runUrl) {
  const heading =
    stop.kind === 'noop' ? '### Backlog promotion: nothing to do' : '### Backlog promotion failed';
  const untouched =
    stop.kind === 'refused' && stop.untouched ? '\n\nNothing in the repository was changed.' : '';
  return [
    heading,
    '',
    `**Reason:** ${stop.reason}${untouched}`,
    '',
    `**Recovery:** ${stop.recovery}`,
    '',
    `<sub>[Backlog promotion run](${runUrl})</sub>`,
    '',
    REPORT_MARKER,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// GitHub

async function branchExists(github, owner, repo, branch) {
  try {
    await github.request(`GET /repos/{owner}/{repo}/git/ref/heads/${branch}`, { owner, repo });
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function reservedIds(github, owner, repo, issueNumber) {
  const pulls = await github.paginate('GET /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });
  const ids = [];
  for (const pull of pulls) {
    // Only branches of this repository: a fork cannot inflate the next ID.
    if (pull.head?.repo?.full_name !== `${owner}/${repo}`) continue;
    const files = await github.paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner,
      repo,
      pull_number: pull.number,
      per_page: 100,
    });
    const backlog = files.find((file) => file.filename === BACKLOG_PATH);
    if (!backlog) continue;
    if (typeof backlog.patch !== 'string') {
      throw refuse(
        `Open pull request #${pull.number} changes \`${BACKLOG_PATH}\`, but GitHub returned no diff ` +
          'for it, so the backlog IDs it adds cannot be reserved.',
        `Merge or close #${pull.number}, then ${retryHint(issueNumber)}`,
      );
    }
    ids.push(...addedRowIds(backlog.patch));
  }
  return ids;
}

async function senderPermission(github, owner, repo, username) {
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

// Every read and check, in order; returns what `applyPromotion` writes.
async function planPromotion({ github, context, issueNumber }) {
  const { owner, repo } = context.repo;
  const retry = retryHint(issueNumber);

  const sender = context.payload.sender?.login;
  const permission = sender ? await senderPermission(github, owner, repo, sender) : 'none';
  if (permission !== 'admin') {
    throw refuse(
      `${sender ? inlineCode(sender) : 'An unknown user'} started promotion with \`${permission}\` ` +
        'access; only a repository admin can promote an Issue to the backlog.',
      `A repository admin should ${retry}`,
    );
  }

  let issue;
  try {
    ({ data: issue } = await github.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo,
      issue_number: issueNumber,
    }));
  } catch (error) {
    if (error.status !== 404 && error.status !== 410) throw error;
    throw refuse(
      `Issue #${issueNumber} does not exist.`,
      'Run the workflow with an existing Issue number.',
    );
  }
  if (issue.pull_request) {
    throw refuse(
      `#${issueNumber} is a pull request, not an Issue.`,
      'Run the workflow with an Issue number.',
    );
  }
  if (issue.state !== 'open') {
    throw refuse(
      `Issue #${issueNumber} is closed; only open Issues are promoted.`,
      `Reopen the Issue, then ${retry}`,
    );
  }
  const labels = issue.labels.map((label) => (typeof label === 'string' ? label : label.name));
  if (!labels.includes(ACCEPTED_LABEL)) {
    throw refuse(
      `Issue #${issueNumber} does not carry the \`${ACCEPTED_LABEL}\` label.`,
      `Apply the \`${ACCEPTED_LABEL}\` label to accept the triage recommendation; that starts promotion.`,
    );
  }

  const branch = promotionBranch(issueNumber);
  const earlier = await github.paginate('GET /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    state: 'all',
    head: `${owner}:${branch}`,
    per_page: 100,
  });
  const open = earlier.find((pull) => pull.state === 'open');
  if (open) {
    throw noop(
      `Promotion pull request #${open.number} is already open for this Issue.`,
      `Nothing to do: review and merge #${open.number}. To redo the promotion instead, close ` +
        `#${open.number}, delete the \`${branch}\` branch, then ${retry}`,
    );
  }
  const merged = earlier.find((pull) => pull.merged_at);
  if (merged) {
    throw noop(
      `This Issue was already promoted by #${merged.number}, which is merged.`,
      `Nothing to do. Close this Issue if it is still open; merging #${merged.number} normally closes it.`,
    );
  }
  if (await branchExists(github, owner, repo, branch)) {
    const closed = earlier.length ? ` (left from closed pull request #${earlier[0].number})` : '';
    throw refuse(
      `The \`${branch}\` branch already exists${closed}.`,
      `Delete the \`${branch}\` branch, then ${retry}`,
    );
  }

  const comments = await github.paginate(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    },
  );
  const triage = findTriageComments(comments, `${owner}/${repo}`);
  if (triage.length === 0) {
    throw refuse(
      `Issue #${issueNumber} has no triage recommendation from the \`${TRIAGE_WORKFLOW_ID}\` workflow.`,
      'The Issue triage workflow comments only on eligible newly opened Issues. If its run for this ' +
        `Issue failed, re-run it from the Actions tab, then ${retry} Otherwise add the backlog row ` +
        'by hand in a docs pull request.',
    );
  }
  if (triage.length > 1) {
    throw refuse(
      `Issue #${issueNumber} has ${triage.length} triage recommendations from the ` +
        `\`${TRIAGE_WORKFLOW_ID}\` workflow (${triage.map((comment) => comment.html_url).join(', ')}); ` +
        'promotion needs exactly one.',
      `Delete the stale triage comments so that exactly one remains, then ${retry}`,
    );
  }
  const [comment] = triage;
  const link = `[triage comment](${comment.html_url})`;
  const parsed = parseTriage(comment.body);
  if (parsed.verdicts.length !== 1) {
    throw refuse(
      `The ${link} has ${parsed.verdicts.length} \`**Verdict:**\` lines; promotion needs exactly one.`,
      `Edit the ${link} so it has one \`**Verdict:** Keep\` line, then ${retry}`,
    );
  }
  if (parsed.verdicts[0] !== 'Keep') {
    throw refuse(
      `The triage verdict is ${inlineCode(parsed.verdicts[0])}; only \`Keep\` can be promoted.`,
      `If the recommendation stands, remove the \`${ACCEPTED_LABEL}\` label. To promote anyway, edit ` +
        `the ${link} to \`**Verdict:** Keep\` with a complete \`### Candidate backlog entry\` ` +
        `section, then ${retry}`,
    );
  }

  const base = context.payload.repository?.default_branch ?? 'main';
  const {
    data: { object: baseCommit },
  } = await github.request(`GET /repos/{owner}/{repo}/git/ref/heads/${base}`, { owner, repo });
  const { data: file } = await github.request(
    `GET /repos/{owner}/{repo}/contents/${BACKLOG_PATH}`,
    {
      owner,
      repo,
      ref: baseCommit.sha,
    },
  );
  const before = Buffer.from(file.content, 'base64').toString('utf8');
  const formatProblems = lintBacklog(before);
  if (formatProblems.length) {
    throw refuse(
      `\`${BACKLOG_PATH}\` on \`${base}\` does not follow its own \`Format\` rules, so a row cannot ` +
        `be added safely:\n\n${bullets(formatProblems)}`,
      `Fix \`${BACKLOG_PATH}\` on \`${base}\` in a docs pull request, then ${retry}`,
    );
  }
  const backlog = parseBacklog(before);
  const { entries, problems } = validateEntries(parsed, backlog);
  if (problems.length) {
    throw refuse(
      `The ${link} cannot be promoted as written:\n\n${bullets(problems)}`,
      `Edit the ${link} to fix the values above (promotion never shortens or rewrites them), then ${retry}`,
    );
  }

  const reserved = await reservedIds(github, owner, repo, issueNumber);
  const ids = nextIds(backlog, reserved, entries.length);
  const promoted = entries.map((entry, index) => ({ ...entry, ID: String(ids[index]) }));
  const { rows, text } = appendTodoRows(backlog, promoted);
  const afterProblems = lintBacklog(text);
  if (afterProblems.length) {
    throw new Error(`the promoted backlog breaks its own format: ${afterProblems.join('; ')}`);
  }

  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const title = pullRequestTitle(issueNumber, promoted);
  return {
    issueNumber,
    branch,
    base,
    baseSha: baseCommit.sha,
    blobSha: file.sha,
    text,
    rows,
    entries: promoted,
    comment,
    title,
    body: pullRequestBody({ issueNumber, entries: promoted, rows, comment, runUrl }),
  };
}

// The only writes: a new branch, one commit to docs/backlog.md and the pull
// request. If any of them fails, the branch is deleted again.
async function applyPromotion({ github, owner, repo, plan }) {
  const retry = retryHint(plan.issueNumber);
  try {
    await github.request('POST /repos/{owner}/{repo}/git/refs', {
      owner,
      repo,
      ref: `refs/heads/${plan.branch}`,
      sha: plan.baseSha,
    });
  } catch (error) {
    if (error.status !== 422) throw error;
    throw refuse(
      `The \`${plan.branch}\` branch appeared while promotion was running.`,
      `Check the Actions tab for another promotion run for this Issue. If there is none, delete the ` +
        `\`${plan.branch}\` branch, then ${retry}`,
    );
  }
  try {
    await github.request(`PUT /repos/{owner}/{repo}/contents/${BACKLOG_PATH}`, {
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
      base: plan.base,
      head: plan.branch,
      title: plan.title,
      body: plan.body,
    });
    return pull;
  } catch (error) {
    let cleanup = `The \`${plan.branch}\` branch it had created was deleted again.`;
    let untouched = true;
    try {
      await github.request(`DELETE /repos/{owner}/{repo}/git/refs/heads/${plan.branch}`, {
        owner,
        repo,
      });
    } catch (cleanupError) {
      cleanup =
        `Deleting the \`${plan.branch}\` branch it had created also failed: ` +
        `${inlineCode(cleanupError.message)}.`;
      untouched = false;
    }
    const steps = [];
    if (/not permitted to create or approve pull requests/i.test(error.message)) {
      steps.push(
        'a repository admin enables Settings → Actions → General → Workflow permissions → ' +
          '**Allow GitHub Actions to create and approve pull requests**',
      );
    }
    if (!untouched) steps.push(`delete the \`${plan.branch}\` branch`);
    const recovery = steps.length
      ? `${steps.join(', then ')}, then ${retry}`
      : `re-run the failed jobs of this workflow run from the Actions tab, or ${retry}`;
    throw refuse(
      `Writing the promotion failed: ${inlineCode(error.message)}. ${cleanup}`,
      recovery.charAt(0).toUpperCase() + recovery.slice(1),
      { untouched },
    );
  }
}

function summary({ issueNumber, dryRun, result, runUrl }) {
  const lines = [`## Backlog promotion of #${issueNumber}${dryRun ? ' (dry run)' : ''}`, ''];
  if (result.stop) {
    lines.push(reportComment(result.stop, runUrl));
    if (dryRun) lines.push('', '_Dry run: nothing was posted to the Issue._');
    return lines.join('\n');
  }
  const { plan, pull } = result;
  lines.push(
    pull
      ? `Opened [#${pull.number}](${pull.html_url}): ${plan.title}`
      : `Would open: ${plan.title}`,
    '',
    `Branch \`${plan.branch}\` from \`${plan.base}\` at \`${plan.baseSha.slice(0, 7)}\`; ` +
      `appends to \`Todo\` in \`${BACKLOG_PATH}\`:`,
    '',
    codeBlock(plan.rows.join('\n')),
  );
  if (dryRun) {
    lines.push('', '_Dry run: nothing was written or posted._', '', '### Pull request body', '');
    lines.push(codeBlock(plan.body));
  }
  return lines.join('\n');
}

export async function promote({ github, context, core, issueNumber, dryRun = false }) {
  const { owner, repo } = context.repo;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  let result;
  try {
    const plan = await planPromotion({ github, context, issueNumber });
    if (dryRun) {
      result = { outcome: 'dry-run', plan };
    } else {
      const pull = await applyPromotion({ github, owner, repo, plan });
      result = { outcome: 'promoted', plan, pull };
    }
  } catch (error) {
    const stop =
      error instanceof PromotionStop
        ? error
        : refuse(
            `Unexpected error: ${inlineCode(error.message)}.`,
            `Re-run the failed jobs of this workflow run from the Actions tab. If it keeps failing, ` +
              `fix the cause, then ${retryHint(issueNumber)}`,
          );
    result = { outcome: stop.kind, stop };
    if (!dryRun) {
      try {
        await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
          owner,
          repo,
          issue_number: issueNumber,
          body: reportComment(stop, runUrl),
        });
      } catch (commentError) {
        core.warning(`Could not report on #${issueNumber}: ${commentError.message}`);
      }
    }
  }

  const text = summary({ issueNumber, dryRun, result, runUrl });
  core.info(text);
  await core.summary.addRaw(text).write();
  if (result.outcome === 'refused') core.setFailed(result.stop.reason);
  else if (result.outcome === 'noop') core.notice(result.stop.reason);
  else if (result.outcome === 'promoted') core.notice(`Opened ${result.pull.html_url}`);
  else core.notice(`Dry run: #${issueNumber} would be promoted; nothing was changed.`);
  return result;
}

// Entry point for actions/github-script: the Issue comes from the `labeled`
// event, or from the inputs of a manual `workflow_dispatch` run.
export async function run({ github, context, core }) {
  const dispatch = context.eventName === 'workflow_dispatch';
  const inputs = context.payload.inputs ?? {};
  const issueNumber = Number(dispatch ? inputs.issue : context.payload.issue?.number);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    core.setFailed(`No valid Issue number in the ${context.eventName} event.`);
    return { outcome: 'invalid' };
  }
  const dryRun = dispatch && String(inputs.dry_run) === 'true';
  return promote({ github, context, core, issueNumber, dryRun });
}
