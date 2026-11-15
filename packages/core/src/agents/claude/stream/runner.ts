import { lineSplitter } from '../../../lib/lines.js';
import type { Env } from '../../../lib/process.js';
import type { SpawnExit, Spawner } from '../../../lib/spawn.js';
import type { CLAUDE_PERMISSION_MODES } from '../../names.js';
import { parseStreamLine, type StreamEvent } from './events.js';

// Claude Code in stream-json mode for one session: one long-lived process, JSON lines in and out
// (docs/spikes/structured-chat.md). The runner starts it through an injected spawner (ADR-0008),
// turns stdout into typed events, and writes the messages and control requests Mesa sends.

export type PermissionMode = (typeof CLAUDE_PERMISSION_MODES)[number];

export interface ClaudeStartOptions {
  cwd: string;
  /** Continues this Claude session id instead of starting a new conversation. */
  resume?: string;
  model?: string;
  effort?: string;
  permissionMode?: PermissionMode;
}

export interface ClaudeRunner {
  /** A user message; while a turn runs, Claude queues it. */
  send(text: string): void;
  /** Answers a permission request (`permission_request` event) by its request id. */
  allow(requestId: string, input: Record<string, unknown>): void;
  deny(requestId: string, message: string): void;
  /** Stops the turn in progress; the process stays up for the next message. */
  interrupt(): void;
  setPermissionMode(mode: PermissionMode): void;
  /** Ends the process; resume it later with the session id from `init` or `result`. */
  stop(): void;
  /** Settles when the process ends, after its last event. */
  exited: Promise<SpawnExit>;
}

/** The command line for one runner (`claude` is the binary). */
export function claudeStreamArgs(options: Omit<ClaudeStartOptions, 'cwd'>): string[] {
  return [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    ...(options.resume ? ['--resume', options.resume] : []),
    ...(options.model ? ['--model', options.model] : []),
    ...(options.effort ? ['--effort', options.effort] : []),
    ...(options.permissionMode ? ['--permission-mode', options.permissionMode] : []),
  ];
}

/** Starts claude and reports each event to `onEvent`, in order, until the process ends. */
export function startClaudeRunner(
  deps: { spawn: Spawner; env: Env },
  options: ClaudeStartOptions,
  onEvent: (event: StreamEvent) => void,
): ClaudeRunner {
  const child = deps.spawn('claude', claudeStreamArgs(options), {
    cwd: options.cwd,
    env: deps.env,
  });
  let requests = 0;
  const write = (message: object) => child.write(`${JSON.stringify(message)}\n`);
  const control = (request: object) =>
    write({ type: 'control_request', request_id: `mesa-${++requests}`, request });
  const answer = (requestId: string, response: object) =>
    write({
      type: 'control_response',
      response: { subtype: 'success', request_id: requestId, response },
    });

  const lines = lineSplitter((line) => onEvent(parseStreamLine(line)));
  child.onStdout(lines.push);
  const exited = new Promise<SpawnExit>((resolve) =>
    child.onExit((exit) => {
      lines.flush();
      resolve(exit);
    }),
  );

  return {
    send: (text) => write({ type: 'user', message: { role: 'user', content: text } }),
    allow: (requestId, input) => answer(requestId, { behavior: 'allow', updatedInput: input }),
    deny: (requestId, message) => answer(requestId, { behavior: 'deny', message }),
    interrupt: () => control({ subtype: 'interrupt' }),
    setPermissionMode: (mode) => control({ subtype: 'set_permission_mode', mode }),
    stop: () => child.kill(),
    exited,
  };
}
