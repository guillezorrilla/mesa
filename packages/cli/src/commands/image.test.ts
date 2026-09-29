import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64',
);

test('image preview and send use the public CLI and the existing guarded session send', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const id = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const path = join(cli.home, 'probe.png');
  writeFileSync(path, PNG);

  const preview = await mesa('image', 'preview', id, path, '--json');
  expect(preview.code).toBe(0);
  expect(preview.json.data).toMatchObject({ session: id, profile: 'default', path });
  const revision = preview.json.data.revision;
  const sent = await mesa(
    'image',
    'send',
    id,
    path,
    '--revision',
    revision,
    '--profile',
    'default',
    '--note',
    'Describe this',
    '--json',
  );
  expect(sent.json.data).toMatchObject({ sent: true, session: id });
  expect(world.windows[0]?.typed).toEqual([
    `Describe this\n\nRead this image as visual input: ${JSON.stringify(path)}`,
  ]);

  writeFileSync(path, Buffer.concat([PNG, Buffer.from('changed')]));
  const stale = await mesa(
    'image',
    'send',
    id,
    path,
    '--revision',
    revision,
    '--profile',
    'default',
    '--json',
  );
  expect(stale.json.error).toMatchObject({ code: 'locked' });
  expect(world.windows[0]?.typed).toHaveLength(1);
});
