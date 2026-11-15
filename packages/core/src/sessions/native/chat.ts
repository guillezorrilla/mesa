import { runSentence } from '../../agents/step-words.js';
import { firstLine } from '../../agents/steps.js';
import { clip } from '../../lib/clip.js';
import { MesaError } from '../../lib/result.js';
import {
  type NativeCommand,
  type NativePrompt,
  type NativeResponse,
  type NativeStep,
  type ResponseDeps,
  sessionResponses,
} from './responses.js';

/**
 * One message of a session's chat: the agent's reply, the person's prompt, or a slash command the
 * person ran (`text` the command as typed, `output` what it printed, colours kept, `error` when to
 * stderr); its revision as its id.
 */
export type ChatMessage = {
  id: string;
  at: string | null;
  text: string;
  from: 'agent' | 'you' | 'command';
  output?: string;
  error?: true;
};

/** One step of a run as its list shows it: a line, and whether it is still going or failed. */
export type ChatStepLine = { id: string; line: string; status: string };

/**
 * What the agent did between two replies (#1171): its steps in time order and `text`, their
 * sentence ("Read 3 files, ran 2 commands"). Its id is its first step's.
 */
export type ChatRun = {
  id: string;
  at: string | null;
  text: string;
  from: 'steps';
  steps: ChatStepLine[];
  /** The files the run's edits changed, each once with its lines summed, in first-edit order; none when it edited none. */
  edits?: ChatFileEdit[];
};

/** One file a run edited: its path as the agent wrote it, and the lines it added and removed. */
export type ChatFileEdit = { path: string; added: number; removed: number };

/** `steps`' edits, one per file. */
const fileEdits = (steps: NativeStep[]): ChatFileEdit[] => {
  const files = new Map<string, ChatFileEdit>();
  for (const step of steps) {
    if (step.type !== 'edit') continue;
    const file = files.get(step.path) ?? { path: step.path, added: 0, removed: 0 };
    file.added += step.added;
    file.removed += step.removed;
    files.set(step.path, file);
  }
  return [...files.values()];
};

/** A message or a run of steps, as the chat lists them. */
export type ChatItem = ChatMessage | ChatRun;

/** How long a step's line may be. */
const LINE = 160;

const stepLine = (step: NativeStep): ChatStepLine => ({
  id: step.id,
  status: step.type === 'thought' ? 'done' : step.status,
  line: clip(
    step.type === 'thought'
      ? firstLine(step.text)
      : step.type === 'edit'
        ? `Edited ${step.path} +${step.added} -${step.removed}`
        : `${step.name} ${firstLine(step.target)}`.trim(),
    LINE,
  ),
});

/** A session's chat as `mesa chat` prints it: oldest first, how many, and whether older replies exist. */
export type SessionChat = {
  messages: ChatItem[];
  count: number;
  more: boolean;
  /** Why the session's transcript cannot be read yet (sessionResponses), none when it can. */
  unavailable?: string;
};

/** How many replies a chat opens with. */
export const CHAT_COUNT = 20;

/**
 * The agent's newest `count` replies with, when `withPrompts`, the person's prompts and commands
 * placed among them, newest first, and whether older replies exist. `read` is sessionResponses',
 * which leaves out tool results and injected text. With `steps` (newest first, as sessionResponses
 * reads them), each gap's steps follow the prompts that started it as one run.
 */
export function chatMessages(
  read: {
    rows: Pick<NativeResponse, 'revision' | 'text' | 'at'>[];
    prompts: NativePrompt[];
    commands?: NativeCommand[];
  },
  count: number,
  withPrompts = true,
  steps: NativeStep[] = [],
): { messages: ChatItem[]; more: boolean } {
  const message = (
    id: string,
    at: string | undefined,
    text: string,
    from: ChatMessage['from'],
  ): ChatMessage => ({
    id,
    at: at ?? null,
    text,
    from,
  });
  const ran = (command: NativeCommand): ChatMessage => ({
    ...message(command.revision, command.at, command.command, 'command'),
    ...(command.output !== undefined ? { output: command.output } : {}),
    ...(command.error ? { error: true as const } : {}),
  });
  // Newest first, as both lists are; one with no time goes oldest.
  const promptsBefore = (newer: number) =>
    withPrompts
      ? [
          ...read.prompts
            .filter((prompt) => prompt.newer === newer)
            .map((prompt) => message(prompt.revision, prompt.at, prompt.text, 'you')),
          ...(read.commands ?? []).filter((command) => command.newer === newer).map(ran),
        ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
      : [];
  // Newest first, so a gap's run comes before its prompts: the prompt came first.
  const runBefore = (newer: number, at?: string): ChatRun[] => {
    const run = steps.filter((step) => step.newer === newer).reverse();
    const first = run[0];
    const edits = fileEdits(run);
    return first
      ? [
          {
            id: `steps:${first.id}`,
            at: at ?? null,
            text: runSentence(run),
            from: 'steps',
            steps: run.map(stepLine),
            ...(edits.length ? { edits } : {}),
          },
        ]
      : [];
  };
  return {
    messages: [
      ...runBefore(0),
      ...promptsBefore(0),
      ...read.rows
        .slice(0, count)
        .flatMap((row, index) => [
          message(row.revision, row.at, row.text, 'agent'),
          ...runBefore(index + 1, row.at),
          ...promptsBefore(index + 1),
        ]),
    ],
    more: read.rows.length > count,
  };
}

/**
 * Session `id`'s chat: its agent's newest `count` replies and the person's prompts among them,
 * oldest first, read from its native transcript (Claude Code or Codex).
 */
export function sessionChat(deps: ResponseDeps, id: string, count = CHAT_COUNT): SessionChat {
  if (!Number.isInteger(count) || count < 1)
    throw new MesaError('usage', 'count must be a whole number above 0');
  // One more than shown, to know whether older replies exist.
  const read = sessionResponses(deps, id, count + 1);
  const { messages, more } = chatMessages(read, count, true, read.steps);
  return {
    messages: messages.reverse(),
    count: messages.length,
    more,
    ...(read.unavailable ? { unavailable: read.unavailable } : {}),
  };
}
