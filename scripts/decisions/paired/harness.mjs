// The paired-workflow harness's invented material (ADR-0019, #465): the kelp-ledger project, its
// ten project notes (six hold a task's convention, four are distractors), and six tasks, each
// with a hidden node:test that checks behaviour and the convention, a reference solution that
// passes it and a naive, convention-blind one that fails it. Everything here is invented.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
export const TEMPLATE = join(HERE, 'project');
export const NOTES = join(HERE, 'notes');
export const PROJECT = 'kelp-ledger';

/** Every task: its id, the file it changes, the note holding its convention, and its prompt. */
export const TASKS = readdirSync(join(HERE, 'tasks'))
  .sort()
  .map((id) => {
    const dir = join(HERE, 'tasks', id);
    return { id, dir, ...JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8')) };
  });

/** The project notes: file name and text, each with `project: kelp-ledger` frontmatter. */
export const notes = () =>
  readdirSync(NOTES)
    .sort()
    .map((name) => ({ name, text: readFileSync(join(NOTES, name), 'utf8') }));

const git = (dir, ...args) =>
  spawnSync('git', ['-c', 'user.name=paired', '-c', 'user.email=paired@invalid', ...args], {
    cwd: dir,
    stdio: 'ignore',
  });

/**
 * `dir` as a fresh copy of the project, committed once: every run starts from the same tree. Its
 * package.json is kept as package.json.template, so Mesa's release version check passes it by.
 */
export function freshProject(dir) {
  rmSync(dir, { recursive: true, force: true });
  cpSync(TEMPLATE, dir, { recursive: true });
  renameSync(join(dir, 'package.json.template'), join(dir, 'package.json'));
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'kelp-ledger');
}

/**
 * Runs `task`'s hidden test in project `dir` (copied in only now, so the agent never saw it):
 * whether it passed, and the end of its output.
 */
export function hiddenTest(dir, task, timeoutMs = 60_000) {
  const hidden = join(dir, '.hidden');
  mkdirSync(hidden, { recursive: true });
  const file = join(hidden, `${task.id}.test.mjs`);
  writeFileSync(file, readFileSync(join(task.dir, 'hidden.test.mjs')));
  const run = spawnSync(process.execPath, ['--test', file], {
    cwd: dir,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  rmSync(hidden, { recursive: true, force: true });
  return { passed: run.status === 0, tail: `${run.stdout}${run.stderr}`.trim().slice(-400) };
}

/** Writes `task`'s reference or naive solution over its file in project `dir`. */
export function solve(dir, task, which) {
  writeFileSync(join(dir, task.file), readFileSync(join(task.dir, `${which}.js`)));
}

/**
 * Proves the material: in a fresh project every hidden test fails as given, passes with its
 * reference solution and fails with its naive one; every task names a note that exists and
 * states its convention within the first 200 characters Mesa sends; there are ten notes.
 */
export function selfCheck(work) {
  const all = notes();
  const rows = TASKS.map((task) => {
    const dir = join(work, task.id);
    freshProject(dir);
    const stub = hiddenTest(dir, task).passed;
    solve(dir, task, 'reference');
    const reference = hiddenTest(dir, task).passed;
    solve(dir, task, 'naive');
    const naive = hiddenTest(dir, task).passed;
    rmSync(dir, { recursive: true, force: true });
    const note = all.find((n) => n.name === `${task.note}.md`);
    // As Mesa excerpts a source (decisions/context.ts): the body without headings, 200 at most.
    const body = note?.text.split('---')[2] ?? '';
    const excerpt = body
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .join(' ');
    const fits = Boolean(note) && excerpt.length <= 200;
    const ok = !stub && reference && !naive && fits;
    return { task: task.id, stub, reference, naive, note: fits, ok };
  });
  return { notes: all.length, tasks: rows, ok: all.length === 10 && rows.every((r) => r.ok) };
}
