import { closesFence, opensFence } from '../../lib/code-fence.js';
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
