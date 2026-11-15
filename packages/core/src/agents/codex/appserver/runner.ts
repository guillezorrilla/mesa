import { lineSplitter } from '../../../lib/lines.js';
import type { Env } from '../../../lib/process.js';
import type { SpawnExit, Spawner } from '../../../lib/spawn.js';
import type { AgentRunner } from '../../runner.js';
import { type AppServerEvent, parseAppServerLine } from './events.js';

// Codex on `codex app-server` for one session: one long-lived process speaking JSON-RPC over
// stdio (docs/spikes/structured-chat.md, section 3). The runner starts it through an injected
// spawner (ADR-0008), opens or resumes the thread, turns stdout into typed events, and writes the
// turns, steers, interrupts and approval answers Mesa sends.

export interface CodexStartOptions {
  cwd: string;
  /** Continues this thread instead of starting a new one (Codex picks a new thread's id). */
  resume?: string;
  /** More of codex's arguments after `app-server`: its `-c` overrides (AGENTS.codex.hostArgs). */
  args?: readonly string[];
}

/** The text a send that compacts the thread is: compaction runs as a turn (spike section 3). */
const COMPACT = '/compact';

/**
 * Starts codex app-server and reports each event to `onEvent`, in order, with the line it was read
 * from, until the process ends. Messages sent before the thread is open wait for it; a message
 * sent while a turn runs steers that turn (`turn/steer`). The skills and models are asked for once
 * the thread is open, and the account's usage after each turn, so they arrive as events too.
 */
export function startCodexRunner(
  deps: { spawn: Spawner; env: Env },
  options: CodexStartOptions,
  onEvent: (event: AppServerEvent, line: string) => void,
): AgentRunner {
  const child = deps.spawn('codex', ['app-server', ...(options.args ?? [])], {
    cwd: options.cwd,
    env: deps.env,
  });
  let requests = 0;
  let threadId: string | undefined;
  let turnId: string | undefined;
  /** A turn/start is sent and its turn/started not yet read: a message now waits to steer it. */
  let starting = false;
  const waiting: string[] = [];
  /** Codex's id for each request it is waiting on Mesa for, by its string form. */
  const asked = new Map<string, unknown>();

  const write = (message: object) => child.write(`${JSON.stringify(message)}\n`);
  // The id names the method, so its response is typed without this runner (events.ts).
  const request = (method: string, params: object) =>
    write({ id: `${method}#${++requests}`, method, params });
  const input = (text: string) => [{ type: 'text', text, text_elements: [] }];

  const send = (text: string) => {
    if (!threadId || starting) return void waiting.push(text);
    if (text.trim() === COMPACT && !turnId) {
      starting = true;
      return request('thread/compact/start', { threadId });
    }
    if (turnId)
      return request('turn/steer', { threadId, expectedTurnId: turnId, input: input(text) });
    starting = true;
    request('turn/start', { threadId, input: input(text) });
  };
  const flush = () => {
    for (const text of waiting.splice(0)) send(text);
  };
  const answer = (requestId: string, decision: string) => {
    if (!asked.has(requestId)) return;
    write({ id: asked.get(requestId), result: { decision } });
    asked.delete(requestId);
  };

  const seen = (event: AppServerEvent, raw: Record<string, unknown> | undefined) => {
    switch (event.type) {
      case 'response':
        if (event.method === 'initialize') {
          write({ method: 'initialized' });
          if (options.resume)
            request('thread/resume', { threadId: options.resume, cwd: options.cwd });
          else request('thread/start', { cwd: options.cwd });
        }
        // A turn Codex refused never starts, so what waited goes on.
        else if (
          !event.ok &&
          (event.method === 'turn/start' || event.method === 'thread/compact/start')
        ) {
          starting = false;
          flush();
        }
        return;
      case 'thread':
        threadId = event.threadId;
        request('skills/list', { cwds: [options.cwd] });
        request('model/list', {});
        return flush();
      case 'turn_started':
        turnId = event.turnId;
        starting = false;
        return flush();
      case 'turn_completed':
        turnId = undefined;
        starting = false;
        request('account/usage/read', {});
        return flush();
      case 'approval':
      case 'server_request':
        asked.set(event.requestId, raw?.id);
        return;
      case 'resolved':
        asked.delete(event.requestId);
        return;
    }
  };

  const lines = lineSplitter((line) => {
    const event = parseAppServerLine(line);
    let raw: Record<string, unknown> | undefined;
    if (event.type === 'approval' || event.type === 'server_request') raw = JSON.parse(line);
    seen(event, raw);
    onEvent(event, line);
  });
  child.onStdout(lines.push);
  const exited = new Promise<SpawnExit>((resolve) =>
    child.onExit((exit) => {
      lines.flush();
      resolve(exit);
    }),
  );
  request('initialize', {
    clientInfo: { name: 'mesa', title: 'Mesa', version: '0' },
    capabilities: { experimentalApi: true },
  });

  return {
    send,
    allow: (requestId) => answer(requestId, 'accept'),
    deny: (requestId) => answer(requestId, 'decline'),
    interrupt: () => {
      if (threadId && turnId) request('turn/interrupt', { threadId, turnId });
    },
    stop: () => child.kill(),
    exited,
  };
}
