import { expect, test } from 'vitest';
import { CLAUDE_VERSION, fakeTmux, projectProfile, scriptedRunner } from '../testing/index.js';

test('a native browser selection expires when its owning app exits', async () => {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  let alive = true;
  const { mesa } = projectProfile(run, { processAlive: () => alive });
  const opened = (await mesa.sessions.open('lantern-cove')).result;
  const selection = {
    profile: 'default',
    url: 'https://example.test/',
    title: 'Example',
    selector: 'h1',
    text: 'Violet otter',
  };
  mesa.sessions.browser.select(opened.id, { ...selection, ownerPid: 42 });
  expect(
    mesa.sessions.browser.preview(opened.id, { ...selection, comment: 'Check this' }).target,
  ).toBe(opened.id);
  mesa.sessions.browser.clear(opened.id);
  expect(() =>
    mesa.sessions.browser.preview(opened.id, { ...selection, comment: 'Check this' }),
  ).toThrow('selection changed');
  mesa.sessions.browser.select(opened.id, { ...selection, ownerPid: 42 });
  alive = false;
  expect(() =>
    mesa.sessions.browser.preview(opened.id, { ...selection, comment: 'Check this' }),
  ).toThrow('selection changed');
});
