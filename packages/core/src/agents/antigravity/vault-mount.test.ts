import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir, thrown } from '../../testing/index.js';
import {
  ALLOW_RULE,
  installVaultMount,
  uninstallVaultMount,
  vaultMountStatus,
} from './vault-mount.js';

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
  expect(vaultMountStatus(home, SELF)).toMatchObject({ installed: false, stale: false });

  expect(installVaultMount(home, SELF)).toMatchObject({ installed: true, changed: true });
  expect(installVaultMount(home, SELF).changed).toBe(false);
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

  expect(uninstallVaultMount(home, SELF)).toMatchObject({ installed: false, changed: true });
  expect(uninstallVaultMount(home, SELF).changed).toBe(false);
  expect(readFileSync(mcpFile, 'utf8')).toBe(mcpText);
  expect(readFileSync(rulesFile, 'utf8')).toBe(rulesText);
});

test('a moved mesa is stale, a missing rule is reported alone, and install mends each', () => {
  const { home, rulesFile } = setUp({}, {});
  installVaultMount(home, ['/old/node', '/old/mesa.js']);
  expect(vaultMountStatus(home, SELF)).toMatchObject({
    installed: false,
    stale: true,
    server: false,
    rule: true,
  });
  installVaultMount(home, SELF);
  writeFileSync(rulesFile, '{"permissions":{"allow":[]}}\n');
  expect(vaultMountStatus(home, SELF)).toMatchObject({ stale: false, server: true, rule: false });
  expect(installVaultMount(home, SELF)).toMatchObject({ installed: true, changed: true });
});

test('a foreign mesa-vault entry or an unreadable file is refused and left as it was', () => {
  const foreign = setUp({ mcpServers: { 'mesa-vault': USER_SERVER } }, USER_SETTINGS);
  for (const change of [installVaultMount, uninstallVaultMount, vaultMountStatus])
    expect(thrown(() => change(foreign.home, SELF))).toMatchObject({ code: 'invalid_config' });
  expect(readFileSync(foreign.mcpFile, 'utf8')).toBe(foreign.mcpText);
  expect(readFileSync(foreign.rulesFile, 'utf8')).toBe(foreign.rulesText);

  const listless = setUp({}, { permissions: { allow: 'mcp(*)' } });
  expect(thrown(() => installVaultMount(listless.home, SELF))).toMatchObject({
    code: 'invalid_config',
  });
  expect(readFileSync(listless.mcpFile, 'utf8')).toBe(listless.mcpText);

  const broken = setUp();
  mkdirSync(dirname(broken.mcpFile), { recursive: true });
  writeFileSync(broken.mcpFile, '{broken');
  expect(thrown(() => installVaultMount(broken.home, SELF))).toMatchObject({
    code: 'invalid_config',
  });
  expect(readFileSync(broken.mcpFile, 'utf8')).toBe('{broken');
});
