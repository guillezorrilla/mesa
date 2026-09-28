import { MesaError } from '../lib/result.js';

/** One literal repository-relative pathspec, never a Git wildcard or option. */
export function literalPath(path: string): string {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\0') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new MesaError('usage', 'path must be a repository-relative file path');
  }
  return `:(literal)${path}`;
}
