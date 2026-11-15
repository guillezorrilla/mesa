import { lineSplitter } from '../../../lib/lines.js';
import type { Env } from '../../../lib/process.js';
import type { SpawnExit, Spawner } from '../../../lib/spawn.js';
import type { CLAUDE_PERMISSION_MODES } from '../../names.js';
import type { AgentRunner, RunnerSignal, StartHostRunner } from '../../runner.js';
import { parseStreamLine, type StreamEvent } from './events.js';

// Claude Code in stream-json mode for one session: one long-lived process, JSON lines in and out
// (docs/spikes/structured-chat.md). The runner starts it through an injected spawner (ADR-0008),
// turns stdout into typed events, and writes the messages and control requests Mesa sends.

export type PermissionMode = (typeof CLAUDE_PERMISSION_MODES)[number];

export interface ClaudeStartOptions {
  cwd: string;
  /** Continues this Claude session id instead of starting a new conversation. */
  resume?: string;
  /** Starts a new conversation under this id (Mesa picks it, newSessionId). */
  sessionId?: string;
  model?: string;
  effort?: string;
  permissionMode?: PermissionMode;
  /** More of claude's flags as argv words: launch defaults, mounts, extra folders, deny rules. */
  args?: readonly string[];
}

export interface ClaudeRunner extends AgentRunner {
  /**
   * Answers a permission request (`permission_request` event) by its request id; `permissions`,
   * its suggestions, make it "allow always".
   */
  allow(requestId: string, input: Record<string, unknown>, permissions?: unknown[]): void;
  setPermissionMode(mode: PermissionMode): void;
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
    ...(options.sessionId && !options.resume ? ['--session-id', options.sessionId] : []),
    ...(options.model ? ['--model', options.model] : []),
    ...(options.effort ? ['--effort', options.effort] : []),
    ...(options.permissionMode ? ['--permission-mode', options.permissionMode] : []),
    ...(options.args ?? []),
  ];
}

/**
 * Starts claude and reports each event to `onEvent`, in order, with the line it was read from,
 * until the process ends.
 */
export function startClaudeRunner(
  deps: { spawn: Spawner; env: Env },
  options: ClaudeStartOptions,
  onEvent: (event: StreamEvent, line: string) => void,
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

  const lines = lineSplitter((line) => onEvent(parseStreamLine(line), line));
  child.onStdout(lines.push);
  const exited = new Promise<SpawnExit>((resolve) =>
    child.onExit((exit) => {
      lines.flush();
      resolve(exit);
    }),
  );

  return {
    send: (text) => write({ type: 'user', message: { role: 'user', content: text } }),
    allow: (requestId, input, permissions) =>
      answer(requestId, {
        behavior: 'allow',
        updatedInput: input,
        ...(permissions?.length ? { updatedPermissions: permissions } : {}),
      }),
    deny: (requestId, message) => answer(requestId, { behavior: 'deny', message }),
    interrupt: () => control({ subtype: 'interrupt' }),
    setModel: (model, effort) => {
      if (model) control({ subtype: 'set_model', model });
      // No control request sets effort: the command does, answered by a synthetic reply.
      if (effort) write({ type: 'user', message: { role: 'user', content: `/effort ${effort}` } });
    },
    setPermissionMode: (mode) => control({ subtype: 'set_permission_mode', mode }),
    stop: () => child.kill(),
    exited,
  };
}

/** What `mesa host` shows of a stream event. */
export function claudeSignal(event: StreamEvent): RunnerSignal | undefined {
  switch (event.type) {
    case 'init':
      return event.model ? { model: event.model } : undefined;
    case 'permission_request':
      return { doing: `waiting for permission: ${event.toolName}` };
    case 'result':
      // The process's running total (measured: it grows turn by turn).
      return {
        doing: 'idle',
        turnEnded: true,
        ...(event.costUsd === undefined ? {} : { cost: event.costUsd }),
      };
    case 'delta':
    case 'assistant':
      return { doing: 'working' };
    default:
      return undefined;
  }
}

/** Claude's runner for `mesa host`: a new conversation under the id Mesa picked, or resumed. */
export const startClaudeHost: StartHostRunner = (deps, launch, onLine) =>
  startClaudeRunner(
    deps,
    {
      cwd: launch.cwd,
      ...(launch.resume ? { resume: launch.sessionId } : { sessionId: launch.sessionId }),
      args: launch.args,
    },
    (event, line) => onLine(line, claudeSignal(event)),
  );
