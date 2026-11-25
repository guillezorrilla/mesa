// A log source (CONTEXT.md, Logs panel): its id, `<kind>:<name>`, the one place that builds and
// reads it, and how a person sees it named. Pure, so the app bundles it (`@mesa/core/browser`).

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

/** Whether a source printed lately: a line in the last minute, none since, or its container exited. */
export type LogSourceState = 'live' | 'quiet' | 'stopped';

export type LogSource = {
  /** `docker:<container>`, `session:<id>` or `file:<name>`. */
  id: string;
  kind: LogSourceKind;
  name: string;
  detail: string;
  state: LogSourceState;
  /** When it printed its last line, as an ISO time; null when it has printed none. */
  lastLine: string | null;
};

const KIND_NAMES: Record<LogSourceKind, string> = {
  docker: 'Docker',
  session: 'Session',
  // A log file is an IDE's saved console, which the IntelliJ steps set up.
  file: 'IntelliJ',
};

/** A source as a person reads it: its kind, then its name ("IntelliJ · api-2"). */
export const sourceLabel = (source: Pick<LogSource, 'kind' | 'name'>) =>
  `${KIND_NAMES[source.kind]} · ${source.name}`;

/** How long a source may go without a line and still read as live. */
export const LIVE_MS = 60_000;
