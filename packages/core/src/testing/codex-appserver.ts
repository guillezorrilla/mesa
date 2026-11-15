import type { Env } from '../lib/process.js';
import type { SpawnExit, Spawner } from '../lib/spawn.js';

const line = (message: object) => JSON.stringify(message);
const THREAD = 'th-0000-invented';
const TURN = 'turn-1';
const item = (method: 'item/started' | 'item/completed', it: object) =>
  line({ method, params: { threadId: THREAD, turnId: TURN, item: it } });

/**
 * An invented `codex app-server` run (shapes from docs/spikes/structured-chat.md, section 3, and
 * the protocol schema): the handshake's answers, the skills and models, one turn with reasoning,
 * a commentary line, a command that asked for approval, a file change and the streamed reply,
 * then usage, an unknown notification and request, an error, a refused request and a line that is
 * not JSON. One JSON-RPC message per line.
 */
export const RECORDED_CODEX_STREAM: string[] = [
  line({ id: 'initialize#1', result: { userAgent: 'codex/0.0.0-invented' } }),
  line({
    id: 'thread/start#2',
    result: { thread: { id: THREAD }, model: 'gpt-invented-codex', cwd: '/proj' },
  }),
  line({ method: 'thread/started', params: { thread: { id: THREAD } } }),
  line({
    id: 'skills/list#3',
    result: {
      data: [
        {
          cwd: '/proj',
          errors: [],
          skills: [
            { name: 'lantern', enabled: true },
            { name: 'switched-off', enabled: false },
          ],
        },
      ],
    },
  }),
  line({
    id: 'model/list#4',
    result: {
      data: [
        { id: 'gpt-invented-codex', displayName: 'Invented Codex', isDefault: true, hidden: false },
        { id: 'gpt-hidden', displayName: 'Hidden', isDefault: false, hidden: true },
      ],
      nextCursor: null,
    },
  }),
  line({
    method: 'turn/started',
    params: { threadId: THREAD, turn: { id: TURN, status: 'inProgress', items: [] } },
  }),
  item('item/completed', {
    type: 'userMessage',
    id: 'u-1',
    content: [{ type: 'text', text: 'make a file' }],
  }),
  item('item/started', { type: 'reasoning', id: 'r-1', summary: [], content: [] }),
  line({
    method: 'item/reasoning/summaryTextDelta',
    params: { threadId: THREAD, turnId: TURN, itemId: 'r-1', delta: 'Plan', summaryIndex: 0 },
  }),
  item('item/completed', { type: 'reasoning', id: 'r-1', summary: ['Plan the file'], content: [] }),
  line({
    method: 'item/agentMessage/delta',
    params: { threadId: THREAD, turnId: TURN, itemId: 'm-1', delta: 'Writing it.' },
  }),
  item('item/completed', {
    type: 'agentMessage',
    id: 'm-1',
    text: 'Writing it.',
    phase: 'commentary',
  }),
  item('item/started', {
    type: 'commandExecution',
    id: 'c-1',
    command: 'echo tide > made.txt',
    cwd: '/proj',
    commandActions: [],
    status: 'inProgress',
  }),
  line({
    id: 0,
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: THREAD,
      turnId: TURN,
      itemId: 'c-1',
      command: 'echo tide > made.txt',
      reason: 'writes a file',
      startedAtMs: 1,
    },
  }),
  line({ method: 'serverRequest/resolved', params: { threadId: THREAD, requestId: 0 } }),
  line({
    method: 'item/commandExecution/outputDelta',
    params: { threadId: THREAD, turnId: TURN, itemId: 'c-1', delta: '' },
  }),
  item('item/completed', {
    type: 'commandExecution',
    id: 'c-1',
    command: 'echo tide > made.txt',
    cwd: '/proj',
    commandActions: [],
    status: 'completed',
    exitCode: 0,
    aggregatedOutput: '',
  }),
  item('item/started', {
    type: 'fileChange',
    id: 'f-1',
    status: 'inProgress',
    changes: [
      {
        path: 'notes.md',
        kind: { type: 'update', move_path: null },
        diff: '@@ -1 +1 @@\n-old\n+new',
      },
    ],
  }),
  item('item/completed', {
    type: 'fileChange',
    id: 'f-1',
    status: 'completed',
    changes: [
      {
        path: 'notes.md',
        kind: { type: 'update', move_path: null },
        diff: '@@ -1 +1 @@\n-old\n+new',
      },
    ],
  }),
  line({
    method: 'item/agentMessage/delta',
    params: { threadId: THREAD, turnId: TURN, itemId: 'm-2', delta: 'Done' },
  }),
  line({
    method: 'item/agentMessage/delta',
    params: { threadId: THREAD, turnId: TURN, itemId: 'm-2', delta: '.' },
  }),
  item('item/completed', { type: 'agentMessage', id: 'm-2', text: 'Done.', phase: 'final_answer' }),
  line({
    method: 'thread/tokenUsage/updated',
    params: {
      threadId: THREAD,
      turnId: TURN,
      tokenUsage: {
        total: {
          inputTokens: 1200,
          outputTokens: 80,
          cachedInputTokens: 900,
          reasoningOutputTokens: 10,
          totalTokens: 1280,
        },
        last: {
          inputTokens: 1200,
          outputTokens: 80,
          cachedInputTokens: 900,
          reasoningOutputTokens: 10,
          totalTokens: 1280,
        },
        modelContextWindow: 200000,
      },
    },
  }),
  line({ method: 'account/rateLimits/updated', params: { rateLimits: {} } }),
  line({
    method: 'turn/completed',
    params: { threadId: THREAD, turn: { id: TURN, status: 'completed', items: [] } },
  }),
  line({ id: 'account/usage/read#5', result: { summary: { invented: true } } }),
  line({ method: 'thread/goal/cleared', params: { threadId: THREAD } }),
  line({ id: 1, method: 'item/tool/requestUserInput', params: { threadId: THREAD } }),
  line({
    method: 'error',
    params: { threadId: THREAD, turnId: TURN, error: { message: 'stream lost' }, willRetry: true },
  }),
  line({ id: 'turn/steer#9', error: { code: -32600, message: 'no active turn' } }),
  'not json',
];

/** A turn cut off by `turn/interrupt`: a command that never finished and a reply mid-delta. */
export const INTERRUPTED_CODEX_STREAM: string[] = [
  line({
    method: 'turn/started',
    params: { threadId: THREAD, turn: { id: TURN, status: 'inProgress', items: [] } },
  }),
  item('item/started', {
    type: 'commandExecution',
    id: 'c-9',
    command: 'sleep 60',
    cwd: '/proj',
    commandActions: [],
    status: 'inProgress',
  }),
  line({
    method: 'item/agentMessage/delta',
    params: { threadId: THREAD, turnId: TURN, itemId: 'm-9', delta: 'The lighthouse ' },
  }),
  line({
    method: 'turn/completed',
    params: { threadId: THREAD, turn: { id: TURN, status: 'interrupted', items: [] } },
  }),
];

/**
 * A spawner whose one process Mesa's test drives by hand: `push` writes lines (or messages) to its
 * stdout, `end` exits it. It records the spawns and every line written to stdin as parsed JSON.
 */
export function scriptedSpawner() {
  const spawns: { file: string; args: string[]; cwd?: string; env?: Env }[] = [];
  const sent: Record<string, unknown>[] = [];
  let stdout: (chunk: string) => void = () => undefined;
  let exit: (exit: SpawnExit) => void = () => undefined;
  let killed = false;
  const spawn: Spawner = (file, args, options) => {
    spawns.push({ file, args, ...options });
    return {
      write(text) {
        for (const l of text.split('\n')) if (l.trim()) sent.push(JSON.parse(l));
      },
      onStdout(listener) {
        stdout = listener;
      },
      onExit(listener) {
        exit = listener;
      },
      kill() {
        killed = true;
        exit({ code: undefined });
      },
    };
  };
  return {
    spawn,
    spawns,
    sent,
    /** Writes each line (a string as is, an object as JSON) to stdout, in one read. */
    push: (...lines: (string | object)[]) =>
      stdout(`${lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')}\n`),
    /** Writes raw text to stdout as one read, which may cut a line. */
    chunk: (text: string) => stdout(text),
    end: (code = 0) => exit({ code }),
    wasKilled: () => killed,
  };
}
