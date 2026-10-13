import type { Env, Runner } from '../../lib/process.js';
import { SESSION_ID_VAR } from '../../lib/window-vars.js';

// One bare question to Claude Haiku through Claude Code's print mode: Mesa's own small asks, such
// as a session's name (sessions/native/auto-name.ts).

/** A Haiku reply takes about 2 s; a slow one is dropped. */
const ASK_TIMEOUT_MS = 30_000;

/**
 * Haiku's reply to `prompt`, none when claude is missing, fails, or times out. Settings, hooks, MCP
 * servers and tools are off, and no transcript is kept; the Mesa session id is cleared, so a hook
 * that still runs logs into no session.
 */
export async function askHaiku(
  deps: { run: Runner; env: Env },
  prompt: string,
): Promise<string | undefined> {
  const res = await deps.run(
    'claude',
    [
      '-p',
      '--model',
      'haiku',
      '--no-session-persistence',
      '--setting-sources',
      '',
      '--strict-mcp-config',
      '--tools',
      '',
    ],
    ASK_TIMEOUT_MS,
    { env: { ...deps.env, [SESSION_ID_VAR]: '' }, input: prompt },
  );
  return res.ok ? res.stdout : undefined;
}
