import {
  firstLine,
  HUNK_LINES,
  keep,
  resultText,
  type StepEvent,
  type ToolKind,
  type TranscriptStep,
  stringOf as text,
} from '../steps.js';
import { parsedLine } from '../transcripts.js';

// Codex's steps (agents/steps.ts) in its rollout: function, custom and shell calls start tool
// calls (an apply_patch call its edits), their outputs finish them, a reasoning item's summary is
// its reasoning.

type Payload = {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  call_id?: unknown;
  arguments?: unknown;
  input?: unknown;
  output?: unknown;
  action?: { command?: unknown; query?: unknown };
  summary?: unknown;
};

/** Codex's tools by kind; any other name is `other`. */
const KINDS: Record<string, ToolKind> = {
  shell: 'command',
  exec: 'command',
  exec_command: 'command',
  local_shell: 'command',
  update_plan: 'plan',
  web_search: 'web',
  view_image: 'read',
  spawn_agent: 'agent',
};

/** A function call's arguments, parsed when they are a JSON object. */
function argumentsOf(raw: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** A command as one line: an argv's last word after `bash -lc`, or the string itself. */
function commandLine(command: unknown): string {
  if (Array.isArray(command)) {
    const words = command.map(text);
    return firstLine(words[0] === 'bash' && words.length === 3 ? words[2] : words.join(' '));
  }
  return firstLine(command);
}

/** Each file an apply_patch patch adds, deletes or updates, as an edit with its lines. */
export function patchEdits(id: string, patch: string): TranscriptStep[] {
  const edits: { path: string; lines: string[] }[] = [];
  for (const line of patch.split('\n')) {
    const file = /^\*\*\* (?:Add|Delete|Update) File: (.+)$/.exec(line);
    if (file?.[1]) edits.push({ path: file[1].trim(), lines: [] });
    else if (/^[-+ ]/.test(line) && !line.startsWith('***')) edits.at(-1)?.lines.push(line);
  }
  return edits.map((edit, at) => ({
    type: 'edit',
    id: at ? `${id}:${at}` : id,
    path: edit.path,
    added: edit.lines.filter((line) => line.startsWith('+')).length,
    removed: edit.lines.filter((line) => line.startsWith('-')).length,
    hunk: edit.lines.slice(0, HUNK_LINES),
    status: 'running',
  }));
}

/** A call's output: its text, and whether a JSON output says it exited non-zero. */
function outputOf(raw: unknown) {
  const output = resultText(raw);
  const exit = /"exit_code"\s*:\s*(-?\d+)/.exec(output.slice(0, 2000))?.[1];
  return { output, failed: exit !== undefined && exit !== '0' };
}

/** One call as its steps. */
function callSteps(payload: Payload): TranscriptStep[] {
  const id = text(payload.call_id) || text(payload.id);
  const name = text(payload.name) || 'local_shell';
  if (!id) return [];
  const args = argumentsOf(payload.arguments);
  const input = text(payload.input) || text(args.input);
  if (name === 'apply_patch') return patchEdits(id, input);
  const kind = KINDS[name] ?? 'other';
  const target =
    payload.type === 'local_shell_call'
      ? commandLine(payload.action?.command)
      : kind === 'command'
        ? commandLine(args.command ?? args.cmd ?? input)
        : firstLine(args.query ?? args.path ?? args.message ?? '');
  return [{ type: 'tool', id, kind, name, target, status: 'running', output: '' }];
}

/** The steps one rollout line starts or finishes. */
export function codexStepEvents(line: string): StepEvent[] {
  const entry = parsedLine<{ type?: unknown; payload?: Payload }>(line);
  const payload = entry?.type === 'response_item' ? entry.payload : undefined;
  switch (payload?.type) {
    case 'function_call':
    case 'custom_tool_call':
    case 'local_shell_call':
      return callSteps(payload).map((start) => ({ start }));
    case 'function_call_output':
    case 'custom_tool_call_output':
      return text(payload.call_id)
        ? [{ result: { id: text(payload.call_id), ...outputOf(payload.output) } }]
        : [];
    case 'web_search_call':
      return text(payload.id)
        ? [
            {
              start: {
                type: 'tool',
                id: text(payload.id),
                kind: 'web',
                name: 'web_search',
                target: firstLine(payload.action?.query),
                status: 'done',
                output: '',
              },
            },
          ]
        : [];
    case 'reasoning': {
      const summary = Array.isArray(payload.summary)
        ? (payload.summary as { text?: unknown }[]).map((part) => text(part?.text)).join('\n\n')
        : '';
      return summary.trim() && text(payload.id)
        ? [{ start: { type: 'thought', id: text(payload.id), text: keep(summary) } }]
        : [];
    }
    default:
      return [];
  }
}
