import { closeSync, mkdirSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';

/** The unique CLI log for one Mesa window, never the workspace-wide last-conversation cache. */
export const antigravityLog = (logs: string, id: string) => join(logs, `${id}.agy.log`);

export function prepareAntigravityLog(logs: string, id: string) {
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  return antigravityLog(logs, id);
}

const CREATED =
  /Created conversation ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

/** Antigravity 1.2.12 writes its native ID to the process's own log after the first prompt. */
export function antigravitySessionId(
  deps: { logs?: string },
  session: { id: string },
  taken: ReadonlySet<string>,
): string | undefined {
  if (!deps.logs) return undefined;
  let fd: number;
  try {
    fd = openSync(antigravityLog(deps.logs, session.id), 'r');
  } catch {
    return undefined;
  }
  // ponytail: the first MiB holds startup and first-turn ID; a larger log needs a bounded index.
  const bytes = Buffer.alloc(1024 * 1024);
  let read = 0;
  try {
    read = readSync(fd, bytes, 0, bytes.length, 0);
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
  const ids = [...bytes.subarray(0, read).toString('utf8').matchAll(CREATED)].map((match) =>
    match[1]?.toLowerCase(),
  );
  const id = ids.at(-1);
  return id && !taken.has(id) ? id : undefined;
}
