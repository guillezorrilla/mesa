// Board placement's paired-workflow material (#677): the kelp-ledger tasks, each stopped once
// partway for a person. A question task's convention is the person's call, written nowhere in the
// project, so the agent has to ask, and the person's fixed answer is its note's convention. A
// permission task's convention is kept only in scripts/policy.mjs, encoded so reading the file does
// not give it: the agent has to run it, and Codex asks first (a `prompt` rule for that command in
// the temporary CODEX_HOME). The hidden tests are the relevance tasks', which check the convention.
// Everything here is invented.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { convention, freshProject, hiddenTest, notes, TASKS } from '../harness.mjs';

/** The command a permission task runs, which Codex is told to ask about (`prefix_rule`). */
export const POLICY_COMMAND = ['node', 'scripts/policy.mjs'];
const KEY = 'kelp-ledger';

/** What the person types when the Board shows the session waiting on a question. */
export const answer = (task) =>
  task.supervision.stop === 'question' ? convention(task) : 'Yes, go ahead.';

/** The task as the session's goal, with where its convention is. */
export function prompt(task) {
  const { stop, topic } = task.supervision;
  return stop === 'question'
    ? `${task.prompt} How it should behave is my call and is written nowhere in the project: before you write any code, ask me, then wait for my answer.`
    : `${task.prompt} How it should behave is the ledger's policy, kept only in scripts/policy.mjs: before you write any code, print it with \`${POLICY_COMMAND.join(' ')} ${topic}\` (run exactly that command).`;
}

const xor = (bytes) => bytes.map((b, i) => b ^ KEY.charCodeAt(i % KEY.length));

/** scripts/policy.mjs: each permission task's convention by its topic, encoded. */
export function policyScript(tasks = TASKS) {
  const all = notes();
  const policies = Object.fromEntries(
    tasks
      .filter((t) => t.supervision.stop === 'permission')
      .map((t) => [t.supervision.topic, xor(Buffer.from(convention(t, all))).toString('hex')]),
  );
  return `// The ledger's policies, by topic: node scripts/policy.mjs <topic>
const KEY = ${JSON.stringify(KEY)};
const POLICIES = ${JSON.stringify(policies, null, 2)};
const topic = process.argv[2];
const hex = POLICIES[topic];
if (!hex) {
  console.error(\`no policy for \${topic}; topics: \${Object.keys(POLICIES).join(', ')}\`);
  process.exit(1);
}
const bytes = Buffer.from(hex, 'hex').map((b, i) => b ^ KEY.charCodeAt(i % KEY.length));
console.log(bytes.toString());
`;
}

/**
 * `dir` as a fresh kelp-ledger with the policy script, committed once; without the paired-task
 * skill where Codex reads skills, as the task is the session's goal itself.
 */
export const supervisionProject = (dir) =>
  freshProject(dir, 'claude', { 'scripts/policy.mjs': policyScript() });

/** Whether `task`'s hidden test passes on a copy of project `dir`, which the agent never sees. */
export function solvedOnCopy(dir, task) {
  const copy = mkdtempSync(join(tmpdir(), 'paired-hidden-'));
  try {
    cpSync(dir, copy, { recursive: true, filter: (src) => basename(src) !== '.git' });
    return hiddenTest(copy, task).passed;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}
