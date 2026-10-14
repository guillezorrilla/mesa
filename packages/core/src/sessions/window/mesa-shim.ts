import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic } from '../../lib/atomic-file.js';
import { shellWord } from '../../lib/process.js';

/**
 * The PATH a session's window gets: `dir` first, holding a `mesa` that runs `self`, the build that
 * started the session, so an agent's bare `mesa prs draft 482` reaches this Mesa whatever else is
 * on PATH. The script is written only when it changes.
 */
export function mesaOnPath(dir: string, self: readonly string[], path: string | undefined) {
  const script = `#!/bin/sh\nexec ${self.map(shellWord).join(' ')} "$@"\n`;
  const file = join(dir, 'mesa');
  let current: string | undefined;
  try {
    current = readFileSync(file, 'utf8');
  } catch {
    // None yet: written below.
  }
  if (current !== script) {
    mkdirSync(dir, { recursive: true });
    writeFileAtomic(file, script, 0o755);
  }
  return path ? `${dir}:${path}` : dir;
}
