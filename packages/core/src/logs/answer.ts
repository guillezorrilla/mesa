// What an Ask's answer carries besides its text (CONTEXT.md, Ask (logs)): a Logging query it
// suggests, in a fence tagged `query`, which the Explorer offers to apply. Pure, so the app bundles it.

const OPEN = '```query\n';
const CLOSE = '\n```';

/** An answer's suggested query and its text without that fence; no query when it suggests none. */
export function answerParts(answer: string): { text: string; query: string | null } {
  // Found by search, not a regex: an answer is model output, and a backtracking regex over it is slow.
  const start = answer.indexOf(OPEN);
  const end = start < 0 ? -1 : answer.indexOf(CLOSE, start + OPEN.length - 1);
  if (start < 0 || end < 0) return { text: answer, query: null };
  const query = answer.slice(start + OPEN.length, end).trim();
  const text = `${answer.slice(0, start)}${answer.slice(end + CLOSE.length)}`.trim();
  return { text, query: query || null };
}
