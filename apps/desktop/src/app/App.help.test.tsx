// @vitest-environment happy-dom
import type { About, CommandReference } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, fakePlatform, renderWithMesa } from '@/lib/testing';
import { App } from './App';

test('the Help screen lists every command from mesa help --agent, with its flags and example', async () => {
  const reference: CommandReference[] = [
    {
      name: 'send',
      usage: 'mesa send <session> <prompt> [--force]',
      description: "Type a prompt into a session's agent, then Enter",
      args: [
        { name: 'session', required: true },
        { name: 'prompt', required: true },
      ],
      flags: [
        { name: 'force', type: 'boolean', required: false, description: 'Send to a shell too' },
      ],
      example: 'mesa send a1b2c3d4 "run the tests"',
    },
    {
      name: 'init',
      usage: 'mesa init --vault <string>',
      description: 'Create the profile directory and its config.yaml',
      args: [],
      flags: [{ name: 'vault', type: 'string', required: true, description: 'The vault path' }],
      example: 'mesa init --vault ~/vault',
    },
  ];
  const { bridge, calls } = fakeBridge({ help: () => envelope(reference) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-help')[0]);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'Command reference',
    ),
  );

  expect(calls).toContainEqual(['--json', 'help', '--agent']);
  const commands = byTestId('help-command');
  expect(commands.map((c) => c.querySelector('h3')?.textContent)).toEqual([
    'mesa send <session> <prompt> [--force]',
    'mesa init --vault <string>',
  ]);
  expect(commands[0]?.textContent).toContain("Type a prompt into a session's agent, then Enter");
  expect(commands[0]?.textContent).toContain('--force boolean: Send to a shell too');
  expect(commands[1]?.textContent).toContain('--vault string, required: The vault path');
  expect(byTestId('help-example').map((e) => e.textContent)).toEqual([
    'mesa send a1b2c3d4 "run the tests"',
    'mesa init --vault ~/vault',
  ]);
});

const ABOUT: About = {
  version: '0.1.0-beta.6',
  build: '512',
  license: 'MIT',
  links: {
    docs: 'https://docs.test',
    support: 'https://support.test',
    releases: 'https://releases.test',
  },
  attributions: [],
};

test('About Mesa opens from the Help menu and from the macOS app menu', async () => {
  let aboutMenu = () => {};
  const platform = fakePlatform({
    menu: {
      onAbout: async (handler) => {
        aboutMenu = handler;
        return () => {};
      },
    },
  });
  const { bridge } = fakeBridge({ about: () => envelope(ABOUT) });
  const byTestId = await renderWithMesa(<App />, bridge, platform);
  await click(byTestId('nav-help')[0]);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'About Mesa',
    ),
  );
  expect(byTestId('about-screen')[0]?.textContent).toContain('Version 0.1.0-beta.6 (build 512)');

  await click(byTestId('nav-help')[0]);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'Command reference',
    ),
  );
  expect(byTestId('about-screen')).toEqual([]);
  await act(async () => aboutMenu());
  expect(byTestId('about-screen')).toHaveLength(1);
});
