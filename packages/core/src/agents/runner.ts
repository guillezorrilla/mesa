import type { Env } from '../lib/process.js';
import type { SpawnExit, Spawner } from '../lib/spawn.js';
import type { PermissionMode } from './claude/stream/runner.js';

/**
 * A Structured session's agent process (ADR-0029): the seam `mesa host` runs each agent through,
 * Claude Code's stream-json (claude/stream/runner.ts) and Codex's app-server
 * (codex/appserver/runner.ts).
 */
export interface AgentRunner {
  /** A user message; while a turn runs, Claude queues it and Codex steers the turn with it. */
  send(text: string): void;
  /** Answers a permission request by its request id. */
  allow(requestId: string, input: Record<string, unknown>): void;
  deny(requestId: string, message: string): void;
  /** Stops the turn in progress; the process stays up for the next message. */
  interrupt(): void;
  /** Ends the process; resume it later with its session or thread id. */
  stop(): void;
  /** Settles when the process ends, after its last event. */
  exited: Promise<SpawnExit>;
}

/** What `mesa host` shows of one event: the model, what the agent is doing, its cost, its id. */
export type RunnerSignal = {
  model?: string;
  doing?: string;
  /** The turn is over; a message now starts the next one. */
  turnEnded?: true;
  /** The process's running list price, when the agent says one. */
  cost?: number;
  /** The conversation's id, when the agent picks it (Codex's thread). */
  sessionId?: string;
};

/** What the host starts an agent with: its folder, conversation, and its own arguments. */
export type HostLaunch = {
  cwd: string;
  sessionId: string | undefined;
  /** Continue `sessionId`'s conversation rather than start one. */
  resume: boolean;
  args: readonly string[];
};

/** One agent's runner as `mesa host` starts it, each line read with what it signals. */
export type StartHostRunner = (
  deps: { spawn: Spawner; env: Env },
  launch: HostLaunch,
  onLine: (line: string, signal: RunnerSignal | undefined) => void,
) => AgentRunner & { setPermissionMode?: (mode: PermissionMode) => void };
