import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../../testing/index.js';
import { ALLOW_RULE, installMesaMount, mesaMountStatus, uninstallMesaMount } from './mesa-mount.js';

const SELF = ['/opt/node', '/src/mesa.js'];

/** Antigravity's two global files under a temp home, each planted as the user left it. */
function setUp(mcp?: object, settings?: object) {
  const home = tempDir();
  const mcpFile = join(home, '.gemini/config/mcp_config.json');
  const rulesFile = join(home, '.gemini/antigravity-cli/settings.json');
  const plant = (file: string, value?: object) => {
    if (value === undefined) return undefined;
    mkdirSync(dirname(file), { recursive: true });
    const text = `${JSON.stringify(value, null, 2)}\n`;
    writeFileSync(file, text);
    return text;
  };
  return {
    home,
    mcpFile,
    rulesFile,
    mcpText: plant(mcpFile, mcp),
    rulesText: plant(rulesFile, settings),
  };
}

const USER_SERVER = {
  command: 'node',
  args: ['/opt/tide-server.js'],
  env: { TIDE_DB: '/var/tide.db' },
};
const USER_SETTINGS = {
  trustedWorkspaces: ['/src/lantern-cove'],
  permissions: { allow: ['command(git)', 'mcp(tide/*)'], deny: ['command(rm)'] },
};

test('install adds one mesa-vault entry and one allow rule, and uninstall restores both files', () => {
  const { home, mcpFile, rulesFile, mcpText, rulesText } = setUp(
    { mcpServers: { tide: USER_SERVER } },
    USER_SETTINGS,
  );
  expect(mesaMountStatus(home, SELF)).toMatchObject({ installed: false, stale: false });

  expect(installMesaMount(home, SELF)).toMatchObject({ installed: true, changed: true });
  expect(installMesaMount(home, SELF).changed).toBe(false);
  expect(JSON.parse(readFileSync(mcpFile, 'utf8'))).toEqual({
    mcpServers: {
      tide: USER_SERVER,
      'mesa-vault': { command: '/opt/node', args: ['/src/mesa.js', 'vault', 'mcp'] },
    },
  });
  expect(JSON.parse(readFileSync(rulesFile, 'utf8'))).toEqual({
    ...USER_SETTINGS,
    permissions: {
      ...USER_SETTINGS.permissions,
      allow: ['command(git)', 'mcp(tide/*)', ALLOW_RULE],
    },
  });
  expect(ALLOW_RULE).toBe('mcp(mesa-vault/*)');

  expect(uninstallMesaMount(home, SELF)).toMatchObject({ installed: false, changed: true });
  expect(uninstallMesaMount(home, SELF).changed).toBe(false);
  expect(readFileSync(mcpFile, 'utf8')).toBe(mcpText);
  expect(readFileSync(rulesFile, 'utf8')).toBe(rulesText);
});

test('a moved mesa is stale, a missing rule is reported alone, and install mends each', () => {
  const { home, rulesFile } = setUp({}, {});
  installMesaMount(home, ['/old/node', '/old/mesa.js']);
  expect(mesaMountStatus(home, SELF)).toMatchObject({
    installed: false,
    stale: true,
    server: false,
    rule: true,
  });
  installMesaMount(home, SELF);
  writeFileSync(rulesFile, '{"permissions":{"allow":[]}}\n');
  expect(mesaMountStatus(home, SELF)).toMatchObject({ stale: false, server: true, rule: false });
  expect(installMesaMount(home, SELF)).toMatchObject({ installed: true, changed: true });
});

test('a foreign mesa-vault entry or an unreadable file is a conflict, reported and left as it was', () => {
  const foreign = setUp({ mcpServers: { 'mesa-vault': USER_SERVER } }, USER_SETTINGS);
  for (const change of [installMesaMount, uninstallMesaMount, mesaMountStatus])
    expect(change(foreign.home, SELF)).toMatchObject({
      installed: false,
      conflict: `${foreign.mcpFile}: mesa-vault belongs to another server; Mesa left it unchanged`,
    });
  expect(installMesaMount(foreign.home, SELF).changed).toBe(false);
  expect(readFileSync(foreign.mcpFile, 'utf8')).toBe(foreign.mcpText);
  expect(readFileSync(foreign.rulesFile, 'utf8')).toBe(foreign.rulesText);

  const listless = setUp({}, { permissions: { allow: 'mcp(*)' } });
  expect(installMesaMount(listless.home, SELF)).toMatchObject({
    changed: false,
    conflict: expect.stringContaining('permissions.allow is not a list'),
  });
  expect(readFileSync(listless.mcpFile, 'utf8')).toBe(listless.mcpText);

  const broken = setUp();
  mkdirSync(dirname(broken.mcpFile), { recursive: true });
  writeFileSync(broken.mcpFile, '{broken');
  expect(installMesaMount(broken.home, SELF)).toMatchObject({
    changed: false,
    conflict: `${broken.mcpFile}: not valid JSON; fix it before Mesa edits it`,
  });
  expect(readFileSync(broken.mcpFile, 'utf8')).toBe('{broken');
  expect(existsSync(broken.rulesFile)).toBe(false);
});

test('uninstall removes a file that install made and that holds nothing else', () => {
  const none = setUp();
  installMesaMount(none.home, SELF);
  expect(existsSync(none.mcpFile) && existsSync(none.rulesFile)).toBe(true);
  uninstallMesaMount(none.home, SELF);
  expect(existsSync(none.mcpFile)).toBe(false);
  expect(existsSync(none.rulesFile)).toBe(false);

  // Anything else in a file keeps it.
  const kept = setUp({ theme: 'dark' }, { permissions: { allow: [], deny: ['command(rm)'] } });
  installMesaMount(kept.home, SELF);
  uninstallMesaMount(kept.home, SELF);
  expect(JSON.parse(readFileSync(kept.mcpFile, 'utf8'))).toEqual({ theme: 'dark', mcpServers: {} });
  expect(readFileSync(kept.rulesFile, 'utf8')).toBe(kept.rulesText);
});

test('an entry the user disabled is reported disabled, not stale, and install keeps it off', () => {
  const current = { command: '/opt/node', args: ['/src/mesa.js', 'vault', 'mcp'], disabled: true };
  const { home, mcpFile } = setUp({ mcpServers: { 'mesa-vault': current } }, {});
  expect(mesaMountStatus(home, SELF)).toMatchObject({
    stale: false,
    server: true,
    rule: false,
    disabled: true,
  });
  expect(installMesaMount(home, SELF)).toMatchObject({ installed: true, disabled: true });
  expect(JSON.parse(readFileSync(mcpFile, 'utf8')).mcpServers['mesa-vault']).toEqual(current);

  // A moved mesa is still stale, and its new entry stays off.
  writeFileSync(
    mcpFile,
    JSON.stringify({ mcpServers: { 'mesa-vault': { ...current, command: '/old/node' } } }),
  );
  expect(mesaMountStatus(home, SELF)).toMatchObject({ stale: true, disabled: true });
  installMesaMount(home, SELF);
  expect(JSON.parse(readFileSync(mcpFile, 'utf8')).mcpServers['mesa-vault']).toEqual(current);
});
