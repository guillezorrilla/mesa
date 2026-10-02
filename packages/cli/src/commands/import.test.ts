import type { Runner } from '@mesa/core';
import { agentWorld, atlassianWorld, writesImportNotes } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const SITE = 'https://lantern-cove.atlassian.net';

/** Atlassian connected, and a claude whose import-notes run writes each note. */
async function connected() {
  const world = atlassianWorld();
  const agents = agentWorld({ onOpen: writesImportNotes((note) => `# ${note}\n\nWritten.`) });
  const run: Runner = (file, ...rest) =>
    file === '/usr/bin/open' ? world.deps.run(file, ...rest) : agents.run(file, ...rest);
  cli.deps = { ...world.deps, run };
  await cli.withProject();
  await cli.mesa('sources', 'connect', 'atlassian');
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  world.servePage('9001', { title: 'Tide schedule', html: '<p>Twice a day.</p>' });
  return world;
}

test('mesa import takes a Confluence URL and a Jira key, prints each item, and lists and refreshes them', async () => {
  const world = await connected();
  const out = await cli.mesa(
    'import',
    `${SITE}/wiki/spaces/LC/pages/9001/Tide+schedule`,
    'LC-12',
    '--project',
    'lantern-cove',
    '--json',
  );
  expect(out.code).toBe(0);
  expect(out.json.data).toMatchObject({
    project: 'lantern-cove',
    items: [
      {
        source: 'confluence',
        id: '9001',
        snapshot: 'raw/confluence/9001/2026-09-24T1200.md',
        note: 'wiki/notes/tide-schedule.md',
      },
      {
        source: 'jira',
        id: 'LC-12',
        snapshot: 'raw/jira/LC-12/2026-09-24T1200.md',
        note: 'wiki/notes/lc-12-fix-the-tide-alarm.md',
      },
    ],
    notes: { ok: true },
    receipt: { id: expect.any(String) },
  });

  const list = await cli.mesa('import', 'list', '--project', 'lantern-cove', '--json');
  expect(list.json.data.items.map((i: { id: string; note: string }) => [i.id, i.note])).toEqual([
    ['9001', 'wiki/notes/tide-schedule.md'],
    ['LC-12', 'wiki/notes/lc-12-fix-the-tide-alarm.md'],
  ]);
  const text = await cli.mesa('import', 'list', '--project', 'lantern-cove');
  expect(text.stdout).toContain('jira        LC-12  LC-12: Fix the tide alarm');

  // Same minute again: a second snapshot beside the first, never over it.
  const again = await cli.mesa('import', 'refresh', 'LC-12', '--project', 'lantern-cove', '--json');
  expect(again.json.data.items).toMatchObject([
    { id: 'LC-12', snapshot: 'raw/jira/LC-12/2026-09-24T1200-2.md' },
  ]);
  expect(
    world.requests
      .filter((r) => r.url.includes('api.atlassian.com/ex/'))
      .every((r) => r.method === 'GET'),
  ).toBe(true);
});

test('mesa import --no-notes writes one raw/web snapshot and runs no agent', async () => {
  const world = atlassianWorld();
  world.routes['GET https://example.test/'] = {
    html: '<html><head><title>Example</title></head><body><article><p>An example page for the tide tables, long enough to read as content.</p></article></body></html>',
  };
  cli.deps = world.deps;
  await cli.withProject();
  const out = await cli.mesa(
    'import',
    'https://example.test/',
    '--project',
    'lantern-cove',
    '--no-notes',
  );
  expect(out.code).toBe(0);
  expect(out.stdout).toBe('web  example-test  Example  raw/web/example-test/2026-09-24T1200.md\n');
  expect(world.calls).toEqual([]);
});

test('mesa import needs a link and the project, and says why a link does not import', async () => {
  cli.deps = atlassianWorld().deps;
  await cli.withProject();
  const none = await cli.mesa('import', '--project', 'lantern-cove', '--json');
  expect(none.json.error).toEqual({ code: 'usage', message: 'give one link or more to import' });
  const key = await cli.mesa('import', 'LC-12', '--project', 'lantern-cove', '--json');
  expect(key.code).toBe(3);
  expect(key.json.error.message).toBe(
    'Atlassian is not connected: run mesa sources connect atlassian',
  );
});
