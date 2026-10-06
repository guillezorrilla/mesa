import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { relativeFilePath } from '../git/path.js';
import { MesaError } from '../lib/result.js';

export function checkedFilePath(root: string, path: string, create = false): string {
  const parts = relativeFilePath(path).split('/');
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

/** Creates only missing parent directories, refusing links or a path outside this checkout. */
export function createCheckedFilePath(root: string, path: string): string {
  const parts = relativeFilePath(path).split('/');
  const canonicalRoot = realpathSync.native(root);
  let parent = canonicalRoot;
  for (const part of parts.slice(0, -1)) {
    const target = join(parent, part);
    try {
      mkdirSync(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stat = lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new MesaError('usage', `${path} has an unsafe parent`);
    parent = realpathSync.native(target);
    if (parent !== canonicalRoot && !parent.startsWith(`${canonicalRoot}/`))
      throw new MesaError('usage', `${path} leaves the checkout`);
  }
  return checkedFilePath(root, path, true);
}
