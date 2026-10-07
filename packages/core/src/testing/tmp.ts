import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fresh temp dir, symlinks resolved (macOS `/var` is `/private/var`). */
export const tempDir = (prefix = 'mesa-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

/**
 * Every path under `dir`, the root included, with its mtime and, for files, its bytes: two equal
 * snapshots mean nothing in it was written.
 */
export function folderSnapshot(dir: string) {
  const paths = ['', ...readdirSync(dir, { recursive: true, encoding: 'utf8' })].sort();
  return paths.map((p) => {
    const stat = statSync(join(dir, p));
    return {
      p,
      mtime: stat.mtimeMs,
      text: stat.isFile() ? readFileSync(join(dir, p), 'utf8') : null,
    };
  });
}

/**
 * Gives a test file its own TMPDIR in `env`, removed with everything in it when the file ends, so
 * the `tempDir` fixtures and whatever spawned CLIs and git write there never pile up in the shared
 * one. It takes effect at once, before the file's top-level `tempDir` calls: call it from a vitest
 * setup file with the environment the tests run in and vitest's `afterAll`, which this module
 * leaves to its caller so that nothing here needs vitest or writes process globals.
 */
export function isolateTmp({
  afterAll,
  env,
}: {
  afterAll: (fn: () => void) => void;
  env: Record<string, string | undefined>;
}) {
  const shared = env.TMPDIR;
  const own = mkdtempSync(join(tmpdir(), 'mesa-test-'));
  env.TMPDIR = own;
  afterAll(() => {
    if (shared === undefined) delete env.TMPDIR;
    else env.TMPDIR = shared;
    rmSync(own, { recursive: true, force: true });
  });
}
