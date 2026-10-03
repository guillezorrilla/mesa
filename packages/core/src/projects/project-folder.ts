import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { projectCandidate } from './discover.js';

// Which project folder a working folder is in, for a conversation that ran outside Mesa.

/**
 * The project folder holding `cwd`: the nearest folder at or above it, below `home`, with
 * mesa.yaml or `.git`, a linked worktree's being its main checkout's. None when `cwd` is gone or
 * no such folder holds it.
 */
export function projectFolder(home: string, cwd: string): string | null {
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) return null;
  for (let dir = cwd; dir.startsWith(`${home}/`); dir = dirname(dir)) {
    if (projectCandidate(dir)) return mainCheckout(dir) ?? dir;
  }
  return null;
}

/** A linked worktree's main checkout: its `.git` file points into `<main>/.git/worktrees/`. */
function mainCheckout(dir: string): string | undefined {
  const git = join(dir, '.git');
  try {
    if (!statSync(git).isFile()) return undefined;
    const gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(git, 'utf8'))?.[1];
    const main = gitdir && /^(.+)\/\.git\/worktrees\/[^/]+$/.exec(resolve(dir, gitdir))?.[1];
    return main && existsSync(main) ? main : undefined;
  } catch {
    return undefined;
  }
}
