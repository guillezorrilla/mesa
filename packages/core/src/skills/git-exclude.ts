import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Mesa's skill links are this machine's (absolute paths into its Mesa checkout), so git ignores
// them through the repository's own, uncommitted exclude file, shared by all its worktrees.

/**
 * The exclude file of the repository `folder` is the top of, or undefined when it is not one: a
 * worktree's `.git` file names its git dir, whose `commondir` leads to the one they all share.
 */
function excludeFile(folder: string): string | undefined {
  const dotGit = join(folder, '.git');
  const stat = statSync(dotGit, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (stat.isDirectory()) return join(dotGit, 'info', 'exclude');
  const gitdir = /^gitdir: (.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim();
  if (!gitdir) return undefined;
  const own = resolve(folder, gitdir);
  const common = join(own, 'commondir');
  const root = existsSync(common) ? resolve(own, readFileSync(common, 'utf8').trim()) : own;
  return join(root, 'info', 'exclude');
}

/**
 * Adds each of `paths` (relative to `folder`, such as `.claude/skills/mesa`) to the repository's
 * exclude file once, so git neither shows nor counts them: a worktree with only Mesa's links in
 * it is clean. A folder that is not a repository's top is left alone.
 * ponytail: lines stay after their link goes; an ignored path that is not there costs nothing.
 */
export function excludeFromGit(folder: string, paths: readonly string[]) {
  const file = excludeFile(folder);
  if (!file || !paths.length) return;
  const have = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  const lines = paths.map((p) => `/${p}`).filter((line) => !have.includes(line));
  if (!lines.length) return;
  mkdirSync(dirname(file), { recursive: true });
  const header = have.includes(HEADER) ? '' : `${HEADER}\n`;
  const lead = have.length && have.at(-1) !== '' ? '\n' : '';
  appendFileSync(file, `${lead}${header}${lines.join('\n')}\n`);
}

const HEADER = "# Mesa's skill links (mesa skills sync)";
