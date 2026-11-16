import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../../testing/index.js';
import { mesaMountStatus, removeMesaMounts } from './mesa-mount.js';

// Antigravity's global mesa-vault and mesa-decisions entries, which Mesa wrote before ADR-0031 and
// now only removes.

/** Antigravity's two global files under a temp home, each planted as the user left it. */
function setUp(mcp?: object, settings?: object) {
  const home = tempDir();
  const mcpFile = join(home, '.gemini/config/mcp_config.json');
  const rulesFile = join(home, '.gemini/antigravity-cli/settings.json');
  const plant = (file: string, value?: object) => {
    if (value === undefined) return undefined;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  };
  plant(mcpFile, mcp);
  plant(rulesFile, settings);
  return { home, mcpFile, rulesFile };
}

const USER_SERVER = { command: 'node', args: ['/opt/tide.js'], env: { TIDE_DB: '/var/tide.db' } };
const USER_SETTINGS = {
  trustedWorkspaces: ['/src/lantern-cove'],
  permissions: { allow: ['command(git)', 'mcp(tide/*)'], deny: ['command(rm)'] },
};
const mesa = (args: string[]) => ({ command: '/opt/node', args: ['/src/mesa.js', ...args] });

test("removal takes Mesa's entries and rules out, any mesa's, and leaves the user's", () => {
  const { home, mcpFile, rulesFile } = setUp(
    {
      mcpServers: {
        tide: USER_SERVER,
        'mesa-vault': { ...mesa(['vault', 'mcp']), disabled: true },
        'mesa-decisions': mesa(['decisions', 'mcp']),
      },
    },
    {
      ...USER_SETTINGS,
      permissions: {
        ...USER_SETTINGS.permissions,
        allow: [...USER_SETTINGS.permissions.allow, 'mcp(mesa-vault/*)', 'mcp(mesa-decisions/*)'],
      },
    },
  );
  expect(mesaMountStatus(home)).toMatchObject({ left: true });
  expect(removeMesaMounts(home)).toMatchObject({ left: false, changed: true });
  expect(JSON.parse(readFileSync(mcpFile, 'utf8'))).toEqual({ mcpServers: { tide: USER_SERVER } });
  expect(JSON.parse(readFileSync(rulesFile, 'utf8'))).toEqual(USER_SETTINGS);
  expect(removeMesaMounts(home).changed).toBe(false);
});

test("files that only held Mesa's entries are removed, and none is written where there was none", () => {
  const { home, mcpFile, rulesFile } = setUp(
    { mcpServers: { 'mesa-vault': mesa(['vault', 'mcp']) } },
    { permissions: { allow: ['mcp(mesa-vault/*)'] } },
  );
  expect(removeMesaMounts(home).changed).toBe(true);
  expect([existsSync(mcpFile), existsSync(rulesFile)]).toEqual([false, false]);
  const empty = setUp();
  expect(removeMesaMounts(empty.home)).toMatchObject({ left: false, changed: false });
  expect(existsSync(empty.mcpFile)).toBe(false);
});

test('a foreign entry under a Mesa name, or a file it cannot read, is a conflict that changes nothing', () => {
  const theirs = { mcpServers: { 'mesa-vault': { command: 'node', args: ['/opt/notes.js'] } } };
  const { home, mcpFile } = setUp(theirs, { permissions: { allow: ['mcp(mesa-vault/*)'] } });
  const status = removeMesaMounts(home);
  expect(status.conflict).toContain('mesa-vault belongs to another server');
  expect(status.changed).toBe(false);
  expect(JSON.parse(readFileSync(mcpFile, 'utf8'))).toEqual(theirs);
  const broken = setUp({ mcpServers: [] });
  expect(mesaMountStatus(broken.home).conflict).toContain('mcpServers is not an object');
});
