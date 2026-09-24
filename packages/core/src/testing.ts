import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from './clock.js';
import type { MesaDeps } from './mesa.js';
import type { Runner } from './process.js';
import { MesaError } from './result.js';

// Test implementations of Mesa's seams, real but controlled: a scripted runner and a temp home,
// never mocks of Mesa's own modules. Published as @mesa/core/testing, not from the index.

export const fixedClock =
  (iso = '2026-09-24T12:00:00.000Z'): Clock =>
  () =>
    new Date(iso);

/** Answers from `outputs` by binary name; names in `missing` are ENOENT, names in `slow` time out. */
export function scriptedRunner(
  outputs: Record<string, string> = {},
  opts: { missing?: string[]; slow?: string[] } = {},
) {
  const calls: { file: string; args: string[]; timeoutMs: number }[] = [];
  const run: Runner = async (file, args, timeoutMs) => {
    calls.push({ file, args, timeoutMs });
    if (opts.missing?.includes(file)) return { ok: false, reason: 'missing', detail: 'ENOENT' };
    if (opts.slow?.includes(file)) return { ok: false, reason: 'timeout', detail: 'killed' };
    return { ok: true, stdout: outputs[file] ?? '' };
  };
  return { run, calls };
}

/** Deps over `home` (a temp dir): cwd is home, the clock is fixed, and Obsidian lives under home. */
export const testDeps = (home: string, overrides: Partial<MesaDeps> = {}): MesaDeps => ({
  home,
  cwd: home,
  clock: fixedClock(),
  run: scriptedRunner().run,
  obsidian: {
    registered: join(home, 'bin/obsidian'),
    bundle: join(home, 'Obsidian.app/obsidian-cli'),
    plist: join(home, 'Obsidian.app/Info.plist'),
  },
  ...overrides,
});

/** A fresh temp dir, symlinks resolved (macOS `/var` is `/private/var`). */
export const tempDir = (prefix = 'mesa-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

/** The MesaError a call throws, as `{ code, message }`; throws if it returns or throws anything else. */
export function thrown(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (error) {
    if (error instanceof MesaError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error('expected a MesaError');
}
