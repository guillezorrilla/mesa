import type { AppServerEvent, CodexItem } from '../../agents/codex/appserver/events.js';
import {
  editHunk,
  finishSteps,
  firstLine,
  HUNK_LINES,
  keep,
  type TranscriptStep,
} from '../../agents/steps.js';
import { add, closeRun, endStreamChatTurn, type StreamChat, withCommand } from './stream-chat.js';

// A Structured Codex session's live chat: its app-server events (agents/codex/appserver) folded
// into the same state and chat items as Claude's stream (stream-chat.ts). Pure, like that fold.

/** A file change's diff as an edit step: its `+`/`-` lines, or a new file's whole text as added. */
function changeEdit(
  id: string,
  change: { path: string; diff: string; change: string },
): TranscriptStep {
  const lines = change.diff
    .split('\n')
    .filter((line) => /^[-+ ]/.test(line) && !/^(\+\+\+|---) /.test(line));
  const counted = (sign: string) => lines.filter((line) => line.startsWith(sign)).length;
  const { hunk, added, removed } =
    change.change === 'add' && !counted('+')
      ? editHunk('', change.diff)
      : { hunk: lines.slice(0, HUNK_LINES), added: counted('+'), removed: counted('-') };
  return { type: 'edit', id, path: change.path, added, removed, hunk, status: 'running' };
}

/** The steps an item starts: a command, a file's edits, a tool call or a search. */
function itemSteps(item: CodexItem): TranscriptStep[] {
  const tool = (kind: 'command' | 'web' | 'other', name: string, target: string) => [
    {
      type: 'tool' as const,
      id: item.id,
      kind,
      name,
      target,
      status: 'running' as const,
      output: '',
    },
  ];
  switch (item.kind) {
    case 'commandExecution':
      return tool('command', 'shell', firstLine(item.command));
    case 'fileChange':
      return item.changes.map((change, at) =>
        changeEdit(at ? `${item.id}:${at}` : item.id, change),
      );
    case 'mcpToolCall':
      return tool('other', `mcp__${item.server}__${item.tool}`, '');
    case 'webSearch':
      return tool('web', 'web_search', firstLine(item.query));
    default:
      return [];
  }
}

/** How an item ended: failed when Codex says so, or a command exited non-zero. */
const itemFailed = (item: CodexItem) =>
  ('status' in item && (item.status === 'failed' || item.status === 'declined')) ||
  (item.kind === 'commandExecution' && item.exitCode !== undefined && item.exitCode !== 0) ||
  (item.kind === 'mcpToolCall' && Boolean(item.error));

/** `state` with `item`'s steps in the run, once each (a search is first seen completed). */
function started(state: StreamChat, item: CodexItem): StreamChat {
  if (state.run.some((step) => step.id === item.id)) return state;
  const steps = itemSteps(item);
  return steps.length ? { ...state, run: [...state.run, ...steps] } : state;
}

function completed(state: StreamChat, item: CodexItem, at: string): StreamChat {
  switch (item.kind) {
    case 'agentMessage': {
      // Commentary is a step line between tool calls; any other phase is the reply (spike section 3).
      if (item.phase === 'commentary')
        return item.text.trim()
          ? {
              ...state,
              live: '',
              run: [...state.run, { type: 'thought', id: item.id, text: keep(item.text) }],
            }
          : { ...state, live: '' };
      return add(closeRun({ ...state, live: '' }, at), { at, text: item.text, from: 'agent' });
    }
    case 'reasoning':
      return item.text.trim()
        ? { ...state, run: [...state.run, { type: 'thought', id: item.id, text: keep(item.text) }] }
        : state;
    case 'contextCompaction':
      return withCommand(state, { output: 'Context compacted' });
    default: {
      const next = started(state, item);
      const run = next.run.map((step) => ({ ...step }));
      const output =
        item.kind === 'commandExecution'
          ? item.output
          : item.kind === 'mcpToolCall'
            ? item.error
            : '';
      finishSteps(run, { id: item.id, failed: itemFailed(item), output });
      return { ...next, run };
    }
  }
}

/** `state` after one app-server event, at time `at` (ISO). */
export function foldCodexEvent(state: StreamChat, event: AppServerEvent, at: string): StreamChat {
  switch (event.type) {
    case 'delta':
      return event.kind === 'text' ? { ...state, live: state.live + event.text } : state;
    case 'item_started':
      return started(state, event.item);
    case 'item_completed':
      return completed(state, event.item, at);
    case 'turn_completed': {
      const failed = event.status === 'failed';
      const next = endStreamChatTurn(state, at, { text: '', isError: failed, turns: undefined });
      return failed && event.error ? add(next, { at, text: event.error, from: 'agent' }) : next;
    }
    default:
      return state;
  }
}
