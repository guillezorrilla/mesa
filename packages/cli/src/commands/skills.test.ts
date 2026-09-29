import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test("skills list shows Mesa's library; skills sync links the enabled ones and prints the diff", async () => {
  const dir = await cli.withProject();
  const listed = (await mesa('skills', 'list', '--json')).json.data;
  // A new profile has the mesa skill on.
  expect(listed).toContainEqual(
    expect.objectContaining({ name: 'mesa', source: 'mesa', enabled: true }),
  );
  expect(listed).toContainEqual(
    expect.objectContaining({ name: 'session-summary', source: 'mesa', enabled: false }),
  );
  await mesa('config', 'set', 'skills', '[session-summary]');
  // (mesa is off now: only what config.yaml lists is on.)
  expect((await mesa('skills', 'list', 'lantern-cove', '--json')).json.data).toContainEqual(
    expect.objectContaining({ name: 'session-summary', enabled: true }),
  );

  const synced = await mesa('skills', 'sync', 'lantern-cove');
  expect(synced.stdout).toBe(
    '+ .claude/skills/session-summary\n+ .agents/skills/session-summary\n',
  );
  const link = join(dir, '.claude/skills/session-summary');
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(readlinkSync(link)).toMatch(/\/skills\/session-summary$/);
  expect((await mesa('skills', 'sync', 'lantern-cove', '--json')).json.data).toMatchObject({
    added: [],
    kept: ['.claude/skills/session-summary', '.agents/skills/session-summary'],
  });
  expect((await mesa('skills', 'sync', 'lantern-cove')).stdout).toBe(
    'skills in lantern-cove already in sync\n',
  );
  expect(await mesa('skills', 'sync', 'tide')).toMatchObject({ code: 3 });
});

test('skills set edits only the project policy and validates the enabled flag', async () => {
  const dir = await cli.withProject();
  expect(
    await mesa('skills', 'set', 'lantern-cove', 'session-summary', '--enabled', 'true', '--json'),
  ).toMatchObject({ json: { ok: true, data: { enabled: true, changed: true } } });
  expect(readFileSync(join(dir, 'mesa.yaml'), 'utf8')).toContain('session-summary');
  expect(
    await mesa('skills', 'set', 'lantern-cove', 'session-summary', '--enabled', 'no'),
  ).toMatchObject({ code: 2 });
});
