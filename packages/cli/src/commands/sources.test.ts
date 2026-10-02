import { atlassianWorld, notionPageObject, notionWorld, TEST_CONFLUENCE } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const SITES = [{ id: 'cloud-1', name: 'lantern-cove', url: 'https://lantern-cove.atlassian.net' }];
const NOTION = { id: 'notion', label: 'Notion', connected: false, status: 'disconnected' };

test('sources connect, list, and disconnect print their JSON, and disconnect leaves a receipt', async () => {
  const world = atlassianWorld();
  cli.deps = world.deps;
  await cli.withProject();
  const before = await cli.mesa('sources', 'list', '--json');
  expect(before.json.data).toEqual({
    sources: [
      { id: 'atlassian', label: 'Atlassian', connected: false, status: 'disconnected' },
      NOTION,
    ],
  });
  const connected = await cli.mesa('sources', 'connect', 'atlassian', '--json');
  expect(connected.code).toBe(0);
  const row = {
    id: 'atlassian',
    label: 'Atlassian',
    connected: true,
    status: 'connected',
    account: { id: 'acc-1', name: 'Rowan Tide', email: 'rowan@example.test' },
    sites: SITES,
  };
  expect(connected.json.data).toMatchObject({ ...row, receipt: { id: expect.any(String) } });
  expect((await cli.mesa('sources', 'list', '--json')).json.data).toEqual({
    sources: [row, NOTION],
  });
  expect((await cli.mesa('sources', 'list')).stdout).toBe(
    'atlassian  connected     Rowan Tide  lantern-cove\nnotion     disconnected\n',
  );
  const gone = await cli.mesa('sources', 'disconnect', 'atlassian', '--json');
  expect(gone.json.data).toMatchObject({
    source: 'atlassian',
    removed: true,
    receipt: { id: expect.any(String) },
  });
  expect(world.secrets.items.size).toBe(0);
  const receipts = await cli.mesa('receipts', '--kind', 'connection', '--json');
  expect(receipts.json.data.map((r: { summary: string }) => r.summary)).toEqual([
    'Disconnected Atlassian',
    'Connected Atlassian',
  ]);
  for (const out of [connected, gone, receipts]) expect(out.stdout).not.toContain('access-1');
});

test('an unknown source is a usage error', async () => {
  cli.deps = atlassianWorld().deps;
  await cli.withProject();
  const out = await cli.mesa('sources', 'connect', 'linear', '--json');
  expect(out.code).toBe(2);
  expect(out.json.error).toEqual({
    code: 'usage',
    message: 'unknown source linear; one of atlassian, notion',
  });
});

test('sources browse prints a node children as JSON, follows --cursor to the end, and says reconnect when revoked', async () => {
  const world = atlassianWorld();
  cli.deps = world.deps;
  await cli.withProject();
  await cli.mesa('sources', 'connect', 'atlassian', '--json');
  const root = await cli.mesa('sources', 'browse', 'atlassian', '--json');
  expect(root.json.data).toEqual({
    node: null,
    children: [
      {
        id: 'site:cloud-1',
        kind: 'site',
        title: 'lantern-cove',
        url: 'https://lantern-cove.atlassian.net',
        hasChildren: true,
        importable: false,
      },
    ],
  });

  const spaces = Array.from({ length: 26 }, (_, at) => ({
    id: String(100 + at),
    key: `S${at}`,
    name: `Space ${at}`,
  }));
  world.servePaged(`${TEST_CONFLUENCE}/spaces`, [spaces.slice(0, 25), spaces.slice(25)]);
  const first = await cli.mesa('sources', 'browse', 'atlassian', 'confluence:cloud-1', '--json');
  expect(first.json.data.children).toHaveLength(25);
  expect(first.json.data.cursor).toBe('c1');
  const last = await cli.mesa(
    'sources',
    'browse',
    'atlassian',
    'confluence:cloud-1',
    '--cursor',
    'c1',
    '--json',
  );
  expect(last.json.data).toEqual({
    node: 'confluence:cloud-1',
    children: [
      {
        id: 'space:cloud-1:125:S25',
        kind: 'space',
        title: 'Space 25',
        url: 'https://lantern-cove.atlassian.net/wiki/spaces/S25',
        hasChildren: true,
        importable: false,
      },
    ],
  });
  const text = (await cli.mesa('sources', 'browse', 'atlassian', 'confluence:cloud-1')).stdout;
  const lines = text.trimEnd().split('\n');
  expect(lines[0]?.split(/ {2,}/)).toEqual([
    'space',
    'Space 0',
    'space:cloud-1:100:S0',
    'https://lantern-cove.atlassian.net/wiki/spaces/S0',
  ]);
  expect(lines.at(-1)).toBe('more: --cursor c1');

  world.revoke();
  const revoked = await cli.mesa('sources', 'browse', 'atlassian', 'confluence:cloud-1', '--json');
  expect(revoked.code).toBe(4);
  expect(revoked.json.error).toEqual({
    code: 'invalid_config',
    message: 'Atlassian needs reconnecting: run mesa sources connect atlassian',
    details: { connect: 'atlassian' },
  });
});

test('Notion connects, browses from its workspace, and a pasted Notion link imports', async () => {
  const world = notionWorld();
  cli.deps = world.deps;
  await cli.withProject();
  const connected = await cli.mesa('sources', 'connect', 'notion', '--json');
  expect(connected.json.data).toMatchObject({
    id: 'notion',
    status: 'connected',
    account: { name: 'Rowan Tide' },
    sites: [{ id: 'ws-1', name: 'Lantern Cove' }],
  });
  const root = await cli.mesa('sources', 'browse', 'notion', '--json');
  expect(root.json.data.children).toMatchObject([{ id: 'workspace:ws-1', kind: 'workspace' }]);

  const id = '1f0c3a5e9b7d4c2a8e6f0b1d2c3e4f5a';
  world.servePage(id, notionPageObject(id, 'Mesa import test'), 'Twice a day.');
  const link = `https://www.notion.so/lantern-cove/Mesa-import-test-${id}`;
  const out = await cli.mesa('import', link, '--project', 'lantern-cove', '--no-notes', '--json');
  expect(out.json.data.items).toEqual([
    {
      source: 'notion',
      id,
      title: 'Mesa import test',
      url: `https://www.notion.so/${id}`,
      snapshot: `raw/notion/${id}/2026-09-24T1200.md`,
    },
  ]);
});
