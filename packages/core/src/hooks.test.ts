import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { HOOK_EVENTS, hookCommand, hooksStatus, installHooks, uninstallHooks } from './hooks.js';
import { tempDir, thrown } from './testing.js';

const SELF = ['/opt/node/bin/node', '/src/mesa/packages/cli/dist/mesa.js'];

/** Settings the user wrote by hand, as Claude Code writes them: two-space JSON. */
const USER_SETTINGS = `${JSON.stringify(
  {
    model: 'opus',
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: '/usr/local/bin/audit' }] },
      ],
    },
    permissions: { allow: ['Bash(ls)'] },
  },
  null,
  2,
)}\n`;

function homeWith(settings?: string) {
  const home = tempDir();
  if (settings !== undefined) {
    mkdirSync(join(home, '.claude'));
    writeFileSync(join(home, '.claude/settings.json'), settings);
  }
  return { home, path: join(home, '.claude/settings.json') };
}

test('install adds one Mesa entry per event, beside the user hooks, and twice changes nothing', () => {
  const { home, path } = homeWith(USER_SETTINGS);
  expect(installHooks(home, SELF)).toMatchObject({ installed: true, changed: true });
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  for (const { event, matcher } of HOOK_EVENTS) {
    const mesa = settings.hooks[event].filter((g: { hooks: { command: string }[] }) =>
      g.hooks.some((h) => h.command === hookCommand(SELF)),
    );
    expect(mesa).toEqual([
      { ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: hookCommand(SELF) }] },
    ]);
  }
  // The user's own entries come first, as they were.
  expect(settings.hooks.Stop[0]).toEqual({ hooks: [{ type: 'command', command: 'say done' }] });
  expect(settings.hooks.PreToolUse[0].matcher).toBe('Bash');

  const once = readFileSync(path, 'utf8');
  expect(installHooks(home, SELF).changed).toBe(false);
  expect(readFileSync(path, 'utf8')).toBe(once);
});

test('uninstall removes only Mesa entries: the user settings come back byte for byte', () => {
  const { home, path } = homeWith(USER_SETTINGS);
  installHooks(home, SELF);
  expect(uninstallHooks(home, SELF)).toMatchObject({ installed: false, changed: true });
  expect(readFileSync(path, 'utf8')).toBe(USER_SETTINGS);
  expect(uninstallHooks(home, SELF).changed).toBe(false);
});

test('status names each event; no settings file is created until install', () => {
  const { home, path } = homeWith();
  expect(hooksStatus(home, SELF)).toEqual({
    path,
    installed: false,
    stale: false,
    events: Object.fromEntries(HOOK_EVENTS.map(({ event }) => [event, false])),
  });
  expect(uninstallHooks(home, SELF).changed).toBe(false);
  installHooks(home, SELF);
  expect(hooksStatus(home, SELF).installed).toBe(true);
});

test('the hook is a no-op outside a Mesa session, silent, and never fails its caller', () => {
  expect(hookCommand(['/a b/node', "/it's/mesa.js"])).toBe(
    `[ -z "$MESA_SESSION_ID" ] || '/a b/node' '/it'\\''s/mesa.js' hook claude >/dev/null 2>&1 || true`,
  );
});

test('settings that are not JSON are an error and are left untouched', () => {
  const { home, path } = homeWith('{ broken');
  expect(thrown(() => installHooks(home, SELF))).toEqual({
    code: 'invalid_config',
    message: `${path}: not valid JSON; fix it before Mesa edits it`,
  });
  expect(readFileSync(path, 'utf8')).toBe('{ broken');
});

test('a user hook that merely mentions "hook claude" is kept, with the rest of its group', () => {
  const mine = { type: 'command', command: '~/bin/notify hook claude-done' };
  const settings = `${JSON.stringify({ hooks: { Stop: [{ hooks: [mine] }] } }, null, 2)}\n`;
  const { home, path } = homeWith(settings);
  installHooks(home, SELF);
  expect(JSON.parse(readFileSync(path, 'utf8')).hooks.Stop[0]).toEqual({ hooks: [mine] });
  uninstallHooks(home, SELF);
  expect(readFileSync(path, 'utf8')).toBe(settings);
});

test('a symlinked settings file stays a symlink; its mode and four-space indent are kept', () => {
  const { home, path } = homeWith();
  const real = join(home, 'dotfiles-settings.json');
  const settings = `${JSON.stringify({ model: 'opus' }, null, 4)}\n`;
  writeFileSync(real, settings);
  chmodSync(real, 0o600);
  mkdirSync(join(home, '.claude'));
  symlinkSync(real, path);
  installHooks(home, SELF);
  expect(lstatSync(path).isSymbolicLink()).toBe(true);
  expect(statSync(real).mode & 0o777).toBe(0o600);
  expect(readFileSync(real, 'utf8')).toContain('\n    "hooks": {');
  uninstallHooks(home, SELF);
  expect(readFileSync(real, 'utf8')).toBe(settings);
});

test('entries that run another mesa are stale: status says so, and install replaces them', () => {
  const { home } = homeWith();
  installHooks(home, ['/old/node', '/gone/mesa.js']);
  expect(hooksStatus(home, SELF)).toMatchObject({ installed: false, stale: true });
  expect(installHooks(home, SELF)).toMatchObject({ installed: true, stale: false, changed: true });
});
