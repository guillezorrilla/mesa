import type { ReviewNote } from './review-notes.js';

/** What the prompt needs from a note. */
type PromptNote = Pick<ReviewNote, 'path' | 'line' | 'end' | 'scope' | 'text' | 'quoted'>;

/** `text` fenced with more backticks than any run inside it. */
const fenced = (text: string) => {
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map((run) => run.length + 1)));
  return `${fence}\n${text}\n${fence}`;
};

/**
 * Review notes as the agent reads them: a line saying what they are, then each note's file, lines
 * (or `Scope: file`), the lines it quotes, and the note. A send types it; the app copies it.
 */
export function notesPrompt(notes: readonly PromptNote[]): string {
  const blocks = notes.map((n) =>
    [
      `File: ${n.path}${n.scope === 'branch' ? '' : ` (${n.scope})`}`,
      ...(n.line === 0 ? ['Scope: file'] : [`Lines: ${n.line}-${n.end}`, fenced(n.quoted)]),
      `Note: ${n.text}`,
    ].join('\n'),
  );
  return [
    `These are the person's review notes on this session's diff (${notes.length}).`,
    ...blocks,
  ].join('\n\n');
}
