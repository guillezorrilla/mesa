import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runnableAgent } from '../agents/agents.js';
import type { Clock } from '../lib/clock.js';
import type { IdSource } from '../lib/ids.js';
import { shellWord } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { SkillRow } from '../skills/sync.js';
import type { Caller } from './caller.js';
import { requireCommandFits } from './goal.js';
import { type LaunchDeps, launchAgent, launchProject, launchSession } from './launch.js';
import type { SessionRecord } from './record.js';
import { exitState } from './state.js';
import type { SessionStore } from './store.js';
import { killIfThere, type TmuxBackend } from './tmux/backend.js';
import { paneExit, type TmuxWindow } from './tmux/format.js';
import { windowOf } from './window-name.js';

// A skill run headlessly (CONTEXT.md, Skill run): a session of kind run, started through the one
// launch sequence, whose agent prints its result into the profile's runs/ and exits. Whoever sees
// the exit first, the wait in `mesa run` or tmux's pane-died hook, ends it the same way (endRun).

/** How long a run may take unless told otherwise: 20 minutes. */
export const RUN_TIMEOUT_SECONDS = 20 * 60;
/** How often the wait looks at the run's pane. */
const POLL_MS = 1000;

/**
 * A run's files, local to the profile: what its agent printed on stdout (its result) and on
 * stderr, `<runs>/<session id>.json` and `.err`.
 */
export const runFiles = (runs: string, id: string) => ({
  stdout: join(runs, `${id}.json`),
  stderr: join(runs, `${id}.err`),
});

/** What a run gave back: the agent's answer, its conversation, what it cost, how long it took. */
export type HeadlessResult = {
  ok: boolean;
  /** The agent's answer, or the error it reported; empty when its output does not read. */
  output: string;
  agentSessionId: string;
  costUsd?: number;
  durationMs: number;
  /** Why it is not ok: the agent's own error, its exit, or why its output does not read. */
  reason?: string;
};

export type RunInput = {
  skill: string;
  project: string;
  agent?: string;
  /** The words after the skill in its prompt, `/<skill> <args>`. */
  args?: readonly string[];
  timeoutSeconds?: number;
};

type RunDeps = LaunchDeps & {
  newUuid: IdSource;
  /** Who runs this mesa: the window's session is the run's parent. */
  caller: () => Caller;
  /** The profile's runs/ folder. */
  runs: string;
  /** The skills a project sees, enabled or not (the skills service's list). */
  skills: (project: string) => SkillRow[];
};

/**
 * Starts a skill run: a session of kind run whose window runs the agent's headless command, with
 * `/<skill> <args>` as its prompt (kept as the record's goal), stdin closed, and its stdout and
 * stderr in runFiles. The window's command execs the agent, so the pane's pid and exit status
 * are the agent's. Every refusal comes before anything is written: an unknown project, a skill
 * the project does not see or enable, an agent that cannot run, a timeout under one second, a
 * command too long for tmux.
 */
export async function startRun(deps: RunDeps, input: RunInput) {
  const { timeoutSeconds = RUN_TIMEOUT_SECONDS } = input;
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1) {
    throw new MesaError('usage', `the timeout is whole seconds, 1 or more, not ${timeoutSeconds}`);
  }
  const { entry, project } = launchProject(deps.profile, input.project);
  requireSkill(deps.skills(entry.name), input.skill, entry.name);
  const { agent, spec } = await launchAgent(deps, project, input.agent);
  const prompt = [`/${input.skill}`, ...(input.args ?? [])].join(' ');
  const agentSessionId = deps.newUuid();
  const command = spec.headless.command(agentSessionId, prompt, deps.profile.config.run);
  const line = (id: string) => {
    const files = runFiles(deps.runs, id);
    return `exec ${command} </dev/null >${shellWord(files.stdout)} 2>${shellWord(files.stderr)}`;
  };
  // The line tmux gets, checked before anything is written: every Mesa session id is 8 characters.
  requireCommandFits(line('xxxxxxxx'));
  mkdirSync(deps.runs, { recursive: true, mode: 0o700 });
  const parent = deps.caller().session?.id;
  return launchSession(
    deps,
    { kind: 'run', project: entry, agent, agentSessionId, goal: prompt, parent },
    { command: (r) => line(r.id) },
  );
}

/** A skill the project sees (the library's or its own) and enables; usage otherwise. */
function requireSkill(rows: SkillRow[], skill: string, project: string) {
  const row = rows.find((r) => r.name === skill);
  if (!row) {
    throw new MesaError(
      'usage',
      `no skill ${skill} in the library or in ${project}'s own skills; see mesa skills list ${project}`,
    );
  }
  if (!row.enabled) {
    throw new MesaError(
      'usage',
      `skill ${skill} is not enabled for ${project}: add it to the profile's skills (mesa config set skills) or to its mesa.yaml skills`,
    );
  }
}

/** What ending a run takes: its record, its window, the clock, and its files. */
type EndDeps = {
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'killWindow'>;
  clock: Clock;
  runs: string;
};

/**
 * Waits for a run's agent to exit, looking at its pane every second for up to `timeoutSeconds`,
 * then ends it (endRun) and returns its result, ok or not. Past the timeout the window is closed,
 * the session ended `failed`, and the wait is a `timeout` error.
 */
export async function awaitRun(
  deps: EndDeps & {
    tmux: Pick<TmuxBackend, 'findWindow' | 'killWindow'>;
    sleep: (ms: number) => Promise<void>;
  },
  run: SessionRecord,
  timeoutSeconds = RUN_TIMEOUT_SECONDS,
): Promise<HeadlessResult> {
  const target = windowOf(run);
  for (let waited = 0; ; waited += POLL_MS) {
    const pane = await deps.tmux.findWindow(target);
    // Read again: tmux's pane-died hook may have ended it already, keeping how it exited.
    if (!pane || pane.dead) return endRun(deps, deps.store.get(run.id), pane);
    if (waited >= timeoutSeconds * 1000) break;
    await deps.sleep(POLL_MS);
  }
  await killIfThere(deps.tmux, target);
  endRecord(deps, run.id, 'failed', deps.clock().toISOString());
  throw new MesaError(
    'timeout',
    `session ${run.id} ran ${run.goal} past its ${timeoutSeconds} s timeout: its window was closed and the session marked failed`,
    { session: run.id },
  );
}

/**
 * How a run ends, whoever sees its agent exit first: the wait in `mesa run`, or tmux's pane-died
 * hook, which ends it when that wait is gone. Its result is read from its files and how it exited
 * (the dead `pane`, else the exit its record keeps), its window closed, and the session ended,
 * `done` when the result is ok and `failed` otherwise, with its exit recorded. A session already
 * ended keeps its end, and the same result is read again.
 */
export async function endRun(
  deps: EndDeps,
  run: SessionRecord,
  pane?: TmuxWindow,
): Promise<HeadlessResult> {
  const exited = run.events.find((e) => e.type === 'exited');
  const exit = pane?.dead
    ? paneExit(pane)
    : exited && { status: exited.status, signal: exited.signal };
  const at = run.endedAt ?? deps.clock().toISOString();
  const result = runResult(deps.runs, run, exit, at);
  await killIfThere(deps.tmux, windowOf(run));
  endRecord(deps, run.id, result.ok ? 'done' : 'failed', at, exit);
  return result;
}

type Exit = { status?: number; signal?: string };

/**
 * A run's result from its files: what its agent printed, not ok when it exited nonzero or by a
 * signal. Output that does not read is not ok, with why, how the agent exited (`exit`, none when
 * its window went first), and the last line it printed on stderr.
 */
function runResult(
  runs: string,
  run: SessionRecord,
  exit: Exit | undefined,
  at: string,
): HeadlessResult {
  const files = runFiles(runs, run.id);
  const said = existsSync(files.stdout)
    ? (runnableAgent(run.agent)?.headless.result(readFileSync(files.stdout, 'utf8')) ?? {
        read: false as const,
        reason: `${run.agent} has no headless result`,
      })
    : { read: false as const, reason: `no output at ${files.stdout}` };
  const failed =
    exit && exitState({ deadStatus: exit.status, deadSignal: exit.signal }) === 'failed';
  const how = !exit
    ? `its window closed before ${run.agent} finished`
    : exit.signal
      ? `${run.agent} was killed by ${exit.signal}`
      : `${run.agent} exited with status ${exit.status ?? 0}`;
  if (said.read) {
    const { read: _, ...read } = said;
    return read.ok && failed ? { ...read, ok: false, reason: how } : read;
  }
  return {
    ok: false,
    output: '',
    agentSessionId: run.agentSessionId ?? '',
    durationMs: Math.max(0, Date.parse(at) - Date.parse(run.startedAt)),
    reason: [said.reason, failed || !exit ? how : undefined, lastLine(files.stderr)]
      .filter(Boolean)
      .join('; '),
  };
}

/** The last line in `file` that is not blank, if any. */
function lastLine(file: string) {
  if (!existsSync(file)) return undefined;
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

/**
 * Ends the run's session at `at` in `state`, which Mesa read from its result, recording its exit
 * when nothing has yet; one a stop or the other ender ended first keeps its end.
 */
function endRecord(
  deps: Pick<EndDeps, 'store'>,
  id: string,
  state: 'done' | 'failed',
  at: string,
  exit?: Exit,
) {
  deps.store.update(id, (current) => {
    if (current.endedAt) return {};
    const recorded = current.events.some((e) => e.type === 'exited');
    return {
      endedAt: at,
      lastState: { state, confidence: 1, at, source: 'mesa' as const },
      ...(exit && !recorded
        ? { events: [...current.events, { type: 'exited' as const, at, ...exit }] }
        : {}),
    };
  });
}
