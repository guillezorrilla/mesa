import { MesaError } from '../lib/result.js';

/**
 * The installed Mesa.app this mesa runs inside (`<app>/Contents/MacOS/mesa`, ADR-0017). A mesa
 * outside an app (a development build), or an app run from the disk image or a translocated copy,
 * has no app of its own to update.
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
