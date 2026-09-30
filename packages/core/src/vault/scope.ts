import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { MesaError } from '../lib/result.js';
import { INTERNALS } from './layout.js';

// The vault's scope (CONTEXT.md, Vault scope): the one rule for which vault paths Mesa may touch.

/** Why a vault-relative path is out of the vault's scope. */
export type OutOfScope = 'outside the vault' | 'a vault internal' | 'a broken link';

const INTERNAL = new Set<string>(INTERNALS.map((name) => name.toLowerCase()));

/** Whether a vault-relative path is, or lies in, a vault internal (INTERNALS), in any folder. */
export const isInternal = (path: string) =>
  path.split('/').some((part) => INTERNAL.has(part.toLowerCase()));

/** Whether a path.relative result leaves the folder it is relative to. */
const leaves = (inside: string) =>
  inside === '..' || inside.startsWith('../') || isAbsolute(inside);

/** Whether anything is at `path`, a link whose target is missing included. */
const present = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Why `path` (vault-relative) is out of the vault's scope, or undefined when it is in. Out: an
 * empty or absolute path, one with a `..` part, one naming an internal, and one whose real target
 * leaves the vault or is an internal, through any symlinked file or folder on the way. The target
 * is followed to the nearest part that exists, so a path not written yet is in scope; a link
 * whose target is missing is not, since nothing proves where it will lead.
 */
export function outOfScope(vault: string, path: string): OutOfScope | undefined {
  if (isAbsolute(path) || path.split('/').includes('..')) return 'outside the vault';
  const file = resolve(vault, path);
  if (!relative(vault, file)) return 'outside the vault'; // the vault itself, not a path in it
  if (isInternal(path)) return 'a vault internal';
  if (!present(vault)) return undefined;
  let existing = file;
  while (!present(existing)) existing = dirname(existing);
  let real: string;
  try {
    real = realpathSync(existing);
  } catch {
    return 'a broken link';
  }
  const inside = relative(realpathSync(vault), real);
  if (leaves(inside)) return 'outside the vault';
  return isInternal(inside) ? 'a vault internal' : undefined;
}

/**
 * The absolute file for a vault-relative path in the vault's scope (outOfScope), for any read or
 * write of it; a path out of scope is refused as a usage error that says why.
 */
export function vaultFile(vault: string, path: string): string {
  const refused = outOfScope(vault, path);
  if (refused) throw new MesaError('usage', `vault path ${path} is ${refused}`);
  return resolve(vault, path);
}
