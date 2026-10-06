import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Runner } from '../lib/process.js';
import { createMesa, type MesaDeps } from '../mesa.js';
import { profilePaths } from '../profile/paths.js';
import { fixedClock, sequentialIds, sequentialUuids } from './clock.js';
import { fakeHttp } from './http.js';
import { scriptedRunner } from './runner.js';
import { memorySecretStore } from './secrets.js';
import { tempDir } from './tmp.js';

/** Deps over `home` (a temp dir): cwd is home, the clock is fixed, and Obsidian lives under home. */
export const testDeps = (home: string, overrides: Partial<MesaDeps> = {}): MesaDeps => ({
  home,
  cwd: home,
  clock: fixedClock(),
  newId: sequentialIds(),
  newUuid: sequentialUuids(),
  sleep: async () => {},
  self: ['/usr/local/bin/mesa'],
  env: {},
  run: scriptedRunner().run,
  // No network and an empty Keychain: a test that signs in passes atlassianWorld().deps.
  http: fakeHttp().http,
  listen: async () => {
    throw new Error('testDeps: no sign-in listener; pass fakeSignIn().listen');
  },
  secretStore: memorySecretStore().store,
  processAlive: () => true,
  processId: 4242,
  browserSelection: async () => undefined,
  argv: ['test'],
  // The repo's own library: tests that need another pass their own.
  skillsDir: fileURLToPath(new URL('../../../../skills', import.meta.url)),
  version: '0.1.0-beta.4',
  obsidian: {
    registered: join(home, 'bin/obsidian'),
    bundle: join(home, 'Obsidian.app/obsidian-cli'),
    plist: join(home, 'Obsidian.app/Info.plist'),
    vaultList: join(home, 'obsidian/obsidian.json'),
  },
  ...overrides,
});

/** Where a profile keeps its files: tests read and plant through it, never a spelled-out path. */
export { profilePaths };

/**
 * A profile over `home` (a fresh temp dir by default) with its vault laid out and lantern-cove
 * registered: its mesa.yaml written from `mesaYaml` when given, else a minimal one.
 */
export function projectProfile(
  run: Runner,
  { mesaYaml, home = tempDir(), ...overrides }: Partial<MesaDeps> & { mesaYaml?: string } = {},
) {
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  if (mesaYaml !== undefined) writeFileSync(join(dir, 'mesa.yaml'), mesaYaml);
  const mesa = createMesa('default', testDeps(home, { run, ...overrides }));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mesa.projects.register(dir, mesaYaml === undefined);
  return { home, dir, mesa };
}
