import { closesFence, opensFence } from '../../lib/code-fence.js';
import type { NativePrompt, NativeResponse } from '../../sessions/native/responses.js';
import type { ReplySegment } from '../protocol/rpc.js';

/**
 * A reply cut into prose and fenced code, in order, so the phone shows each block apart to copy.
 * A code segment holds the block's contents without its fences; an unclosed block runs to the end.
 */
export function replySegments(text: string): ReplySegment[] {
  const segments: ReplySegment[] = [];
  let open: { marker: string } | undefined;
  let lines: string[] = [];
  const flush = (code: boolean) => {
    const body = lines.join('\n');
    if (body.trim()) segments.push({ code, text: code ? body : body.trim() });
    lines = [];
  };
  for (const line of text.split('\n')) {
    if (open && closesFence(line, open.marker)) {
      flush(true);
      open = undefined;
    } else if (!open && opensFence(line)) {
      flush(false);
      open = opensFence(line);
    } else lines.push(line);
  }
  flush(Boolean(open));
  return segments;
}

/**
 * The session screen's conversation, newest first: the agent's newest `count` replies with, when
 * `withPrompts`, the person's prompts placed among them, and whether older replies exist. An older
 * phone does not ask for prompts, which it would show as the agent's.
 */
export function phoneReplies(
  read: { rows: Pick<NativeResponse, 'revision' | 'text' | 'at'>[]; prompts: NativePrompt[] },
  count: number,
  withPrompts: boolean,
) {
  const reply = (id: string, at: string | undefined, text: string, from: 'agent' | 'you') => ({
    id,
    at: at ?? null,
    segments: from === 'you' ? [{ code: false, text }] : replySegments(text),
    from,
  });
  const rows = read.rows.slice(0, count);
  const promptsBefore = (newer: number) =>
    withPrompts
      ? read.prompts
          .filter((prompt) => prompt.newer === newer)
          .map((prompt) => reply(prompt.revision, prompt.at, prompt.text, 'you'))
      : [];
  return {
    replies: [
      ...promptsBefore(0),
      ...rows.flatMap((row, index) => [
        reply(row.revision, row.at, row.text, 'agent'),
        ...promptsBefore(index + 1),
      ]),
    ],
    more: read.rows.length > count,
  };
}
