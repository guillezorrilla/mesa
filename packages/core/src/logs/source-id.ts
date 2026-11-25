// A log source's id (CONTEXT.md, Logs panel): `<kind>:<name>`, the one place that builds and reads it.

export const LOG_SOURCE_KINDS = ['docker', 'session', 'file'] as const;
export type LogSourceKind = (typeof LOG_SOURCE_KINDS)[number];

/** The id of source `name` of `kind`. */
export const sourceId = (kind: LogSourceKind, name: string) => `${kind}:${name}`;

/** An id's kind and name; undefined for one that names no kind of source or no name. */
export function parseSourceId(id: string): { kind: LogSourceKind; name: string } | undefined {
  const colon = id.indexOf(':');
  const kind = id.slice(0, colon) as LogSourceKind;
  const name = id.slice(colon + 1);
  return colon > 0 && name && LOG_SOURCE_KINDS.includes(kind) ? { kind, name } : undefined;
}
