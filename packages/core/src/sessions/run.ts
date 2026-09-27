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
import { isDeadPaneLine, type TmuxWindow } from './tmux/format.js';
import { windowOf } from './window-name.js';

// A skill run headlessly (CONTEXT.md, Skill run): a session of kind run, started through the one
// launch sequence, whose agent prints its result into the profile's runs/ and exits. Mesa waits
// for that, reads the result, closes the window, and ends the session done or failed.

/** How long a run may take unless told otherwise: 20 minutes. */
export const RUN_TIMEOUT_SECONDS = 20 * 60;
/** How often the wait looks at the run's pane. */
const POLL_MS = 1000;

/** Where a run's agent writes its stdout: `<runs>/<session id>.json`, local to the profile. */
export const runOutput = (runs: string, id: string) => join(runs, `${id}.json`);

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
 * `/<skill> <args>` as its prompt (kept as the record's goal) and its stdout in runOutput. The
 * window's command execs the agent, so the pane's pid and exit status are the agent's. Every
 * refusal comes before anything is written: an unknown project, a skill the project does not
 * see or enable, an agent that cannot run, a timeout under one second.
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
  requireCommandFits(command);
  mkdirSync(deps.runs, { recursive: true, mode: 0o700 });
  const parent = deps.caller().session?.id;
  return launchSession(
    deps,
    { kind: 'run', project: entry, agent, agentSessionId, goal: prompt, parent },
    { command: (r) => `exec ${command} </dev/null >${shellWord(runOutput(deps.runs, r.id))}` },
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

type WaitDeps = {
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'findWindow' | 'killWindow' | 'capturePane'>;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  runs: string;
};

/**
 * Waits for a run's agent to exit, looking at its pane every second for up to `timeoutSeconds`,
 * then reads its result, closes its window, and ends the session: `done` when the result is ok,
 * `failed` otherwise. A result that is not ok is returned, never thrown. Past the timeout the
 * window is closed, the session ended `failed`, and the wait is a `timeout` error.
 */
export async function awaitRun(
  deps: WaitDeps,
  run: SessionRecord,
  timeoutSeconds = RUN_TIMEOUT_SECONDS,
): Promise<HeadlessResult> {
  const target = windowOf(run);
  for (let waited = 0; ; waited += POLL_MS) {
    const pane = await deps.tmux.findWindow(target);
    if (!pane || pane.dead) return finish(deps, run, pane);
    if (waited >= timeoutSeconds * 1000) break;
    await deps.sleep(POLL_MS);
  }
  await killIfThere(deps.tmux, target);
  end(deps, run.id, 'failed');
  throw new MesaError(
    'timeout',
    `session ${run.id} ran ${run.goal} past its ${timeoutSeconds} s timeout: its window was closed and the session marked failed`,
    { session: run.id },
  );
}

/**
 * The result once the pane died (`pane`) or the window went: what the agent printed, not ok when
 * it exited nonzero. Output that does not read is not ok, with why, how the agent exited, and the
 * last line it left on the pane (its stderr), read before the window closes.
 */
async function finish(deps: WaitDeps, run: SessionRecord, pane?: TmuxWindow) {
  const agent = runnableAgent(run.agent);
  const file = runOutput(deps.runs, run.id);
  const said = existsSync(file)
    ? (agent?.headless.result(readFileSync(file, 'utf8')) ?? {
        read: false as const,
        reason: `${run.agent} has no headless result`,
      })
    : { read: false as const, reason: `no output at ${file}` };
  const failed = pane?.dead && exitState(pane) === 'failed';
  const exit = !pane
    ? `its window closed before ${run.agent} finished`
    : pane.deadSignal
      ? `${run.agent} was killed by ${pane.deadSignal}`
      : `${run.agent} exited with status ${pane.deadStatus ?? 0}`;
  let result: HeadlessResult;
  if (said.read) {
    const { read: _, ...read } = said;
    result = read.ok && failed ? { ...read, ok: false, reason: exit } : read;
  } else {
    const stderr = pane
      ? await deps.tmux
          .capturePane(windowOf(run), 30)
          .then(lastLine)
          .catch(() => undefined)
      : undefined;
    result = {
      ok: false,
      output: '',
      agentSessionId: run.agentSessionId ?? '',
      durationMs: Math.max(0, deps.clock().getTime() - Date.parse(run.startedAt)),
      reason: [said.reason, failed || !pane ? exit : undefined, stderr].filter(Boolean).join('; '),
    };
  }
  if (pane) await killIfThere(deps.tmux, windowOf(run));
  end(deps, run.id, result.ok ? 'done' : 'failed');
  return result;
}

/** The last line a dead pane shows its process printing (a run's stderr), tmux's own left out. */
const lastLine = (tail: string) =>
  tail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !isDeadPaneLine(line))
    .at(-1);

/** Ends the run's session in `state`, which Mesa read from its result, unless a stop ended it first. */
function end(deps: Pick<WaitDeps, 'store' | 'clock'>, id: string, state: 'done' | 'failed') {
  const at = deps.clock().toISOString();
  deps.store.update(id, (current) =>
    current.endedAt
      ? {}
      : { endedAt: at, lastState: { state, confidence: 1, at, source: 'mesa' as const } },
  );
}
