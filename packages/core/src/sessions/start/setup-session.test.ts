import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../../testing/index.js';
import { notedGoal, setupLine } from './setup-session.js';

/** Runs a Setup session's first line with `self` writing its hook's stdin to a file. */
function runLine(argv: string[]) {
  const logged = join(tempDir(), 'hook.json');
  const self = ['/bin/sh', '-c', 'cat > "$1"', 'mesa', logged];
  const out = execFileSync('/bin/sh', ['-c', setupLine(argv, self)], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
  });
  let hook: string | undefined;
  try {
    hook = readFileSync(logged, 'utf8');
  } catch {
    hook = undefined;
  }
  return { out, hook };
}

test('a Setup session shows its command and runs it', () => {
  const { out, hook } = runLine(['/bin/echo', "it's set up"]);
  expect(out).toBe("$ /bin/echo it's set up\nit's set up\n");
  expect(hook).toBeUndefined();
});

test('a failed setup logs SetupFailed through mesa hook', () => {
  const { out, hook } = runLine(['/bin/sh', '-c', 'exit 3']);
  expect(out).toContain('setup failed (exit 3)');
  expect(JSON.parse(hook ?? '{}')).toEqual({ hook_event_name: 'SetupFailed' });
});

test('the goal names the Setup session, except a slash command or skill and no goal', () => {
  expect(notedGoal('Tidy the docs', 'a1b2c3d4')).toBe(
    'Tidy the docs\n\nWorktree setup runs in your child Setup session a1b2c3d4 (mesa show a1b2c3d4 --json): check it before relying on what it installs.',
  );
  expect(notedGoal('/review 12', 'a1b2c3d4')).toBe('/review 12');
  expect(notedGoal('$tidy', 'a1b2c3d4')).toBe('$tidy');
  expect(notedGoal(undefined, 'a1b2c3d4')).toBeUndefined();
  expect(notedGoal('Tidy the docs', undefined)).toBe('Tidy the docs');
});
