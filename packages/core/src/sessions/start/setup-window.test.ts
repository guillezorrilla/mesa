import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../../testing/index.js';
import { setupWindowCommand } from './setup-window.js';

/** Runs a setup window's shell with `self` writing its hook's stdin to a file; the shell ends. */
function runWindow(argv: string[]) {
  const logged = join(tempDir(), 'hook.json');
  const self = ['/bin/sh', '-c', 'cat > "$1"', 'mesa', logged];
  const out = execFileSync(
    '/bin/sh',
    ['-c', setupWindowCommand(argv, 'setup-a1b2c3d4', self, 'codex')],
    { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', SHELL: '/usr/bin/true' } },
  );
  let hook: string | undefined;
  try {
    hook = readFileSync(logged, 'utf8');
  } catch {
    hook = undefined;
  }
  return { out, hook };
}

test('a setup window shows its command and runs it, then hands over to a shell', () => {
  const { out, hook } = runWindow(['/bin/echo', "it's set up"]);
  expect(out).toBe("$ /bin/echo it's set up\nit's set up\n");
  expect(hook).toBeUndefined();
});

test('a failed setup logs SetupFailed naming its window through mesa hook', () => {
  const { out, hook } = runWindow(['/bin/sh', '-c', 'exit 3']);
  expect(out).toContain('setup failed (exit 3)');
  expect(JSON.parse(hook ?? '{}')).toEqual({
    hook_event_name: 'SetupFailed',
    window: 'setup-a1b2c3d4',
  });
});
