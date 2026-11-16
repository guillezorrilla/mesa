import { existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/** A path through its symlinks while it exists; one that does not, resolved as written. */
const real = (path: string) => (existsSync(path) ? realpathSync(path) : resolve(path));

/** Whether `path`, through its symlinks, is `folder` or inside it. */
export function inside(path: string, folder: string): boolean {
  const [target, root] = [real(path), real(folder)];
  return target === root || target.startsWith(`${root}${sep}`);
}
