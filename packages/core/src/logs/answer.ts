// What an Ask's answer carries besides its text (CONTEXT.md, Ask (logs)): a Logging query it
// suggests, in a fence tagged `query`, which the Explorer offers to apply. Pure, so the app bundles it.

const QUERY_FENCE = /```query\n([\s\S]*?)\n```/;

/** An answer's suggested query and its text without that fence; no query when it suggests none. */
export function answerParts(answer: string): { text: string; query: string | null } {
  const match = QUERY_FENCE.exec(answer);
  if (!match) return { text: answer, query: null };
  return { text: answer.replace(match[0], '').trim(), query: (match[1] ?? '').trim() || null };
}
