import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir, thrown } from '../../testing/index.js';
import { hookCommand, hooksStatus, installHooks, uninstallHooks } from './hooks.js';

const SELF = ['/opt/node', '/src/mesa.js'];

test('install owns one named PreInvocation hook and preserves other Antigravity hooks', () => {
  const home = tempDir();
  const path = join(home, '.gemini/config/hooks.json');
  mkdirSync(join(home, '.gemini/config'), { recursive: true });
  const original = `${JSON.stringify({ user: { Stop: [{ command: 'say done' }] } }, null, 4)}\n`;
  writeFileSync(path, original);

  expect(installHooks(home, SELF)).toMatchObject({ installed: true, changed: true });
  expect(installHooks(home, SELF).changed).toBe(false);
  const config = JSON.parse(readFileSync(path, 'utf8'));
  expect(config.user).toEqual({ Stop: [{ command: 'say done' }] });
  expect(config['mesa-session-instructions'].PreInvocation).toEqual([
    { type: 'command', command: hookCommand(SELF) },
  ]);
  expect(hooksStatus(home, ['/old/mesa'])).toMatchObject({ installed: false, stale: true });
  expect(uninstallHooks(home, SELF).changed).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe(original);
});

test('a name collision and invalid JSON never overwrite user configuration', () => {
  const home = tempDir();
  const path = join(home, '.gemini/config/hooks.json');
  mkdirSync(join(home, '.gemini/config'), { recursive: true });
  const collision = '{"mesa-session-instructions":{"PreInvocation":[{"command":"say mine"}]}}\n';
  writeFileSync(path, collision);
  expect(thrown(() => installHooks(home, SELF))).toMatchObject({ code: 'invalid_config' });
  expect(readFileSync(path, 'utf8')).toBe(collision);
  const mixed = `${JSON.stringify({
    'mesa-session-instructions': {
      PreInvocation: [{ type: 'command', command: hookCommand(SELF) }],
      Stop: [{ command: 'say mine' }],
    },
  })}\n`;
  writeFileSync(path, mixed);
  expect(thrown(() => uninstallHooks(home, SELF))).toMatchObject({ code: 'invalid_config' });
  expect(readFileSync(path, 'utf8')).toBe(mixed);
  writeFileSync(path, '{broken');
  expect(thrown(() => installHooks(home, SELF))).toMatchObject({ code: 'invalid_config' });
  expect(readFileSync(path, 'utf8')).toBe('{broken');
});

test('uninstall removes only a hooks file Mesa created', () => {
  const home = tempDir();
  const path = join(home, '.gemini/config/hooks.json');
  installHooks(home, SELF);
  expect(existsSync(path)).toBe(true);
  uninstallHooks(home, SELF);
  expect(existsSync(path)).toBe(false);

  writeFileSync(path, '{}\n');
  installHooks(home, SELF);
  uninstallHooks(home, SELF);
  expect(readFileSync(path, 'utf8')).toBe('{}\n');
});

test('the global hook returns empty JSON outside a Mesa session without starting the CLI', () => {
  expect(
    execFileSync('sh', ['-c', hookCommand(['/missing/node', '/missing/mesa'])], {
      env: { MESA_SESSION_ID: '' },
      encoding: 'utf8',
    }),
  ).toBe('{}');
});

import { execFileSync } from 'node:child_process';
