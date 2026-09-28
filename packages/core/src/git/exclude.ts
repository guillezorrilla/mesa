import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// Mesa's local skill links and nested worktrees are ignored through the repository's own,
// uncommitted exclude file, shared by all its worktrees.

/**
 * The repository `folder` is in, its top (the folder holding `.git`, walking up), and its exclude
 * file; undefined outside one. A worktree's `.git` file names its git dir, whose `commondir` leads
 * to the one they all share.
 */
function repositoryOf(folder: string): { top: string; file: string } | undefined {
  for (let top = resolve(folder); ; top = dirname(top)) {
    const dotGit = join(top, '.git');
    const stat = statSync(dotGit, { throwIfNoEntry: false });
    if (stat?.isDirectory()) return { top, file: join(dotGit, 'info', 'exclude') };
    if (stat) {
      const gitdir = /^gitdir: (.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim();
      if (!gitdir) return undefined;
      const own = resolve(top, gitdir);
      const common = join(own, 'commondir');
      const root = existsSync(common) ? resolve(own, readFileSync(common, 'utf8').trim()) : own;
      return { top, file: join(root, 'info', 'exclude') };
    }
    if (dirname(top) === top) return undefined;
  }
}

/**
 * Adds each of `paths` (relative to `folder`, such as `.claude/skills/mesa`) to the exclude file of
 * the repository `folder` is in, once, from its top (`/sub/.claude/skills/mesa` for a session
 * that runs in `sub`), so git neither shows nor counts them. A folder in no repository is left alone.
 * ponytail: lines stay after their link goes; an ignored path that is not there costs nothing.
 */
export function excludeFromGit(folder: string, paths: readonly string[]) {
  const repo = repositoryOf(folder);
  if (!repo || !paths.length) return;
  const { top, file } = repo;
  const have = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  const lines = paths
    .map((p) => `/${relative(top, join(resolve(folder), p))}`)
    .filter((line) => !have.includes(line));
  if (!lines.length) return;
  mkdirSync(dirname(file), { recursive: true });
  const header = have.includes(HEADER) ? '' : `${HEADER}\n`;
  const lead = have.length && have.at(-1) !== '' ? '\n' : '';
  appendFileSync(file, `${lead}${header}${lines.join('\n')}\n`);
}

const HEADER = '# Mesa local paths';
