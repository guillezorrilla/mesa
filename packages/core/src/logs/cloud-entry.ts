import type { LogLevel } from './parse.js';

// A Cloud Logs entry in the Logs panel's terms (CONTEXT.md, Cloud Logs), so both read and look
// alike: its severity as a level, and its message split from the stack it carries. Pure, so the
// app bundles it (`@mesa/core/browser`).

/** Cloud Logging's severities, the worst first. */
export const SEVERITIES = [
  'EMERGENCY',
  'ALERT',
  'CRITICAL',
  'ERROR',
  'WARNING',
  'NOTICE',
  'INFO',
  'DEBUG',
  'DEFAULT',
] as const;

/** Where `severity` sorts, the worst first; an unknown one last. */
export const severityRank = (severity: string) => {
  const at = SEVERITIES.indexOf(severity as (typeof SEVERITIES)[number]);
  return at < 0 ? SEVERITIES.length : at;
};

/** Severities whose names do not fit a level badge, shortened. */
const SHORT: Record<string, string> = { EMERGENCY: 'EMERG', CRITICAL: 'CRIT', WARNING: 'WARN' };

/** A severity as its badge says it: every one has one, DEFAULT and NOTICE too. */
export const severityLabel = (severity: string) => SHORT[severity] ?? severity;

const ERRORS = new Set<string>(SEVERITIES.slice(0, 4));
const INFO = new Set(['INFO', 'NOTICE']);

/** Cloud Logging's severity as a Logs panel level; DEFAULT is none. */
export function cloudLevel(severity: string): LogLevel | null {
  if (ERRORS.has(severity)) return 'error';
  if (severity === 'WARNING') return 'warn';
  if (INFO.has(severity)) return 'info';
  return severity === 'DEBUG' ? 'debug' : null;
}

/** A trace field's id, the part after `/traces/`, which a filter matches in every project. */
export const traceIdOf = (trace: string) => trace.split('/').at(-1) ?? trace;

/** An entry's service as the picker and `--service` name it: `<project>/<name>`. */
export const serviceRefOf = (entry: { project: string; service: string | null }) =>
  `${entry.project}/${entry.service ?? '-'}`;

/**
 * The registered project service `ref` (`<project>/<service>`) fixes in and Ask reads the code of,
 * from logs.fixProjects; undefined when it maps to none.
 */
export const mappedProject = (fixProjects: Record<string, string>, ref: string) =>
  Object.hasOwn(fixProjects, ref) ? fixProjects[ref] : undefined;

/** A message's first line, and the stack (the rest) it carries, null when none. */
export function splitMessage(message: string): { head: string; stack: string | null } {
  const at = message.indexOf('\n');
  return at < 0
    ? { head: message, stack: null }
    : { head: message.slice(0, at), stack: message.slice(at + 1) || null };
}
