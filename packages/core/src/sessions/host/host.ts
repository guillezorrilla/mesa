import { AGENTS } from '../../agents/agents.js';
import { runningConversation } from '../../agents/claude/listing.js';
import { claudeTranscripts } from '../../agents/claude/paths.js';
import { type ClaudeRunner, startClaudeRunner } from '../../agents/claude/stream/runner.js';
import { transcriptFile } from '../../agents/claude/transcripts.js';
import type { Mounts } from '../../agents/mesa-mount.js';
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

// `mesa host <session>` (ADR-0029): a Structured session's agent, run in its tmux window in
// stream-json mode (agents/claude/stream), every line journalled, its socket open to Mesa, and a
// one-line status in the window where the TUI would be.

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
 * that is not a Structured Claude Code one, and while a host or another claude runs its
 * conversation (one agent process per session id). A conversation with a transcript is resumed;
 * a new one starts under the id Mesa picked, its goal sent as the first message.
 */
export async function hostSession(
  deps: HostDeps,
  id: string,
  write: (text: string) => void,
): Promise<Host> {
  const record = deps.store.get(id);
  if (record.view !== 'structured' || record.agent !== 'claude')
    throw new MesaError('usage', `session ${id} is not a Structured Claude Code session`);
  const sessionId = record.agentSessionId;
  if (!sessionId) throw new MesaError('usage', `session ${id} has no Claude session id`);
  const running = await runningConversation(deps, sessionId);
  if (running)
    throw new MesaError(
      'usage',
      `claude already runs session ${id}'s conversation (pid ${running.pid}); stop it first`,
    );
  const { paths, config } = deps.profile;
  const journal = (entry: { event: unknown } | { sent: Record<string, unknown> }) =>
    appendJournal(paths.journals, id, { at: deps.clock().toISOString(), ...entry });
  const resume = transcriptFile(claudeTranscripts(deps.home, deps.env), sessionId) !== undefined;
  const status = { model: record.model ?? '', doing: 'starting', cost: 0 };
  const show = () => write(`\r\x1b[2K${statusLine(status)}`);
  let busy = false;

  const deny = record.review ? reviewDeny('claude', record.review) : [];
  let runner: ClaudeRunner | undefined;
  const send = (agent: ClaudeRunner, text: string) => {
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
    if (request.type === 'send') reply = { ok: true, queued: send(runner, request.text) };
    else {
      journal({ sent: request });
      if (request.type === 'allow') runner.allow(request.requestId, request.input);
      else if (request.type === 'deny') runner.deny(request.requestId, request.message);
      else if (request.type === 'interrupt') runner.interrupt();
      else if (request.type === 'mode') runner.setPermissionMode(request.mode);
      else runner.stop();
      status.doing = busy ? 'working' : 'idle';
    }
    show();
    return reply;
  };
  // The socket first: a second host is refused before it starts a claude on the conversation.
  const server = await serveHost(hostSocket(paths.hosts, id), handle);
  const agent = startClaudeRunner(
    deps,
    {
      cwd: deps.cwd,
      ...(resume ? { resume: sessionId } : { sessionId }),
      args: AGENTS.claude.hostArgs(
        deps.mounts,
        { ...config.agents, model: record.model, effort: record.effort },
        record.mode,
        additionalDirs(record),
        deny,
      ),
    },
    (event, line) => {
      let raw: unknown = line;
      try {
        raw = JSON.parse(line);
      } catch {
        // Kept as the text it was.
      }
      journal({ event: raw });
      if (event.type === 'init') status.model = event.model || status.model;
      else if (event.type === 'permission_request')
        status.doing = `waiting for permission: ${event.toolName}`;
      else if (event.type === 'result') {
        busy = false;
        status.doing = 'idle';
        // The process's running total (measured: it grows turn by turn).
        status.cost = event.costUsd ?? status.cost;
      } else if (event.type === 'delta' || event.type === 'assistant') status.doing = 'working';
      else return;
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
