import { expect, test } from 'vitest';
import { CLAUDE_VERSION, fakeTmux, projectProfile, scriptedRunner } from '../../testing/index.js';

test('a native browser selection expires when its owning app exits', async () => {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  let alive = true;
  const selection = {
    profile: 'default',
    url: 'https://example.test/',
    title: 'Example',
    selector: 'h1',
    text: 'Violet otter',
  };
  let live = selection;
  const { mesa } = projectProfile(run, {
    processAlive: () => alive,
    browserSelection: async () => live,
  });
  const opened = (await mesa.sessions.open('lantern-cove')).result;
  const owner = { ownerPid: 42, ownerSocket: '/tmp/mesa-browser-42.sock' };
  mesa.sessions.browser.select(opened.id, { ...selection, ...owner });
  expect(
    (await mesa.sessions.browser.preview(opened.id, { ...selection, comment: 'Check this' }))
      .target,
  ).toBe(opened.id);
  live = { ...selection, text: 'Changed otter' };
  await expect(
    mesa.sessions.browser.preview(opened.id, { ...selection, comment: 'Check this' }),
  ).rejects.toThrow('selection changed');
  mesa.sessions.browser.clear(opened.id);
  await expect(
    mesa.sessions.browser.preview(opened.id, { ...selection, comment: 'Check this' }),
  ).rejects.toThrow('selection changed');
  live = selection;
  mesa.sessions.browser.select(opened.id, { ...selection, ...owner });
  alive = false;
  await expect(
    mesa.sessions.browser.preview(opened.id, { ...selection, comment: 'Check this' }),
  ).rejects.toThrow('selection changed');
});
