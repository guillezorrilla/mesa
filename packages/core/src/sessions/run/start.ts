import { mkdirSync, rmSync } from 'node:fs';
import { AGENTS, newSessionId } from '../../agents/agents.js';
import { antigravityLog, prepareAntigravityLog } from '../../agents/antigravity/log.js';
import type { Guarded, Override } from '../../decisions/guardrail.js';
import { writeFileAtomic } from '../../lib/atomic-file.js';
import type { IdSource } from '../../lib/ids.js';
import type { LockDeps } from '../../lib/lock-file.js';
import { shellWord } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import { isPipelineSkill, VAULT_CAPTURE } from '../../skills/library.js';
import type { SkillRow } from '../../skills/sync.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionRecord } from '../record/record.js';
import { requireCommandFits } from '../start/goal.js';
import { type LaunchDeps, launchAgent, launchProject, launchSession } from '../start/launch.js';
import type { Caller } from '../window/caller.js';
import { outputTail } from '../window/output-log.js';
import { runInput, runOutput } from './files.js';

// How a skill run starts (startRun): every refusal first, then its window, whose agent prints
// its result into the profile's runs/ (files.ts).

/** How long a run may take unless told otherwise: 20 minutes. */
export const RUN_TIMEOUT_SECONDS = 20 * 60;

// ponytail: the last 1000 lines, some 15k tokens of a claude session; the start of a longer one
// is left out of its summary. Stream the full log if summaries need the complete history.
/** How many of a session's last output lines a run about it is given. */
const INPUT_LINES = 1000;
// ponytail: the newest 100,000 characters of a conversation, some 25k tokens; a capture of a
// longer one reads its end, where its settled decisions usually are. Chunk it if that misses some.
/** How much of a session's conversation a vault-capture run about it is given. */
const CONVERSATION_CHARS = 100_000;

/** A run's native skill prompt, which its record keeps as its goal. */
const runPrompt = (prefix: string, skill: string, args: readonly string[] = []) =>
  [`${prefix}${skill}`, ...args].join(' ');
/** The skill a run's record ran, from its goal (runPrompt). */
export const skillOfRun = (run: SessionRecord) => run.goal?.match(/^[/$](\S+)/)?.[1];

export type RunInput = {
  skill: string;
  /** The project to run on; the session's own when it is about one. */
  project?: string;
  /** The session it is about: its output log is the agent's stdin. */
  session?: string;
  agent?: string;
  /** The words after the skill in its prompt, `/<skill> <args>`. */
  args?: readonly string[];
  automation?: SessionRecord['automation'];
  timeoutSeconds?: number;
};

type RunDeps = LaunchDeps & {
  newUuid: IdSource;
  /** Who runs this mesa: the window's session is the run's parent. */
  caller: () => Caller;
  /** The profile's runs/ folder, and its logs/, a session's output logs. */
  runs: string;
  logs: string;
  lock: LockDeps;
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
  if (about?.project === GENERAL_PROJECT) {
    throw new MesaError('usage', `session ${about.id} is General; skill runs require a project`);
  }
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
  const given = about && aboutInput(deps, about, input.skill);
  const prompt = runPrompt(spec.headless.skillPrefix, input.skill, input.args);
  const agentSessionId = newSessionId(agent, deps.newUuid);
  // A pipeline skill's output is landed by core (ADR-0006), so its run gets no vault writes.
  const may = { ...deps.profile.config.run, readOnlyVault: isPipelineSkill(input.skill) };
  const command = (id: string) =>
    agent === 'antigravity'
      ? AGENTS.antigravity.headless.command(
          agentSessionId,
          prompt,
          may,
          antigravityLog(deps.logs, id),
        )
      : spec.headless.command(agentSessionId, prompt, may, entry.path, deps.mounts);
  const stdin = (id: string) => (given ? shellWord(runInput(deps.runs, id)) : '/dev/null');
  const line = (id: string) =>
    `exec ${command(id)} <${stdin(id)} >${shellWord(runOutput(deps.runs, id))}`;
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
        ...(input.automation ? { automation: input.automation } : {}),
        parent,
        ...(about ? { about: about.id } : {}),
      },
      {
        command: (r) => line(r.id),
        // Once the record is written, as its id names the file.
        prepare: (r) => {
          if (agent === 'antigravity') prepareAntigravityLog(deps.logs, r.id);
          if (given) {
            written = runInput(deps.runs, r.id);
            writeFileAtomic(written, given, 0o600);
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
 * What a run about session `about` reads on stdin: which session it is and its goal, then, for a
 * vault-capture run, its conversation (conversationLines), else the last INPUT_LINES lines of its
 * output log as plain text (outputTail), redacted as they leave Mesa's files. usage when the
 * session has none of that, or nothing in it.
 */
function aboutInput(
  deps: Pick<RunDeps, 'logs' | 'redact' | 'lock' | 'home' | 'env'>,
  about: SessionRecord,
  skill: string,
) {
  const lines =
    skill === VAULT_CAPTURE
      ? conversationLines(deps, about)
      : outputTail(deps.lock, deps.logs, about.id, INPUT_LINES);
  if (!lines?.length) {
    throw new MesaError(
      'usage',
      skill === VAULT_CAPTURE
        ? `session ${about.id} has no conversation to capture: its agent's transcript is not on this machine`
        : `session ${about.id} has no output to run on: logging was off when it started, or it has not started (see mesa logs ${about.id})`,
    );
  }
  const ended = about.endedAt ? `, ended ${about.endedAt}` : '';
  const head = [
    `Mesa session ${about.id} on ${about.project}, started ${about.startedAt}${ended}.`,
    ...(about.goal ? [`Its goal: ${about.goal}`] : []),
    skill === VAULT_CAPTURE
      ? `Its conversation, the newest ${lines.length} messages:`
      : `The last ${lines.length} lines of its output log, as plain text:`,
  ];
  return deps.redact([...head, '', ...lines, ''].join('\n'));
}

/**
 * The person's and the agent's messages in `about`'s native transcript, each `[user] <text>` or
 * `[assistant] <text>`, the newest that fit in CONVERSATION_CHARS; none without a transcript.
 */
function conversationLines(deps: Pick<RunDeps, 'home' | 'env'>, about: SessionRecord) {
  if (about.agent === 'terminal' || !about.agentSessionId) return undefined;
  const transcripts = AGENTS[about.agent].transcripts;
  const file = transcripts?.file(deps, about.agentSessionId);
  if (!transcripts || !file) return undefined;
  const lines: string[] = [];
  let room = CONVERSATION_CHARS;
  for (const { role, text } of [...transcripts.messages(file).messages].reverse()) {
    const line = `[${role}] ${text.trim()}`;
    if (line.length > room) break;
    lines.unshift(line);
    room -= line.length + 1;
  }
  return lines;
}

/**
 * A skill the project sees (the library's or its own) and enables; usage otherwise, and for a
 * pipeline skill, when an entry of the project's own holds its place, so its agent would not load
 * Mesa's (sync.ts leaves that entry alone).
 */
function requireSkill(rows: SkillRow[], skill: string, project: string) {
  const row = rows.find((r) => r.name === skill);
  if (!row) {
    throw new MesaError(
      'usage',
      `no skill ${skill} in the library or in ${project}'s own skills; see mesa skills list ${project}`,
    );
  }
  if (isPipelineSkill(skill) && rows.some((r) => r.name === skill && r.source === 'repo')) {
    throw new MesaError(
      'usage',
      `${project} has a skill entry of its own named ${skill}, so the run would not load Mesa's; rename or remove its .claude/skills/${skill} or .agents/skills/${skill}`,
    );
  }
  if (!row.enabled) {
    throw new MesaError(
      'usage',
      `skill ${skill} is not enabled for ${project}: add it to the profile's skills (mesa config set skills) or to its mesa.yaml skills`,
    );
  }
}
