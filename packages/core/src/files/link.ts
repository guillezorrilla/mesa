import { isAbsolute, relative } from 'node:path';
import type { MesaContext } from '../context.js';
import { resolveCheckout } from '../git/checkout.js';
import { MesaError } from '../lib/result.js';
import { readWorkspaceFile } from './editor.js';

export type FileLink = { project: string; checkout: string; path: string; line: number };

/** Resolve terminal text only against the managed session's selected checkout. */
export async function resolveSessionFileLink(
  ctx: MesaContext,
  sessionId: string,
  target: string,
): Promise<FileLink> {
  const session = ctx.store.get(sessionId);
  const checkout = await resolveCheckout(
    ctx.open(),
    ctx.deps.run,
    session.project,
    session.worktree?.path,
  );
  const match = /^(.*?)(?::([1-9]\d*)(?::\d+)?)?$/.exec(target.trim());
  if (!match?.[1]) throw new MesaError('usage', 'file link needs a path');
  const line = Number(match[2] ?? 1);
  if (!Number.isSafeInteger(line)) throw new MesaError('usage', 'file link line is invalid');
  const path = isAbsolute(match[1]) ? relative(checkout.path, match[1]) : match[1];
  const file = readWorkspaceFile(checkout, path, line);
  return { project: session.project, checkout: checkout.path, path: file.path, line };
}
