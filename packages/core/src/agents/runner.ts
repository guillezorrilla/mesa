import type { SpawnExit } from '../lib/spawn.js';

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
