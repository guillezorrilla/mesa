import { isAbsolute, relative } from 'node:path';
import type { MesaContext } from '../context.js';
import { resolveCheckout } from '../git/checkout.js';
import { MesaError } from '../lib/result.js';
import { readWorkspaceFile } from './editor.js';
import { parseFileTarget } from './file-target.js';

export type FileLink = { project: string; checkout: string; path: string; line: number };

/** Resolve terminal text only against the managed session's selected checkout. */
export async function resolveSessionFileLink(
  ctx: Pick<MesaContext, 'store' | 'open' | 'run'>,
  sessionId: string,
  target: string,
): Promise<FileLink> {
  const session = ctx.store.get(sessionId);
  const checkout = await resolveCheckout(
    ctx.open(),
    ctx.run,
    session.project,
    session.worktree?.path,
  );
  const parsed = parseFileTarget(target);
  if (!parsed) throw new MesaError('usage', 'file link needs a path');
  const line = parsed.line ?? 1;
  if (!Number.isSafeInteger(line)) throw new MesaError('usage', 'file link line is invalid');
  const path = isAbsolute(parsed.path) ? relative(checkout.path, parsed.path) : parsed.path;
  const file = readWorkspaceFile(checkout, path, line);
  return { project: session.project, checkout: checkout.path, path: file.path, line };
}
