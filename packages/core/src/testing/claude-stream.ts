import type { Env } from '../lib/process.js';
import type { SpawnExit, Spawner } from '../lib/spawn.js';

/**
 * An invented stream-json run of Claude Code (shapes from docs/spikes/structured-chat.md): init, a
 * streamed reply, a tool call that needs permission, its result, a compaction, an unknown event, and
 * the turn's `result`. One JSON object per line.
 */
export const RECORDED_CLAUDE_STREAM: string[] = [
  {
    type: 'system',
    subtype: 'init',
    session_id: 'c0ffee00-0000-4000-8000-000000000001',
    model: 'claude-sonnet-5-5',
    permissionMode: 'default',
    slash_commands: ['compact', 'context', 'lanternecho'],
    skills: ['lantern'],
    tools: ['Read', 'Write', 'Bash'],
  },
  { type: 'stream_event', event: { type: 'message_start' } },
  {
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sure, ' } },
  },
  {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'a file' },
    },
  },
  {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"file_path":' },
    },
  },
  {
    type: 'control_request',
    request_id: 'req-1',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'Write',
      tool_use_id: 'toolu_1',
      input: { file_path: 'made.txt', content: 'tide' },
    },
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Sure, writing it.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'Write',
          input: { file_path: 'made.txt', content: 'tide' },
        },
      ],
    },
  },
  {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'File created' }],
    },
  },
  { type: 'control_request', request_id: 'req-2', request: { subtype: 'interrupt' } },
  { type: 'control_response', response: { subtype: 'success', request_id: 'mesa-1' } },
  {
    type: 'system',
    subtype: 'compact_boundary',
    compact_metadata: { trigger: 'manual', pre_tokens: 44600 },
  },
  { type: 'system', subtype: 'background_tasks_changed' },
  { type: 'rate_limit_event', note: 'a type Mesa does not know' },
  {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Done.',
    session_id: 'c0ffee00-0000-4000-8000-000000000001',
    total_cost_usd: 0.0123,
    duration_ms: 3400,
    num_turns: 2,
    usage: {
      input_tokens: 12,
      output_tokens: 80,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 40,
    },
  },
].map((event) => JSON.stringify(event));

/**
 * A spawner whose process replays `stream` on stdout when the first message is written, then
 * exits, and records the spawns and every line written to stdin as parsed JSON. `chunks` splits the
 * replayed text into reads of that many characters, to show a line cut across reads; `stay` keeps
 * the process up after the replay until it is killed, as claude waits for its next message.
 */
export function replaySpawner(
  stream: string[] = RECORDED_CLAUDE_STREAM,
  { chunks, stay = false }: { chunks?: number; stay?: boolean } = {},
) {
  const spawns: { file: string; args: string[]; cwd?: string; env?: Env }[] = [];
  const sent: Record<string, unknown>[] = [];
  let killed = false;
  const spawn: Spawner = (file, args, options) => {
    spawns.push({ file, args, ...options });
    let stdout: (chunk: string) => void = () => undefined;
    let exit: (exit: SpawnExit) => void = () => undefined;
    let replayed = false;
    let ended = false;
    const end = (code: number | undefined) => {
      if (ended) return;
      ended = true;
      queueMicrotask(() => exit({ code }));
    };
    return {
      write(text) {
        for (const line of text.split('\n')) if (line.trim()) sent.push(JSON.parse(line));
        if (replayed) return;
        replayed = true;
        const all = `${stream.join('\n')}\n`;
        for (let i = 0; i < all.length; i += chunks ?? all.length)
          stdout(all.slice(i, i + (chunks ?? all.length)));
        if (!stay) end(0);
      },
      onStdout(listener) {
        stdout = listener;
      },
      onExit(listener) {
        exit = listener;
      },
      kill() {
        killed = true;
        end(undefined);
      },
    };
  };
  return { spawn, spawns, sent, wasKilled: () => killed };
}

const line = (event: object) => JSON.stringify(event);
const delta = (text: string) =>
  line({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  });
const INIT = line({
  type: 'system',
  subtype: 'init',
  session_id: 'c0ffee00-0000-4000-8000-000000000001',
});

/** A slash command Claude Code answers itself: a synthetic assistant message and a no-turn result. */
export const RECORDED_COMMAND_STREAM: string[] = [
  INIT,
  line({
    type: 'assistant',
    message: {
      role: 'assistant',
      model: '<synthetic>',
      content: [{ type: 'text', text: 'Model: haiku' }],
    },
  }),
  line({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Model: haiku',
    num_turns: 0,
  }),
];

/** A reply cut off mid-delta by an interrupt, with a tool call that never got its result. */
export const INTERRUPTED_CLAUDE_STREAM: string[] = [
  INIT,
  line({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_9', name: 'Bash', input: { command: 'sleep 60' } }],
    },
  }),
  delta('The lighthouse '),
  delta('keeper climbed'),
  line({
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: '',
    num_turns: 1,
  }),
];
