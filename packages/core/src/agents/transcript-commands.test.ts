import { expect, test } from 'vitest';
import { commandOf } from './transcript-commands.js';

test("Claude Code's command entries: the command with its args, then its output or error", () => {
  const ran = [
    '<command-name>/model</command-name>',
    '            <command-message>model</command-message>',
    '            <command-args>wren</command-args>',
  ].join('\n');
  expect(commandOf(ran)).toEqual({ command: '/model wren' });
  expect(commandOf('<command-name>/cost</command-name>\n<command-args></command-args>')).toEqual({
    command: '/cost',
  });
  expect(
    commandOf('<local-command-stdout>Set model to \x1b[1mWren\x1b[22m</local-command-stdout>'),
  ).toEqual({
    output: 'Set model to \x1b[1mWren\x1b[22m',
  });
  expect(commandOf('<local-command-stderr>Unknown model: kestrel</local-command-stderr>')).toEqual({
    output: 'Unknown model: kestrel',
    error: true,
  });
});

test('a prompt, a caveat, or a tag a person wrote mid-sentence is no command entry', () => {
  expect(commandOf('Find the heron')).toBeUndefined();
  expect(commandOf('Why does <command-name>/x</command-name> show?')).toBeUndefined();
  expect(
    commandOf('<local-command-caveat>Caveat: the messages below</local-command-caveat>'),
  ).toBeUndefined();
});
