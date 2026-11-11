import { expect, test } from 'vitest';
import { scriptedRunner, tempDir } from '../testing/index.js';
import { worktreeCommand } from './create.js';
import { oneStringHint, scriptHints } from './script-hint.js';

const HINT =
  'the list is argv, run without a shell, so "node --test test/" is one program name; write it as [node, --test, test/]';

test('a script whose program is a whole command line gets its split form; argv gets none', () => {
  expect(oneStringHint(['node --test test/'])).toBe(HINT);
  expect(oneStringHint(['node --test', 'test/'])).toContain('write it as [node, --test, test/]');
  expect(oneStringHint(['node', '--test', 'test/'])).toBeUndefined();
  expect(oneStringHint([])).toBeUndefined();
  expect(scriptHints({ setup: ['node --test test/'], teardown: ['rm', '-rf', 'cache'] })).toBe(
    `worktrees.setup: ${HINT}`,
  );
  expect(scriptHints({ setup: ['pnpm', 'install'] })).toBeUndefined();
});

test('a setup or teardown that is no program says when it was written as one string', async () => {
  const { run } = scriptedRunner({}, { missing: ['node --test test/', 'nodee'] });
  const path = tempDir();
  for (const kind of ['setup', 'teardown'] as const)
    await expect(worktreeCommand(run, path, ['node --test test/'], kind)).rejects.toThrow(
      `${kind} failed in ${path}: ENOENT (${HINT}); checkout remains`,
    );
  // A missing program written as argv is only missing.
  await expect(worktreeCommand(run, path, ['nodee', '--test'], 'setup')).rejects.toThrow(
    `setup failed in ${path}: ENOENT; checkout remains`,
  );
});
