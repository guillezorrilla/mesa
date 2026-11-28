// What an Ask's run may run in its shell (CONTEXT.md, Ask (logs)): Claude Code approves read-only
// commands such as grep and cat on its own inside the folders a run reads, which would read a
// project's secrets past its deny rules. A PreToolUse hook (`mesa hook ask-guard`) lets through
// only one read-only `mesa logs` call, nothing chained, substituted or redirected. Pure.

/** The commands an Ask's run may run: Cloud Logs reads. */
const READS = ['mesa logs gcp', 'mesa logs errors', 'mesa logs counts'];

/** Characters that end, chain, redirect or substitute a command when unquoted. */
const UNQUOTED = new Set([';', '&', '|', '<', '>', '`', '$', '(', ')', '\n', '\r', '\\']);
/** Characters that still substitute inside double quotes. */
const IN_DOUBLE = new Set(['`', '$', '\\']);

/**
 * Whether `command` is one Cloud Logs read and nothing else: it starts with one of READS, and has
 * no unquoted separator, redirection, substitution or escape, and no substitution in double quotes.
 */
export function askCommandAllowed(command: string) {
  const text = command.trim();
  if (!READS.some((read) => text === read || text.startsWith(`${read} `))) return false;
  let quote: "'" | '"' | undefined;
  for (const char of text) {
    if (quote === "'") {
      if (char === "'") quote = undefined;
    } else if (quote === '"') {
      if (char === '"') quote = undefined;
      else if (IN_DOUBLE.has(char)) return false;
    } else if (char === "'" || char === '"') quote = char;
    else if (UNQUOTED.has(char)) return false;
  }
  return quote === undefined;
}

/** The Bash command a PreToolUse hook payload carries; empty when it carries none. */
export function hookCommand(payload: string) {
  try {
    const parsed = JSON.parse(payload) as { tool_input?: { command?: unknown } };
    return typeof parsed.tool_input?.command === 'string' ? parsed.tool_input.command : '';
  } catch {
    return '';
  }
}
