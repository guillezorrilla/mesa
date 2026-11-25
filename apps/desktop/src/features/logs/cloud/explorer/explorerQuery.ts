import type { CloudLogEntry } from '@mesa/core';
import { groupText, splitMessage } from '@mesa/core/browser';

// The Explorer's query in the Logging query language (CONTEXT.md, Cloud Logs): clauses the fields
// pane and an entry's Show and Hide matching add to it.

/** `query` with `clause` added (AND), or excluded (AND NOT) with `exclude`. */
export function withClause(query: string, clause: string, exclude = false) {
  const added = exclude ? `NOT ${clause}` : clause;
  return query.trim() ? `${query.trim()}\nAND ${added}` : added;
}

/** A context field's clause: `jsonPayload.<key>="<value>"`. */
export const fieldClause = (key: string, value: string) =>
  `jsonPayload.${key}=${JSON.stringify(value)}`;

/** The clause matching entries like `entry`: the words of its message before any id, anywhere. */
export function matchingClause(entry: Pick<CloudLogEntry, 'message'>) {
  const head = splitMessage(entry.message).head;
  return JSON.stringify(groupText(head) || head.slice(0, 80));
}
