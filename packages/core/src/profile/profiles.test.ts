import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import {
  fakeTmux,
  memorySecretStore,
  profilePaths,
  scriptedRunner,
  tempDir,
  testDeps,
  thrown,
} from '../testing/index.js';
import { profileSlug } from './profile-name.js';

/** A home with the default profile, its vault laid out; `mesa(name)` acts as that profile. */
function world() {
  const home = tempDir();
  const tmux = fakeTmux();
  const runner = scriptedRunner({ tmux: tmux.answer });
  const secrets = memorySecretStore();
  const mesa = (profile = 'default') =>
    createMesa(profile, testDeps(home, { run: runner.run, secretStore: secrets.store }));
  mesa().init({ vault: 'vault' });
  const killed = () =>
    runner.calls
      .filter((c) => c.file === 'tmux' && c.args.includes('kill-server'))
      .map((c) => c.args[2]);
  return { home, tmux, runner, secrets, mesa, killed };
}

const KEY = (profile: string) => `mesa-${profile}-decisions typesafe`;
const SOURCE = (profile: string) => `mesa.${profile}.sources atlassian`;

async function plantSecrets(w: ReturnType<typeof world>, profile: string) {
  await w.secrets.store.set(`mesa-${profile}-decisions`, 'typesafe', '{"key":"ts-1234"}');
  await w.secrets.store.set(`mesa.${profile}.sources`, 'atlassian', '{"not":"a connection"}');
}

test('list shows each profile with its vault, projects, live sessions and the app profile', async () => {
  const w = world();
  const work = w.mesa().profiles.create({ name: 'work', newVault: true });
  expect(work).toMatchObject({
    profile: 'work',
    dir: profilePaths(w.home, 'work').root,
    vault: join(w.home, 'Documents/Mesa-work'),
  });
  expect(existsSync(join(work.vault, 'log.md'))).toBe(true);
  w.tmux.addWindow({ project: 'lantern-cove', window: 'a1' });
  const rows = await w.mesa().profiles.list();
  expect(rows.map((r) => r.name)).toEqual(['default', 'work']);
  expect(rows[0]).toMatchObject({
    vault: join(w.home, 'vault'),
    projects: 0,
    liveSessions: 1,
    current: true,
    app: true,
  });
  expect(rows[1]).toMatchObject({ current: false, app: false });
  expect(Date.parse(rows[1]?.lastUsed ?? '')).toBeGreaterThan(0);

  w.mesa().profiles.use('work');
  expect((await w.mesa('work').profiles.list()).map((r) => [r.name, r.current, r.app])).toEqual([
    ['default', false, false],
    ['work', true, true],
  ]);
});

test('create uses an existing vault, copies settings without keys, and starts the setup guide', () => {
  const w = world();
  w.mesa().config.set('defaultAgent', 'codex');
  w.mesa().config.set('keys.api', 'sk-secret');
  w.mesa().config.set('onboarding.status', 'complete');
  const shared = join(w.home, 'notes');
  mkdirSync(shared);
  w.mesa().profiles.create({ name: 'client', vault: 'notes', copySettings: true });
  const config = w.mesa('client').config.get();
  expect(config).toMatchObject({
    vault: shared,
    defaultAgent: 'codex',
    keys: {},
    onboarding: { status: 'active', step: 0 },
  });
  w.mesa().profiles.create({ name: 'plain', vault: 'plain-vault' });
  expect(w.mesa('plain').config.get().defaultAgent).toBe('claude');
});

test('create refuses a bad name, a taken one, no vault or two, and a new vault that exists', () => {
  const w = world();
  const create = w.mesa().profiles.create;
  expect(thrown(() => create({ name: '../x', newVault: true }))).toMatchObject({ code: 'usage' });
  expect(thrown(() => create({ name: 'default', newVault: true })).message).toBe(
    'profile default already exists',
  );
  expect(thrown(() => create({ name: 'x' })).message).toContain('--vault <path> or --new-vault');
  expect(thrown(() => create({ name: 'x', vault: 'v', newVault: true })).code).toBe('usage');
  mkdirSync(join(w.home, 'Documents/Mesa-taken'), { recursive: true });
  expect(thrown(() => create({ name: 'taken', newVault: true })).message).toContain(
    'already exists; pass --vault',
  );
  expect(existsSync(profilePaths(w.home, 'x').root)).toBe(false);
});

test('rename moves the folder, Keychain items, cloned paths and the app profile', async () => {
  const w = world();
  w.mesa().profiles.create({ name: 'work', newVault: true });
  await plantSecrets(w, 'work');
  const old = profilePaths(w.home, 'work');
  const checkout = join(old.checkouts, 'lantern-cove');
  writeFileSync(old.registry, `projects:\n  - name: lantern-cove\n    path: ${checkout}\n`);
  w.mesa().profiles.use('work');

  expect(await w.mesa().profiles.rename('work', 'client')).toEqual({
    from: 'work',
    to: 'client',
    dir: profilePaths(w.home, 'client').root,
  });
  expect(existsSync(old.root)).toBe(false);
  const next = profilePaths(w.home, 'client');
  expect(readFileSync(next.registry, 'utf8')).toContain(join(next.checkouts, 'lantern-cove'));
  expect([...w.secrets.items.keys()].sort()).toEqual([KEY('client')]);
  expect(w.killed()).toEqual(['mesa-work']);
  expect((await w.mesa().profiles.list()).find((r) => r.app)?.name).toBe('client');
});

test('rename and remove refuse while sessions run or the scheduler is installed', async () => {
  const w = world();
  w.mesa().profiles.create({ name: 'work', newVault: true });
  w.tmux.addWindow({ project: 'lantern-cove', window: 'a1' });
  for (const refused of [
    w.mesa().profiles.rename('work', 'client'),
    w.mesa().profiles.remove('work'),
  ])
    await expect(refused).rejects.toThrow(/1 session still running; stop it first$/);
  w.tmux.windows.splice(0);
  const plist = join(w.home, 'Library/LaunchAgents/com.mesa.automations.work.plist');
  mkdirSync(join(plist, '..'), { recursive: true });
  writeFileSync(plist, '<plist/>');
  await expect(w.mesa().profiles.remove('work')).rejects.toThrow(
    'run mesa --profile work automations uninstall first',
  );
  expect(existsSync(profilePaths(w.home, 'work').root)).toBe(true);
  expect(w.killed()).toEqual([]);
});

test('rename refuses a profile with worktrees, and a name that is taken', async () => {
  const w = world();
  w.mesa().profiles.create({ name: 'work', newVault: true });
  await expect(w.mesa().profiles.rename('work', 'default')).rejects.toThrow(
    'profile default already exists',
  );
  mkdirSync(join(profilePaths(w.home, 'work').worktrees, 'lantern-cove/fix'), { recursive: true });
  await expect(w.mesa().profiles.rename('work', 'client')).rejects.toThrow('it has worktrees');
  await expect(w.mesa().profiles.rename('nope', 'client')).rejects.toMatchObject({
    code: 'not_found',
  });
});

test('remove keeps the vault unless asked, deletes Keychain items, and stops the server', async () => {
  const w = world();
  const { vault } = w.mesa().profiles.create({ name: 'work', newVault: true });
  await plantSecrets(w, 'work');
  await plantSecrets(w, 'default');
  w.mesa().profiles.use('work');
  expect(await w.mesa().profiles.remove('work')).toEqual({
    profile: 'work',
    vault,
    vaultDeleted: false,
  });
  expect(existsSync(profilePaths(w.home, 'work').root)).toBe(false);
  expect(existsSync(vault)).toBe(true);
  expect([...w.secrets.items.keys()].sort()).toEqual([KEY('default'), SOURCE('default')]);
  expect(w.killed()).toEqual(['mesa-work']);
  expect((await w.mesa().profiles.list()).find((r) => r.app)?.name).toBe('default');

  const other = w.mesa().profiles.create({ name: 'other', newVault: true });
  expect(await w.mesa().profiles.remove('other', { deleteVault: true })).toMatchObject({
    vaultDeleted: true,
  });
  expect(existsSync(other.vault)).toBe(false);
});

test('remove refuses the profile in use and deleting a vault another profile uses', async () => {
  const w = world();
  w.mesa().profiles.create({ name: 'twin', vault: 'vault' });
  await expect(w.mesa('twin').profiles.remove('twin')).rejects.toThrow('while using it');
  await expect(w.mesa().profiles.remove('twin', { deleteVault: true })).rejects.toThrow(
    'profile default uses it too',
  );
  expect(existsSync(join(w.home, 'vault'))).toBe(true);
});

test('open shows the folder in Finder; slugs are profile names', async () => {
  const w = world();
  expect(await w.mesa().profiles.open('default')).toMatchObject({ profile: 'default' });
  expect(w.runner.calls.at(-1)).toMatchObject({
    file: '/usr/bin/open',
    args: [profilePaths(w.home, 'default').root],
  });
  expect(profileSlug('  Client Work! ')).toBe('client-work');
});
