import { lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { MesaError } from '../lib/result.js';

/** One file below a checkout, with no traversal, Git internals, or symlink traversal. */
export function relativeFilePath(path: string): string {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\0') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new MesaError('usage', 'path must be a repository-relative file');
  }
  return path;
}

export function checkedFilePath(root: string, path: string, create = false): string {
  const parts = relativeFilePath(path).split('/');
  if (parts.includes('.git')) throw new MesaError('usage', 'Git internals cannot be edited');
  const canonicalRoot = realpathSync.native(root);
  let parent = canonicalRoot;
  for (const [index, part] of parts.entries()) {
    const target = join(parent, part);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(target);
    } catch (error) {
      if (
        create &&
        index === parts.length - 1 &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return target;
      }
      throw new MesaError('not_found', `file ${path} is unavailable`);
    }
    if (stat.isSymbolicLink()) throw new MesaError('usage', `file ${path} crosses a symlink`);
    if (index === parts.length - 1) {
      if (create) throw new MesaError('usage', `file ${path} already exists`);
      if (!stat.isFile()) throw new MesaError('usage', `${path} is not a regular file`);
    } else {
      if (!stat.isDirectory()) throw new MesaError('usage', `${path} has a non-directory parent`);
      parent = realpathSync.native(target);
      if (parent !== canonicalRoot && !parent.startsWith(`${canonicalRoot}/`)) {
        throw new MesaError('usage', `file ${path} leaves the checkout`);
      }
    }
  }
  return join(parent, parts.at(-1) as string);
}
