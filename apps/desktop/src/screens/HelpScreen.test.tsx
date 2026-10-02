// @vitest-environment happy-dom
import type { CommandReference } from '@mesa/core';
import { expect, test } from 'vitest';
import { App } from '@/App';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';

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
