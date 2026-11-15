import { clip } from '../../../lib/clip.js';
import { lineSplitter } from '../../../lib/lines.js';
import type { Env } from '../../../lib/process.js';
import type { SpawnExit, Spawner } from '../../../lib/spawn.js';
import type { AgentRunner, RunnerSignal, StartHostRunner } from '../../runner.js';
import { firstLine } from '../../steps.js';
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
  const awaiting = new Map<string, string | number>();
  /** Each steer's text by its request id, sent again if Codex refuses it (the turn just ended). */
  const steers = new Map<string, string>();

  const write = (message: object) => child.write(`${JSON.stringify(message)}\n`);
  // The id names the method, so its response is typed without this runner (events.ts).
  const request = (method: string, params: object) => {
    const id = `${method}#${++requests}`;
    write({ id, method, params });
    return id;
  };
  const textInput = (text: string) => [{ type: 'text', text, text_elements: [] }];
  /** The model and effort the next turn starts with; Codex keeps them for the turns after. */
  let overrides: { model?: string; effort?: string } = {};

  const send = (text: string) => {
    if (!threadId || starting) return void waiting.push(text);
    if (turnId) {
      const id = request('turn/steer', {
        threadId,
        expectedTurnId: turnId,
        input: textInput(text),
      });
      return void steers.set(id, text);
    }
    starting = true;
    if (text.trim() === COMPACT) request('thread/compact/start', { threadId });
    else request('turn/start', { threadId, input: textInput(text), ...overrides });
  };
  const flush = () => {
    for (const text of waiting.splice(0)) send(text);
  };
  const answer = (requestId: string, decision: 'accept' | 'decline') => {
    const id = awaiting.get(requestId);
    if (id === undefined) return;
    write({ id, result: { decision } });
    awaiting.delete(requestId);
  };

  /** What the runner itself does on an event, before its reader sees it. */
  const track = (event: AppServerEvent) => {
    switch (event.type) {
      case 'response':
        if (event.method === 'initialize') {
          write({ method: 'initialized' });
          if (options.resume)
            request('thread/resume', { threadId: options.resume, cwd: options.cwd });
          else request('thread/start', { cwd: options.cwd });
        } else if (event.method === 'turn/steer') {
          const text = steers.get(event.id);
          steers.delete(event.id);
          // Refused as the turn ended: the message starts the next one; mid-turn it waits for it.
          if (!event.ok && text !== undefined) turnId ? waiting.push(text) : send(text);
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
        awaiting.set(event.requestId, event.rpcId);
        return;
      case 'resolved':
        awaiting.delete(event.requestId);
        return;
    }
  };

  const lines = lineSplitter((line) => {
    const event = parseAppServerLine(line);
    track(event);
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
    setModel: (model, effort) => {
      overrides = { ...overrides, ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
    },
    interrupt: () => {
      if (threadId && turnId) request('turn/interrupt', { threadId, turnId });
    },
    stop: () => child.kill(),
    exited,
  };
}

/** What `mesa host` shows of an app-server event. */
export function codexSignal(event: AppServerEvent): RunnerSignal | undefined {
  switch (event.type) {
    case 'thread':
      return { sessionId: event.threadId, ...(event.model ? { model: event.model } : {}) };
    case 'approval': {
      // One line, short: the status is redrawn in place on the window's last line.
      const what =
        event.kind === 'command' ? firstLine(event.command ?? '') || 'a command' : 'a file change';
      return { doing: `waiting for permission: ${clip(what, 60)}` };
    }
    case 'turn_completed':
      return { doing: 'idle', turnEnded: true };
    case 'response':
      // A turn Codex refused never completes.
      return !event.ok && (event.method === 'turn/start' || event.method === 'thread/compact/start')
        ? { doing: 'idle', turnEnded: true }
        : undefined;
    case 'turn_started':
    case 'resolved':
    case 'delta':
    case 'item_started':
      return { doing: 'working' };
    default:
      return undefined;
  }
}

/** Codex's runner for `mesa host`: a new thread (Codex picks its id), or the one resumed. */
export const startCodexHost: StartHostRunner = (deps, launch, onLine) =>
  startCodexRunner(
    deps,
    {
      cwd: launch.cwd,
      ...(launch.resume && launch.sessionId ? { resume: launch.sessionId } : {}),
      args: launch.args,
    },
    (event, line) => onLine(line, codexSignal(event)),
  );
