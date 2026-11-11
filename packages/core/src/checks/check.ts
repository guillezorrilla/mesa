import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { shortId } from '../lib/ids.js';
import { MesaError } from '../lib/result.js';
import { resolveCheckout } from '../projects/checkout.js';
import { readProjectFile } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import { sessionFolder } from '../sessions/record/folder.js';
import { callerOf } from '../sessions/window/caller.js';
import type { CheckResult } from './check-text.js';

// A project's checks run for an agent (CONTEXT.md, Check): one line when they pass, only the
// errors and the log's path when they fail, so the build and test output is not reread every turn
// (docs/spikes/token-usage.md, from Spotify's verifiers).

/** How long a check may run unless told otherwise: 20 minutes. */
export const CHECK_TIMEOUT_SECONDS = 1_200;

/** A line that reads as an error in common build, test and lint output. */
const ERROR_LINE = /error|fail|✗|×|panic|traceback|expected|TS\d{4}/i;
const MAX_LINES = 40;
const MAX_CHARS = 4_000;

/** The marker the check's shell prints last, with the command's exit status; the command runs in a subshell, so its own `exit` cannot skip it. */
const EXIT_MARK = '__mesa_check_exit=';

/**
 * The lines of a failed check's `output` worth reading: each error line with the one before it,
 * each text once, at most 40 lines and 4,000 characters, or its last 40 lines when none reads as
 * an error; `more` counts the picked lines left out.
 */
export function checkErrors(output: string): { lines: string[]; more: number } {
  const all = output.replace(/\n$/, '').split('\n');
  const hits = all.flatMap((line, i) => (ERROR_LINE.test(line) ? [i - 1, i] : []));
  const picked = hits.length
    ? [...new Set(hits.filter((i) => i >= 0))].sort((a, b) => a - b).map((i) => all[i] as string)
    : all.filter((line) => line.trim()).slice(-MAX_LINES);
  const unique = [...new Set(picked)];
  const lines: string[] = [];
  let chars = 0;
  for (const line of unique) {
    if (lines.length === MAX_LINES || chars + line.length + 1 > MAX_CHARS) break;
    lines.push(line);
    chars += line.length + 1;
  }
  return { lines, more: unique.length - lines.length };
}

/**
 * Runs `project`'s `check` (its mesa.yaml) in `checkout` (one of its worktrees), else the caller's session folder when
 * the caller works on that project, else the project's folder, with its output kept whole in the
 * profile's checks/ and only what a person or agent needs returned. A project with no check, or a
 * timeout under one second, is a usage error before anything runs.
 */
export async function runCheck(
  ctx: MesaContext,
  project: string,
  opts: { checkout?: string; timeoutSeconds?: number } = {},
): Promise<CheckResult> {
  const { timeoutSeconds = CHECK_TIMEOUT_SECONDS } = opts;
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1)
    throw new MesaError('usage', `the timeout is whole seconds, 1 or more, not ${timeoutSeconds}`);
  const entry = findProject(ctx.open(), project);
  const command = readProjectFile(entry.path).check?.trim();
  if (!command)
    throw new MesaError(
      'usage',
      `project ${entry.name} has no check: set one with mesa projects set ${entry.name} check "<command>"`,
    );
  const caller = callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session;
  const folder = opts.checkout
    ? (await resolveCheckout(ctx.open(), ctx.run, entry.name, ctx.absolute(opts.checkout))).path
    : (caller?.project === entry.name && sessionFolder(caller)) || entry.path;
  const started = ctx.clock().getTime();
  const ran = await ctx.run(
    '/bin/sh',
    ['-c', `(${command}) 2>&1; echo "${EXIT_MARK}$?"`],
    timeoutSeconds * 1000,
    {
      cwd: folder,
    },
  );
  const durationMs = ctx.clock().getTime() - started;
  const printed = ran.ok ? ran.stdout : (ran.output ?? ran.detail);
  const at = printed.lastIndexOf(EXIT_MARK);
  const exitCode =
    ran.ok && at >= 0 ? Number(printed.slice(at + EXIT_MARK.length).trim()) : undefined;
  const output = at >= 0 ? printed.slice(0, at) : printed;
  const timedOut = !ran.ok && ran.reason === 'timeout';
  const dir = ctx.paths.checks;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const log = join(dir, `${shortId(ctx.newId)}.log`);
  writeFileAtomic(log, output, 0o600);
  const ok = exitCode === 0;
  const errors = ok ? { lines: [], more: 0 } : checkErrors(output);
  return {
    ok,
    project: entry.name,
    command,
    folder,
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(timedOut ? { timedOut: true as const } : {}),
    durationMs,
    log,
    errors: errors.lines,
    more: errors.more,
  };
}
