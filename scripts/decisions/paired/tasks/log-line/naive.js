// Log lines.

/** One log line for `event` with `fields`, as a string. */
export function logLine(event, fields = {}) {
  return JSON.stringify({ event, ...fields });
}
