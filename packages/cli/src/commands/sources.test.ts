import { atlassianWorld } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const SITES = [{ id: 'cloud-1', name: 'lantern-cove', url: 'https://lantern-cove.atlassian.net' }];

test('sources connect, list, and disconnect print their JSON, and disconnect leaves a receipt', async () => {
  const world = atlassianWorld();
  cli.deps = world.deps;
  await cli.withProject();
  const before = await cli.mesa('sources', 'list', '--json');
  expect(before.json.data).toEqual({
    sources: [{ id: 'atlassian', label: 'Atlassian', connected: false, status: 'disconnected' }],
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
  expect((await cli.mesa('sources', 'list', '--json')).json.data).toEqual({ sources: [row] });
  expect((await cli.mesa('sources', 'list')).stdout).toBe(
    'atlassian  connected  Rowan Tide  lantern-cove\n',
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
    message: 'unknown source linear; one of atlassian',
  });
});
