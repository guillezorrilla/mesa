import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getAsset, isSea } from 'node:sea';
import { fileURLToPath } from 'node:url';

// Node builtins only: the entrypoint's fast path sends both before loading core (ADR-0032).

/** This Mesa's version: an asset inside the app's single executable (ADR-0017), else package.json's. */
export const VERSION: string = isSea()
  ? getAsset('version', 'utf8')
  : createRequire(import.meta.url)('../package.json').version;

/** When `path` last changed, or empty when it cannot be read. */
const stamp = (path: string) => {
  try {
    return String(statSync(path).mtimeMs);
  } catch {
    return '';
  }
};

/**
 * Which build of this version runs, so a Command server and a client of different code never mix
 * (ADR-0032): the executable's build number and when it was written, or for a dev run when tsc
 * last wrote the CLI and core (every build rewrites each file it emits).
 */
export const BUILD: string = isSea()
  ? `${getAsset('build', 'utf8')}:${stamp(process.execPath)}`
  : `${stamp(fileURLToPath(import.meta.url))}:${stamp(fileURLToPath(new URL('../../core/dist/index.js', import.meta.url)))}`;
