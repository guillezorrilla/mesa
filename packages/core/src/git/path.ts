import { relativeFilePath } from '../files/path.js';

/** One literal repository-relative pathspec, never a Git wildcard or option. */
export function literalPath(path: string): string {
  return `:(literal)${relativeFilePath(path)}`;
}
