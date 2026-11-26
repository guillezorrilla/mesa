import type { CloudLogEntry } from '@mesa/core';
import { groupTerms, quoted, splitMessage } from '@mesa/core/browser';

// The Explorer's query in the Logging query language (CONTEXT.md, Cloud Logs): clauses the fields
// pane and an entry's Show and Hide matching add to it, one per line, and the chips read back.

/** `query` with `clause` added (AND), or excluded (AND NOT) with `exclude`. */
export function withClause(query: string, clause: string, exclude = false) {
  const added = exclude ? `NOT ${clause}` : clause;
  return query.trim() ? `${query.trim()}\nAND ${added}` : added;
}

/** `query`'s lines, each without the AND that joins it. */
const linesOf = (query: string) =>
  query
    .trim()
    .split('\n')
    .map((line) => line.trim().replace(/^AND /, ''))
    .filter(Boolean);

/** `query` without the line holding `clause`, included or excluded. */
export const withoutClause = (query: string, clause: string) =>
  linesOf(query)
    .filter((line) => line !== clause && line !== `NOT ${clause}`)
    .join('\nAND ');

/** Whether `query` holds `clause` on a line of its own: `in`, `out` (NOT), or undefined. */
export function clauseState(query: string, clause: string) {
  for (const line of linesOf(query)) {
    if (line === clause) return 'in' as const;
    if (line === `NOT ${clause}`) return 'out' as const;
  }
}

const VALUE = '"((?:[^"\\\\]|\\\\.)*)"';
const FIELD = new RegExp(`^jsonPayload\\.([\\w.-]+)=${VALUE}$`);
const SERVICE = new RegExp(`^\\(?resource\\.labels\\.\\w+=${VALUE}`);

/** A quoted value as it reads, its escapes undone. */
const unquoted = (value: string) => value.replace(/\\(.)/g, '$1');

/** The clauses of `query` the fields pane wrote, each a chip: what it reads as, and whether excluded. */
export function paneClauses(query: string) {
  return linesOf(query).flatMap((line) => {
    const exclude = line.startsWith('NOT ');
    const clause = exclude ? line.slice(4) : line;
    const field = FIELD.exec(clause);
    const service = SERVICE.exec(clause);
    const label = field
      ? `${field[1]} = ${unquoted(field[2] ?? '')}`
      : /^severity=\w+$/.test(clause)
        ? `severity ${clause.slice(9)}`
        : service
          ? `service ${unquoted(service[1] ?? '')}`
          : undefined;
    return label ? [{ clause, exclude, label: exclude ? `not ${label}` : label }] : [];
  });
}

/** A context field's clause: `jsonPayload.<key>="<value>"`. */
export const fieldClause = (key: string, value: string) => `jsonPayload.${key}=${quoted(value)}`;

/** The clause matching entries like `entry`: the terms every message like it holds (groupTerms), anywhere. */
export function matchingClause(entry: Pick<CloudLogEntry, 'message'>) {
  const terms = groupTerms(entry.message);
  const head = splitMessage(entry.message).head;
  return (terms.length ? terms : [head.slice(0, 80)]).map(quoted).join(' AND ');
}
