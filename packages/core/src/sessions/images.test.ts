import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  CLAUDE_VERSION,
  fakeTmux,
  projectProfile,
  scriptedRunner,
  testStore,
} from '../testing/index.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64',
);

test('a previewed Claude image is bound to its profile, session and file revision before guarded send', async () => {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const { home, mesa } = projectProfile(run);
  const id = (await mesa.sessions.open('lantern-cove')).result.id;
  const path = join(home, 'probe.png');
  writeFileSync(path, PNG);

  const image = mesa.sessions.images.preview(id, path);
  expect(image).toMatchObject({ profile: 'default', session: id, path, mime: 'image/png' });
  expect(image.dataUrl).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
  const prompt = mesa.sessions.images.prompt(id, path, image.revision, image.profile, 'Inspect it');
  await mesa.sessions.send(id, prompt);
  expect(world.windows[0]?.typed).toEqual([
    `Inspect it\n\nRead this image as visual input: ${JSON.stringify(path)}`,
  ]);

  expect(() => mesa.sessions.images.prompt(id, path, image.revision, 'other')).toThrow(
    'another Mesa profile',
  );
  writeFileSync(path, Buffer.concat([PNG, Buffer.from('changed')]));
  expect(() => mesa.sessions.images.prompt(id, path, image.revision, image.profile)).toThrow(
    'changed; preview it again',
  );
  expect(world.windows[0]?.typed).toHaveLength(1);
});

test('image selection rejects unsafe or unsupported files without sending', async () => {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const { home, mesa } = projectProfile(run);
  const id = (await mesa.sessions.open('lantern-cove')).result.id;
  const path = join(home, 'probe.png');
  expect(() => mesa.sessions.images.preview(id, path)).toThrow('no longer exists');
  writeFileSync(path, 'not an image');
  expect(() => mesa.sessions.images.preview(id, path)).toThrow('choose a PNG, JPEG, or WebP');
  writeFileSync(path, Buffer.alloc(5 * 1024 * 1024 + 1));
  expect(() => mesa.sessions.images.preview(id, path)).toThrow('5 MiB');
  writeFileSync(path, PNG);
  const link = join(home, 'link.png');
  symlinkSync(path, link);
  expect(() => mesa.sessions.images.preview(id, link)).toThrow('symlink');
  testStore(home).update(id, { agent: 'codex' });
  expect(() => mesa.sessions.images.preview(id, path)).toThrow('live Claude Code session');
  expect(world.windows[0]?.typed).toEqual([]);
});
