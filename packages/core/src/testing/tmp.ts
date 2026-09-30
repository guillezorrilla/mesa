import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fresh temp dir, symlinks resolved (macOS `/var` is `/private/var`). */
export const tempDir = (prefix = 'mesa-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

/**
 * Gives a test file its own TMPDIR, removed with everything in it when the file ends, so the
 * `tempDir` fixtures and whatever spawned CLIs and git write there never pile up in the shared
 * one. It takes effect at once, before the file's top-level `tempDir` calls: call it from a vitest
 * setup file with vitest's `afterAll`, which this module leaves to its caller so that nothing
 * here needs vitest.
 */
export function isolateTmp({ afterAll }: { afterAll: (fn: () => void) => void }) {
  const shared = process.env.TMPDIR;
  const own = mkdtempSync(join(tmpdir(), 'mesa-test-'));
  process.env.TMPDIR = own;
  afterAll(() => {
    if (shared === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = shared;
    rmSync(own, { recursive: true, force: true });
  });
}
