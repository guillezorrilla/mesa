import { closesFence, opensFence } from '../../lib/code-fence.js';
import { chatMessages } from '../../sessions/native/chat.js';
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
 * The session screen's conversation, newest first (chatMessages), each message cut into
 * segments. An older phone does not ask for prompts, which it would show as the agent's.
 */
export function phoneReplies(
  read: { rows: Pick<NativeResponse, 'revision' | 'text' | 'at'>[]; prompts: NativePrompt[] },
  count: number,
  withPrompts: boolean,
) {
  // The phone shows no command rows: its protocol has none.
  const { messages, more } = chatMessages(
    { rows: read.rows, prompts: read.prompts },
    count,
    withPrompts,
  );
  return {
    // The phone shows neither steps nor command rows: its protocol has none.
    replies: messages.flatMap((message) =>
      message.from === 'steps' || message.from === 'command'
        ? []
        : [
            {
              id: message.id,
              at: message.at,
              from: message.from,
              segments:
                message.from === 'you'
                  ? [{ code: false, text: message.text }]
                  : replySegments(message.text),
            },
          ],
    ),
    more,
  };
}
