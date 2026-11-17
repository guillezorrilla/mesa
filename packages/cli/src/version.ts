import { createRequire } from 'node:module';
import { getAsset, isSea } from 'node:sea';

// Node builtins only: the entrypoint's fast path sends it before loading core (ADR-0032).

/** This Mesa's version: an asset inside the app's single executable (ADR-0017), else package.json's. */
export const VERSION: string = isSea()
  ? getAsset('version', 'utf8')
  : createRequire(import.meta.url)('../package.json').version;
