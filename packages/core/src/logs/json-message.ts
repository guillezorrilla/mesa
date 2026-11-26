import { normalizedMessage } from './normalize.js';

// A log message that is a JSON object (CONTEXT.md, Logs panel): its readable title and the keys
// that make two of them the same error, ids and timestamps aside. Pure, so the app bundles it.

/** Fields that name what happened. */
const WHAT = ['action', 'event', 'type', 'operation'] as const;
/** Fields that say it in words. */
const TEXT = ['message', 'msg', 'error'] as const;

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;

/** `message` as a JSON object, when it is one. */
export function jsonObject(message: string): Record<string, unknown> | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** A JSON message's title: what happened and what it says ("findCustomer: status code 401"), when it names either. */
export function jsonTitle(json: Record<string, unknown>) {
  const what = WHAT.map((k) => text(json[k], 80)).find(Boolean);
  const said = TEXT.map((k) => text(json[k], 300)).find(Boolean);
  return [what, said].filter(Boolean).join(': ') || null;
}

/** What makes two JSON messages the same error: their naming fields, normalized; else their key names. */
export function jsonKey(json: Record<string, unknown>) {
  const named = [...WHAT, ...TEXT].flatMap((k) => {
    const value = text(json[k], 300);
    return value ? [`${k}=${normalizedMessage(value)}`] : [];
  });
  return named.length ? named.join(' ') : Object.keys(json).sort().join(',');
}

/** The values of a JSON message's naming fields, each one a search term its like all hold. */
export const jsonTerms = (json: Record<string, unknown>) =>
  WHAT.flatMap((k) => {
    const value = text(json[k], 80);
    return value ? [value] : [];
  });
