import type { ReplySegment } from '@mesa/core/phone';
import { type LineSelection, tapLine } from '../../lib/lineSelection';

/** One line of a reply, with the segment (prose or a code block) it is in. */
export type ReplyLine = { text: string; segment: number; code: boolean };

/** A reply's segments as the lines a person taps to quote. */
export const replyLines = (segments: readonly ReplySegment[]): ReplyLine[] =>
  segments.flatMap((segment, at) =>
    segment.text.split('\n').map((text) => ({ text, segment: at, code: segment.code })),
  );

/**
 * The selection after a tap on line `at`, kept inside one segment: the quoted passage must be a
 * run of the reply's own text, which a code block's fences would break.
 */
export function tapReplyLine(
  lines: readonly ReplyLine[],
  selection: LineSelection | undefined,
  at: number,
) {
  const across = selection && lines[selection.start]?.segment !== lines[at]?.segment;
  return tapLine(across ? undefined : selection, at);
}

/** The quoted passage: the selected lines as they are in the reply. */
export const passageOf = (lines: readonly ReplyLine[], selection: LineSelection) =>
  lines
    .slice(selection.start, selection.end + 1)
    .map((line) => line.text)
    .join('\n');
