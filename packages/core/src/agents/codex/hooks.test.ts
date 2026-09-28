import { existsSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../../testing/index.js';
import { hookCommand } from '../hooks.js';
import { HOOK_EVENTS, hooksStatus, installHooks, uninstallHooks } from './hooks.js';

const SELF = ['/opt/node/bin/node', '/src/mesa/packages/cli/dist/mesa.js'];
const snake = (event: string) =>
  event.replace(/[A-Z]/g, (c, i) => `${i ? '_' : ''}${c.toLowerCase()}`);
const trusted = (path: string, event: string, position = '0:0') =>
  `[hooks.state.${JSON.stringify(`${path}:${snake(event)}:${position}`)}]\ntrusted_hash = "sha256:invented"\n`;

test('install twice is byte-stable, guarded, without timeout; uninstall leaves user hooks', () => {
  const home = tempDir();
  const path = join(home, 'hooks.json');
  const user = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } };
  writeFileSync(path, `${JSON.stringify(user, null, 2)}\n`);
  const before = readFileSync(path, 'utf8');
  expect(installHooks(home, SELF)).toMatchObject({ installed: true, changed: true });
  const once = readFileSync(path, 'utf8');
  const installed = JSON.parse(once);
  expect(Object.keys(installed.hooks)).toHaveLength(7);
  for (const { event } of HOOK_EVENTS) {
    expect(installed.hooks[event].at(-1)).toEqual({
      hooks: [
        {
          type: 'command',
          command: hookCommand(SELF, 'codex', event),
        },
      ],
    });
  }
  expect(installHooks(home, SELF).changed).toBe(false);
  expect(readFileSync(path, 'utf8')).toBe(once);
  expect(existsSync(join(home, 'config.toml'))).toBe(false);
  expect(hooksStatus(home, SELF).hint).toContain('Hooks need review');
  expect(Object.values(hooksStatus(home, SELF).trusted)).toEqual(Array(7).fill(false));
  uninstallHooks(home, SELF);
  expect(readFileSync(path, 'utf8')).toBe(before);
});

test('trust reads the actual group and handler positions and only Mesa entries', () => {
  const home = tempDir();
  const path = join(home, 'hooks.json');
  installHooks(home, SELF);
  const config = join(home, 'config.toml');
  writeFileSync(config, HOOK_EVENTS.map(({ event }) => trusted(path, event)).join('\n'));
  expect(Object.values(hooksStatus(home, SELF).trusted)).toEqual(Array(7).fill(true));
  const json = JSON.parse(readFileSync(path, 'utf8'));
  json.hooks.Stop.unshift({ hooks: [{ type: 'command', command: 'say done' }] });
  json.hooks.Stop[1].hooks.unshift({ type: 'command', command: 'say before' });
  writeFileSync(path, JSON.stringify(json));
  expect(hooksStatus(home, SELF).trusted.Stop).toBe(false);
  writeFileSync(config, trusted(path, 'Stop', '1:1'));
  expect(hooksStatus(home, SELF).trusted.Stop).toBe(true);
  expect(hooksStatus(home, SELF).trusted.SessionStart).toBe(false);
  // A command for another mesa is stale even if that file position was once trusted.
  json.hooks.Stop[1].hooks[1].command = hookCommand(['/old/mesa'], 'codex');
  writeFileSync(path, JSON.stringify(json));
  expect(hooksStatus(home, SELF)).toMatchObject({ stale: true, trusted: { Stop: false } });
});

test('comments and multiline strings cannot spoof trust; invalid TOML fails closed', () => {
  const home = tempDir();
  const path = join(home, 'hooks.json');
  installHooks(home, SELF);
  const config = join(home, 'config.toml');
  writeFileSync(
    config,
    `note = '''\n${trusted(path, 'Stop')}'''\n# ${trusted(path, 'SessionStart').replaceAll('\n', '\n# ')}`,
  );
  expect(Object.values(hooksStatus(home, SELF).trusted)).toEqual(Array(7).fill(false));
  writeFileSync(config, `${trusted(path, 'Stop')}\nsecret = "do-not-print"broken`);
  expect(() => hooksStatus(home, SELF)).toThrow('cannot read Codex hook trust');
  expect(() => hooksStatus(home, SELF)).not.toThrow('do-not-print');
});

test('trust uses Codex canonical source paths when CODEX_HOME is a symlink', () => {
  const home = tempDir();
  const alias = join(tempDir(), 'codex-link');
  symlinkSync(home, alias);
  installHooks(alias, SELF);
  const source = realpathSync(join(alias, 'hooks.json'));
  writeFileSync(
    join(home, 'config.toml'),
    HOOK_EVENTS.map(({ event }) => trusted(source, event)).join('\n'),
  );
  expect(Object.values(hooksStatus(alias, SELF).trusted)).toEqual(Array(7).fill(true));
});
