import type { LogLevel } from './parse.js';

// A Cloud Logs entry in the Logs panel's terms (CONTEXT.md, Cloud Logs), so both read and look
// alike: its severity as a level, and its message split from the stack it carries. Pure, so the
// app bundles it (`@mesa/core/browser`).

const ERRORS = new Set(['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY']);
const INFO = new Set(['INFO', 'NOTICE']);

/** Cloud Logging's severity as a Logs panel level; DEFAULT is none. */
export function cloudLevel(severity: string): LogLevel | null {
  if (ERRORS.has(severity)) return 'error';
  if (severity === 'WARNING') return 'warn';
  if (INFO.has(severity)) return 'info';
  return severity === 'DEBUG' ? 'debug' : null;
}

/** A message's first line, and the stack (the rest) it carries, null when none. */
export function splitMessage(message: string): { head: string; stack: string | null } {
  const at = message.indexOf('\n');
  return at < 0
    ? { head: message, stack: null }
    : { head: message.slice(0, at), stack: message.slice(at + 1) || null };
}
