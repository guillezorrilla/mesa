import { isAbsolute, relative } from 'node:path';
import {
  editHunk,
  firstLine,
  keep,
  resultText,
  type StepEvent,
  type ToolKind,
  type TranscriptStep,
  stringOf as text,
} from '../steps.js';
import { parsedLine } from '../transcripts.js';

// Claude Code's steps (agents/steps.ts) in its transcript: an assistant line's tool_use and
// thinking blocks start them, a user line's tool_result blocks finish its tool calls.

type Line = {
  type?: unknown;
  uuid?: unknown;
  cwd?: unknown;
  isSidechain?: unknown;
  message?: { content?: unknown };
};
type Input = Record<string, unknown>;
type ContentBlock = {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  thinking?: unknown;
  tool_use_id?: unknown;
  content?: unknown;
  is_error?: unknown;
};

/** Claude Code's tools by kind, and which input field names their target. */
const TOOLS: Record<string, [ToolKind, string]> = {
  Read: ['read', 'file_path'],
  Grep: ['search', 'pattern'],
  Glob: ['search', 'pattern'],
  LS: ['list', 'path'],
  Bash: ['command', 'command'],
  WebSearch: ['web', 'query'],
  WebFetch: ['web', 'url'],
  Task: ['agent', 'description'],
  Agent: ['agent', 'description'],
  TodoWrite: ['plan', ''],
};

/** An Edit, MultiEdit, Write or NotebookEdit call as an edit of its file; none for another tool. */
/** Claude Code writes absolute paths; one under its folder reads as the changes list names it. */
function inFolder(cwd: string, written: string) {
  const inside = cwd && isAbsolute(written) ? relative(cwd, written) : '';
  return inside && !inside.startsWith('..') ? inside : written;
}

function editOf(id: string, name: string, input: Input, cwd: string): TranscriptStep | undefined {
  const path = inFolder(cwd, text(input.file_path) || text(input.notebook_path));
  const parts =
    name === 'Edit'
      ? [[text(input.old_string), text(input.new_string)]]
      : name === 'MultiEdit' && Array.isArray(input.edits)
        ? (input.edits as Input[]).map((edit) => [text(edit.old_string), text(edit.new_string)])
        : name === 'Write'
          ? [['', text(input.content)]]
          : name === 'NotebookEdit'
            ? [['', text(input.new_source)]]
            : undefined;
  if (!parts || !path) return undefined;
  const hunks = parts.map(([before = '', after = '']) => editHunk(before, after));
  return {
    type: 'edit',
    id,
    path,
    added: hunks.reduce((sum, hunk) => sum + hunk.added, 0),
    removed: hunks.reduce((sum, hunk) => sum + hunk.removed, 0),
    hunk: hunks.flatMap((hunk) => hunk.hunk),
    status: 'running',
  };
}

/** A tool_use block as a step. */
function toolOf(block: ContentBlock, cwd: string): TranscriptStep | undefined {
  const id = text(block.id);
  const name = text(block.name);
  if (!id || !name) return undefined;
  const input = block.input && typeof block.input === 'object' ? (block.input as Input) : {};
  const edit = editOf(id, name, input, cwd);
  if (edit) return edit;
  const [kind, field] = TOOLS[name] ?? ['other', ''];
  return {
    type: 'tool',
    id,
    kind,
    name,
    target:
      field === 'file_path'
        ? inFolder(cwd, text(input[field]))
        : field
          ? firstLine(input[field])
          : '',
    status: 'running',
    output: '',
  };
}

/** The steps one Claude Code transcript line starts or finishes; sidechains are a subagent's. */
export function claudeStepEvents(line: string): StepEvent[] {
  const entry = parsedLine<Line>(line);
  if (!entry || entry.isSidechain === true || !Array.isArray(entry.message?.content)) return [];
  const blocks = entry.message.content as ContentBlock[];
  if (entry.type === 'user')
    return blocks.flatMap((block) =>
      block?.type === 'tool_result' && typeof block.tool_use_id === 'string'
        ? [
            {
              result: {
                id: block.tool_use_id,
                failed: block.is_error === true,
                output: resultText(block.content),
              },
            },
          ]
        : [],
    );
  if (entry.type !== 'assistant') return [];
  return blocks.flatMap((block, at): StepEvent[] => {
    if (block?.type === 'tool_use') {
      const step = toolOf(block, text(entry.cwd));
      return step ? [{ start: step }] : [];
    }
    if (block?.type === 'thinking' && text(block.thinking).trim())
      return [
        {
          start: {
            type: 'thought',
            id: `${text(entry.uuid)}:${at}`,
            text: keep(text(block.thinking)),
          },
        },
      ];
    return [];
  });
}
