// Log lines.

/** One log line for `event` with `fields`, as a string. */
export function logLine(event, fields = {}) {
  const safe = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, k.endsWith('Email') ? '[redacted]' : v]),
  );
  return JSON.stringify({ event, ...safe });
}
