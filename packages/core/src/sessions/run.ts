import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, newSessionId } from '../agents/agents.js';
import type { MesaContext } from '../context.js';
import type { Guarded, Override } from '../decisions/guardrail.js';
import type { IdSource } from '../lib/ids.js';
import { shellWord } from '../lib/process.js';
import { redactWhole } from '../lib/redact.js';
import { MesaError, toFail } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { joinWarnings } from '../receipts/recorder.js';
import { sessionReceipt } from '../receipts/store.js';
import { landingOf, landOutput } from '../skills/landing.js';
import type { SkillRow } from '../skills/sync.js';
import type { Caller } from './caller.js';
import { requireCommandFits } from './goal.js';
import { type LaunchDeps, launchAgent, launchProject, launchSession } from './launch.js';
import { outputTail } from './output-log.js';
import type { SessionRecord } from './record.js';
import { markRunEnded } from './session-receipt.js';
import { exitState } from './state.js';
import { killIfThere, type TmuxBackend } from './tmux/backend.js';
import { paneExit, type TmuxWindow } from './tmux/format.js';
import { windowOf } from './window-name.js';

// A skill run headlessly (CONTEXT.md, Skill run): a session of kind run, started through the one
// launch sequence, whose agent prints its result into the profile's runs/ and its errors on its
// pane (and so in its output log), then exits. Whoever sees the exit first, the wait in `mesa run`
// or tmux's pane-died hook, ends it the same way (endRun): its record, its receipt, and where its
// skill's output lands.

/** How long a run may take unless told otherwise: 20 minutes. */
export const RUN_TIMEOUT_SECONDS = 20 * 60;
/** How often the wait looks at the run's pane. */
const POLL_MS = 1000;

/** Where a run's agent writes its stdout, its result: `<runs>/<session id>.json`, local to the profile. */
export const runOutput = (runs: string, id: string) => join(runs, `${id}.json`);
/** Where a run about a session reads its stdin from, until it ends: `<runs>/<session id>.input`. */
export const runInput = (runs: string, id: string) => join(runs, `${id}.input`);

// ponytail: the last 1000 lines, some 15k tokens of a claude session; the start of a longer one
// is left out of its summary. Stream the full log if summaries need the complete history.
/** How many of a session's last output lines a run about it is given. */
const INPUT_LINES = 1000;

/** A run's native skill prompt, which its record keeps as its goal. */
const runPrompt = (prefix: string, skill: string, args: readonly string[] = []) =>
  [`${prefix}${skill}`, ...args].join(' ');
/** The skill a run's record ran, from its goal (runPrompt). */
const runSkill = (run: SessionRecord) => run.goal?.match(/^[/$](\S+)/)?.[1];

/** What a run gave back: the agent's answer, its conversation, what it cost, how long it took. */
export type HeadlessResult = {
  ok: boolean;
  /** The agent's answer, or the error it reported; empty when its output does not read. */
  output: string;
  agentSessionId: string;
  costUsd?: number;
  /** Provider token counts, without an invented dollar price. */
  usage?: Record<string, number>;
  durationMs: number;
  /** Why it is not ok: the agent's own error, its exit, or why its output does not read. */
  reason?: string;
  /** The vault note its output became, for a skill whose output lands (skills/landing.ts). */
  note?: string;
};

export type RunInput = {
  skill: string;
  /** The project to run on; the session's own when it is about one. */
  project?: string;
  /** The session it is about: its output log is the agent's stdin. */
  session?: string;
  agent?: string;
  /** The words after the skill in its prompt, `/<skill> <args>`. */
  args?: readonly string[];
  timeoutSeconds?: number;
};

type RunDeps = LaunchDeps & {
  newUuid: IdSource;
  /** Who runs this mesa: the window's session is the run's parent. */
  caller: () => Caller;
  /** The profile's runs/ folder, and its logs/, a session's output logs. */
  runs: string;
  logs: string;
  /** Text as it leaves the profile's logs for an agent (redactWhole). */
  redact: (text: string) => string;
  /** The skills a project sees, enabled or not (the skills service's list). */
  skills: (project: string) => SkillRow[];
  /** The guardrail: throws guardrail_blocked, or returns the override that let it through. */
  guard: (action: Guarded) => Promise<Override | undefined>;
};

/**
 * Starts a skill run: a session of kind run whose window runs the agent's headless command, with
 * `/<skill> <args>` as its prompt (kept as the record's goal), and its stdout in runOutput; its
 * stderr stays on the pane. Its stdin is closed, or, for a run about a session, a file holding
 * that session's output (aboutInput), written once the record is, as its id names it. The
 * window's command execs the agent, so the pane's pid and exit status are the agent's. Every
 * refusal comes before anything is written: a timeout under one second, an unknown session or
 * project, a project that is not the session's, a skill the project does not see or enable, an
 * agent that cannot run, a session with no output log, a command too long for tmux, and last the
 * guardrail on its prompt (`guard`), whose override, if one let it through, comes back with the
 * record.
 */
export async function startRun(deps: RunDeps, input: RunInput) {
  const { timeoutSeconds = RUN_TIMEOUT_SECONDS } = input;
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1) {
    throw new MesaError('usage', `the timeout is whole seconds, 1 or more, not ${timeoutSeconds}`);
  }
  const about = input.session === undefined ? undefined : deps.store.get(input.session);
  const named = input.project ?? about?.project;
  if (named === undefined) {
    throw new MesaError(
      'usage',
      "pass --project <name>, or --session <id> to run it on that session's project",
    );
  }
  const { entry, project } = launchProject(deps.profile, named);
  if (about && entry.name !== about.project) {
    throw new MesaError(
      'usage',
      `session ${about.id} is on ${about.project}, not ${entry.name}: a run about a session runs on its project`,
    );
  }
  requireSkill(deps.skills(entry.name), input.skill, entry.name);
  const { agent, spec } = await launchAgent(deps, project, input.agent);
  const given = about && aboutInput(deps, about);
  const prompt = runPrompt(spec.headless.skillPrefix, input.skill, input.args);
  const agentSessionId = newSessionId(agent, deps.newUuid);
  const command = spec.headless.command(
    agentSessionId,
    prompt,
    deps.profile.config.run,
    entry.path,
  );
  const stdin = (id: string) => (given ? shellWord(runInput(deps.runs, id)) : '/dev/null');
  const line = (id: string) =>
    `exec ${command} <${stdin(id)} >${shellWord(runOutput(deps.runs, id))}`;
  // The line tmux gets, checked before anything is written: every Mesa session id is 8 characters.
  requireCommandFits(line('xxxxxxxx'));
  // Last, so a person is never asked about a run that would be refused anyway.
  const override = await deps.guard({
    action: 'run',
    target: input.skill,
    text: prompt,
    project: entry.name,
  });
  mkdirSync(deps.runs, { recursive: true, mode: 0o700 });
  const parent = deps.caller().session?.id;
  let written: string | undefined;
  try {
    const started = await launchSession(
      deps,
      {
        kind: 'run',
        project: entry,
        agent,
        agentSessionId,
        goal: prompt,
        parent,
        ...(about ? { about: about.id } : {}),
      },
      {
        command: (r) => line(r.id),
        // Once the record is written, as its id names the file.
        prepare: (r) => {
          if (given) {
            written = runInput(deps.runs, r.id);
            writeFileSync(written, given, { mode: 0o600 });
          }
          return r;
        },
      },
    );
    return { ...started, ...(override ? { override } : {}) };
  } catch (error) {
    // The record went with the window that did not open; its input goes too.
    if (written) rmSync(written, { force: true });
    throw error;
  }
}

/**
 * What a run about session `about` reads on stdin: which session it is and its goal, then the
 * last INPUT_LINES lines of its output log as plain text (outputTail), redacted as they leave the
 * logs. usage when the session has no output log, or nothing in it.
 */
function aboutInput(deps: Pick<RunDeps, 'logs' | 'redact'>, about: SessionRecord) {
  const lines = outputTail(deps.logs, about.id, INPUT_LINES);
  if (!lines?.length) {
    throw new MesaError(
      'usage',
      `session ${about.id} has no output to run on: logging was off when it started, or it has not started (see mesa logs ${about.id})`,
    );
  }
  const ended = about.endedAt ? `, ended ${about.endedAt}` : '';
  const head = [
    `Mesa session ${about.id} on ${about.project}, started ${about.startedAt}${ended}.`,
    ...(about.goal ? [`Its goal: ${about.goal}`] : []),
    `The last ${lines.length} lines of its output log, as plain text:`,
  ];
  return deps.redact([...head, '', ...lines, ''].join('\n'));
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

/**
 * What ending a run takes: its record and window, the clock, the profile's runs/ (its result) and
 * logs/ (its pane's output, errors included), and the vault and the secrets its receipt and the
 * note its output becomes are written with.
 */
type EndContext = Pick<MesaContext, 'store' | 'paths' | 'notes' | 'secrets' | 'deps' | 'open'> & {
  tmux: Pick<TmuxBackend, 'killWindow'>;
};

/** How a run ended: its result, and what its end could not record (endRun). */
export type RunEnd = { result: HeadlessResult; warning?: string };

/**
 * Waits for a run's agent to exit, looking at its pane every second for up to `timeoutSeconds`,
 * then ends it (endRun) and returns how it ended, ok or not. Past the timeout the window is
 * closed, the run ended as not ok, and the wait is a `timeout` error.
 */
export async function awaitRun(
  ctx: EndContext & { tmux: Pick<TmuxBackend, 'findWindow' | 'killWindow'> },
  run: SessionRecord,
  timeoutSeconds = RUN_TIMEOUT_SECONDS,
): Promise<RunEnd> {
  const target = windowOf(run);
  for (let waited = 0; ; waited += POLL_MS) {
    const pane = await ctx.tmux.findWindow(target);
    // Read again: tmux's pane-died hook may have ended it already, keeping how it exited.
    if (!pane || pane.dead) return endRun(ctx, ctx.store.get(run.id), pane);
    if (waited >= timeoutSeconds * 1000) break;
    await ctx.deps.sleep(POLL_MS);
  }
  const ended = await endRun(
    ctx,
    ctx.store.get(run.id),
    undefined,
    `timed out after ${timeoutSeconds} s`,
  );
  if (ended.result.ok) return ended; // The hook may have finished successfully after our last look.
  throw new MesaError(
    'timeout',
    `session ${run.id} ran ${run.goal} past its ${timeoutSeconds} s timeout: its window was closed and the session marked failed`,
    { session: run.id },
  );
}

/**
 * How a run ends, whoever sees its agent exit first: the wait in `mesa run`, or tmux's pane-died
 * hook, which ends it when that wait is gone. Its result is read from its files and how it exited
 * (the dead `pane`, else the exit its record keeps), not ok with `killed` as the reason when Mesa
 * killed it (a timeout); its window closed, and the session ended, `done` when the result is ok
 * and `failed` otherwise, with its exit recorded; its input removed; then its end recorded
 * (finishRun). A session already ended keeps its end, and the same result is read, and recorded,
 * again.
 */
export async function endRun(
  ctx: EndContext,
  run: SessionRecord,
  pane?: TmuxWindow,
  killed?: string,
): Promise<RunEnd> {
  const exited = run.events.find((e) => e.type === 'exited');
  const exit = pane?.dead
    ? paneExit(pane)
    : exited && { status: exited.status, signal: exited.signal };
  const at = run.endedAt ?? ctx.deps.clock().toISOString();
  const read = runResult(ctx.paths, run, exit, at);
  const result = killed ? { ...read, ok: false, reason: killed } : read;
  // Commit the outcome before killing the pane: its hook may finish the same run immediately.
  const ended = endRecord(ctx, run.id, result, at, exit);
  await killIfThere(ctx.tmux, windowOf(run));
  rmSync(runInput(ctx.paths.runs, run.id), { force: true });
  // Another process can finish between our file read and the locked update. Re-read using the
  // winning record's exit, including when it succeeded after our timeout read found no output.
  const winner = ended.events.find((event) => event.type === 'exited');
  const finalRead = runResult(ctx.paths, ended, winner ?? exit, ended.endedAt ?? at);
  const final = ended.runFailure
    ? { ...finalRead, ok: false, reason: ended.runFailure }
    : finalRead;
  return finishRun(ctx, ended, final);
}

/**
 * What a run's end records, best effort: its output, when ok and redacted, as the vault note its
 * skill's output becomes (landOutput), linking its receipt; then that receipt finished
 * (markRunEnded). What could not be recorded is the warning.
 */
async function finishRun(ctx: EndContext, run: SessionRecord, read: HeadlessResult) {
  const skill = runSkill(run);
  let note: string | undefined;
  let unlanded: string | undefined;
  const landed = {
    run: run.id,
    project: run.project,
    about: run.about,
    endedAt: run.endedAt ?? run.startedAt,
  };
  if (read.ok && skill && landingOf(skill, landed)) {
    try {
      const notes = ctx.notes();
      const output = redactWhole(read.output, ctx.deps.home, ctx.secrets());
      const receipt = sessionReceipt(notes.vault, run.id)?.path;
      // A fast pane-died hook can beat the start receipt. The waiter retries after it is written.
      if (!receipt) return { result: read };
      note = await landOutput(
        notes,
        skill,
        skill === 'project-brief'
          ? { ...landed, repo: findProject(ctx.open(), run.project).path }
          : landed,
        output,
        receipt,
      );
    } catch (error) {
      unlanded = `run ${run.id}'s output not written to the vault: ${toFail(error).error.message}`;
    }
  }
  const result = note ? { ...read, note } : read;
  const unfinished = await markRunEnded(ctx, run, result, runOutput(ctx.paths.runs, run.id));
  const warning = joinWarnings(unlanded, unfinished);
  return { result, ...(warning ? { warning } : {}) };
}

type Exit = { status?: number; signal?: string };

/**
 * A run's result from its files: what its agent printed, not ok when it exited nonzero or by a
 * signal. Output that does not read is not ok, with why, how the agent exited (`exit`, none when
 * its window went first), and the last line its pane showed (its stderr), from its output log.
 */
function runResult(
  deps: { runs: string; logs: string },
  run: SessionRecord,
  exit: Exit | undefined,
  at: string,
): HeadlessResult {
  if (run.agent === 'terminal')
    throw new MesaError('usage', `session ${run.id} is not a skill run`);
  const file = runOutput(deps.runs, run.id);
  const said = existsSync(file)
    ? AGENTS[run.agent].headless.result(readFileSync(file, 'utf8'))
    : { read: false as const, reason: `no output at ${file}` };
  const failed =
    exit && exitState({ deadStatus: exit.status, deadSignal: exit.signal }) === 'failed';
  const how = !exit
    ? `its window closed before ${run.agent} finished`
    : exit.signal
      ? `${run.agent} was killed by ${exit.signal}`
      : `${run.agent} exited with status ${exit.status ?? 0}`;
  if (said.read) {
    const { read: _, ...parsed } = said;
    const read = {
      ...parsed,
      durationMs: parsed.durationMs ?? Math.max(0, Date.parse(at) - Date.parse(run.startedAt)),
    };
    return read.ok && failed ? { ...read, ok: false, reason: how } : read;
  }
  return {
    ok: false,
    output: '',
    agentSessionId: run.agentSessionId ?? '',
    durationMs: Math.max(0, Date.parse(at) - Date.parse(run.startedAt)),
    reason: [said.reason, failed || !exit ? how : undefined, outputTail(deps.logs, run.id, 1)?.[0]]
      .filter(Boolean)
      .join('; '),
  };
}

/**
 * Ends the run's session at `at` in `state`, which Mesa read from its result, recording its exit
 * when nothing has yet; one a stop or the other ender ended first keeps its end. The record as it
 * is now.
 */
function endRecord(
  deps: Pick<EndContext, 'store'>,
  id: string,
  result: HeadlessResult,
  at: string,
  exit?: Exit,
) {
  return deps.store.update(id, (current) => {
    if (current.endedAt) return {};
    const recorded = current.events.some((e) => e.type === 'exited');
    const state = result.ok ? 'done' : 'failed';
    return {
      endedAt: at,
      ...(result.agentSessionId ? { agentSessionId: result.agentSessionId } : {}),
      ...(!result.ok ? { runFailure: result.reason ?? 'run failed' } : {}),
      lastState: { state, confidence: 1, at, source: 'mesa' as const },
      ...(exit && !recorded
        ? { events: [...current.events, { type: 'exited' as const, at, ...exit }] }
        : {}),
    };
  });
}
