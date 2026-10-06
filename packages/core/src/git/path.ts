import { MesaError } from '../lib/result.js';

/** One file below a checkout, with no traversal, Git internals (any case: APFS folds it), or symlink traversal. */
export function relativeFilePath(path: string): string {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\0') ||
    path
      .split('/')
      .some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')
  ) {
    throw new MesaError('usage', 'path must be a repository-relative file');
  }
  return path;
}

/** One literal repository-relative pathspec, never a Git wildcard or option. */
export function literalPath(path: string): string {
  return `:(literal)${relativeFilePath(path)}`;
}
