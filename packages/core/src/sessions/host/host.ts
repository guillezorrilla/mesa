import { AGENTS } from '../../agents/agents.js';
import { runningConversation } from '../../agents/claude/listing.js';
import { claudeTranscripts } from '../../agents/claude/paths.js';
import { transcriptFile } from '../../agents/claude/transcripts.js';
import type { Mounts } from '../../agents/mesa-mount.js';
import type { AgentRunner } from '../../agents/runner.js';
import type { Clock } from '../../lib/clock.js';
import { usd } from '../../lib/format.js';
import type { Env, Runner } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import type { SpawnExit, Spawner } from '../../lib/spawn.js';
import type { Profile } from '../../profile/profile.js';
import { reviewDeny } from '../../prs/review-guard.js';
import type { SessionStore } from '../record/store.js';
import { additionalDirs } from '../start/additional.js';
import { notedGoal } from '../start/setup-session.js';
import { appendJournal } from './journal.js';
import { type HostReply, type HostRequest, hostSocket, serveHost } from './socket.js';

// `mesa host <session>` (ADR-0029): a Structured session's agent, run in its tmux window through
// its runner (agents/runner.ts: Claude's stream-json, Codex's app-server), every line journalled,
// its socket open to Mesa, and a one-line status in the window where the TUI would be.

export type HostDeps = {
  store: SessionStore;
  profile: Profile;
  spawn: Spawner;
  run: Runner;
  env: Env;
  home: string;
  /** The window's folder, where the launch started it (sessions/start/launch.ts). */
  cwd: string;
  clock: Clock;
  mounts: Mounts;
};

export type Host = {
  /** Ends the agent; `done` settles after. */
  stop(): void;
  /** Settles when the agent has ended and the socket is closed. */
  done: Promise<SpawnExit>;
};

/** The status line: Structured, the model, what the agent is doing, and the session's list price. */
function statusLine(s: { model: string; doing: string; cost: number }) {
  return ['Structured view', s.model, s.doing, s.cost ? usd(s.cost, 2) : '']
    .filter(Boolean)
    .join(' - ');
}

/**
 * Hosts session `id`'s agent until it ends, writing the status to `write`. Refused for a session
 * that is not a Structured Claude Code or Codex one, and while a host or another claude runs its
 * conversation (one agent process per session id). A conversation that has started is resumed; a
 * new one starts (Claude under the id Mesa picked, Codex under the thread id it picks, which goes
 * on the record) with its goal as the first message.
 */
export async function hostSession(
  deps: HostDeps,
  id: string,
  write: (text: string) => void,
): Promise<Host> {
  const record = deps.store.get(id);
  const { agent: agentName } = record;
  if (record.view !== 'structured' || (agentName !== 'claude' && agentName !== 'codex'))
    throw new MesaError('usage', `session ${id} is not a Structured Claude Code or Codex session`);
  const sessionId = record.agentSessionId;
  if (agentName === 'claude' && !sessionId)
    throw new MesaError('usage', `session ${id} has no Claude session id`);
  // shortcut: Codex's listing reads rollouts, not processes, so only a second host is refused for
  // it (the socket); a codex TUI on the thread outside Mesa is not seen.
  const running =
    agentName === 'claude' && sessionId ? await runningConversation(deps, sessionId) : undefined;
  if (running)
    throw new MesaError(
      'usage',
      `claude already runs session ${id}'s conversation (pid ${running.pid}); stop it first`,
    );
  const { paths, config } = deps.profile;
  const journal = (entry: { event: unknown } | { sent: Record<string, unknown> }) =>
    appendJournal(paths.journals, id, { at: deps.clock().toISOString(), ...entry });
  // Codex's thread exists once it has an id; Claude's conversation once it has a transcript.
  const resume =
    sessionId !== undefined &&
    (agentName === 'codex' ||
      transcriptFile(claudeTranscripts(deps.home, deps.env), sessionId) !== undefined);
  const status = { model: record.model ?? '', doing: 'starting', cost: 0 };
  const show = () => write(`\r\x1b[2K${statusLine(status)}`);
  let busy = false;

  const deny = record.review ? reviewDeny(agentName, record.review) : [];
  const { hostArgs, host } = AGENTS[agentName];
  let recorded = sessionId;
  let runner: ReturnType<typeof host> | undefined;
  const send = (agent: AgentRunner, text: string) => {
    const queued = busy;
    busy = true;
    journal({ sent: { type: 'user', text } });
    agent.send(text);
    status.doing = 'working';
    return queued;
  };
  const handle = (request: HostRequest): HostReply => {
    if (request.type === 'ping') return { ok: true };
    if (!runner) return { ok: false, error: 'the agent is still starting' };
    let reply: HostReply = { ok: true };
    if (request.type === 'mode' && !runner.setPermissionMode)
      return { ok: false, error: `${agentName} has no permission modes to set` };
    if (request.type === 'send') reply = { ok: true, queued: send(runner, request.text) };
    else {
      journal({ sent: request });
      if (request.type === 'allow')
        runner.allow(request.requestId, request.input, request.permissions);
      else if (request.type === 'deny') runner.deny(request.requestId, request.message);
      else if (request.type === 'interrupt') runner.interrupt();
      else if (request.type === 'model') runner.setModel(request.model, request.effort);
      else if (request.type === 'mode') runner.setPermissionMode?.(request.mode);
      else runner.stop();
      status.doing = busy ? 'working' : 'idle';
    }
    show();
    return reply;
  };
  // The socket first: a second host is refused before it starts a claude on the conversation.
  const server = await serveHost(hostSocket(paths.hosts, id), handle);
  const agent = host(
    deps,
    {
      cwd: deps.cwd,
      sessionId,
      resume,
      args: hostArgs(
        deps.mounts,
        { ...config.agents, model: record.model, effort: record.effort },
        record.mode,
        additionalDirs(record),
        deny,
      ),
    },
    (line, signal) => {
      let raw: unknown = line;
      try {
        raw = JSON.parse(line);
      } catch {
        // Kept as the text it was.
      }
      journal({ event: raw });
      if (!signal) return;
      if (signal.model) status.model = signal.model;
      if (signal.doing) status.doing = signal.doing;
      if (signal.turnEnded) busy = false;
      if (signal.cost !== undefined) status.cost = signal.cost;
      // Codex picks its thread's id: the record keeps it for resume and for Terminal view.
      if (signal.sessionId && signal.sessionId !== recorded) {
        recorded = signal.sessionId;
        deps.store.update(id, { agentSessionId: recorded });
      }
      show();
    },
  );
  runner = agent;
  const goal = resume ? undefined : notedGoal(record.goal, record.setupSession);
  if (goal) send(agent, goal);
  else status.doing = 'idle';
  show();
  const done = agent.exited.then(async (exit) => {
    await server.close();
    status.doing = exit.code ? `ended (exit ${exit.code})` : 'ended';
    show();
    write('\n');
    return exit;
  });
  return { stop: () => agent.stop(), done };
}
