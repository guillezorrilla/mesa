import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';

/**
 * The installed Mesa.app this mesa runs inside (`<app>/Contents/MacOS/mesa`, ADR-0017). A mesa
 * outside an app (a development build), or an app run from the disk image or a translocated copy,
 * cannot replace itself.
 */
export function appBundle(self: readonly string[], page: string): string {
  const app = /^(.+\.app)\/Contents\/MacOS\/[^/]+$/.exec(self[0] ?? '')?.[1];
  if (!app || app.startsWith('/Volumes/') || app.includes('/AppTranslocation/')) {
    throw new MesaError(
      'not_found',
      `This mesa is not part of an installed Mesa.app, so it cannot update itself. Download Mesa from ${page}`,
    );
  }
  return app;
}

/**
 * Replaces `app` with the Mesa.app in `archive` (a verified update archive): unpacked beside it,
 * so both renames stay on one volume, and the old app is put back if the new one cannot move in.
 */
export async function replaceBundle(app: string, archive: Uint8Array, run: Runner) {
  const work = mkdtempSync(join(dirname(app), '.mesa-update-'));
  try {
    const file = join(work, 'Mesa.app.tar.gz');
    writeFileSync(file, archive);
    const unpacked = await run('/usr/bin/tar', ['-xzf', file, '-C', work], 120_000);
    const fresh = join(work, 'Mesa.app');
    if (!unpacked.ok || !existsSync(fresh)) {
      throw new MesaError('internal', `The update archive does not unpack to Mesa.app`);
    }
    const old = join(work, 'old.app');
    renameSync(app, old);
    try {
      renameSync(fresh, app);
    } catch (error) {
      renameSync(old, app);
      throw error;
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
