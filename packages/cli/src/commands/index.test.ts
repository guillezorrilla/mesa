import { readdirSync } from 'node:fs';
import { beforeEach, expect, test } from 'vitest';
import { runCli } from '../cli.js';
import type { Command } from '../command.js';
import { cliDeps, cliHarness } from '../testing.js';
import { COMMANDS } from './index.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

/** An example's words after `mesa`, split as a shell splits them, up to a redirect or a pipe. */
const wordsOf = (example: string) => {
  const words = [
    ...example
      .slice(example.indexOf('mesa ') + 'mesa '.length)
      .matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g),
  ].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
  const end = words.findIndex((w) => w === '<' || w === '|');
  return end === -1 ? words : words.slice(0, end);
};

test('every example parses as its own command: its arguments, flags, and required flags', async () => {
  // The real parser, with each run replaced by one that names its command.
  const named = COMMANDS.map((c) => ({ ...c, run: () => ({ data: c.name, text: c.name }) }));
  for (const command of COMMANDS) {
    expect(command.example, command.name).toContain('mesa ');
    const deps = cliDeps(cli.home, { commands: named, mesa: { run: cli.run } });
    const out = await runCli(wordsOf(command.example), deps);
    expect(out, command.example).toMatchObject({ code: 0, stdout: `${command.name}\n` });
  }
});

test('mesa help --agent lists every registered command; --json has one entry each', async () => {
  const markdown = (await mesa('help', '--agent')).stdout;
  const { data } = (await mesa('help', '--agent', '--json')).json;
  expect(data.map((c: { name: string }) => c.name)).toEqual(COMMANDS.map((c) => c.name));
  // The whole heading, so `mesa config set` cannot stand in for a missing `mesa config`.
  for (const c of data) expect(markdown).toContain(`\n### \`${c.usage}\`\n`);
  expect(data.find((c: { name: string }) => c.name === 'send')).toEqual({
    name: 'send',
    usage: 'mesa send <session> <prompt> [--force] [--yes] [--from <string>] [--no-from]',
    description: "Type a prompt into a session's agent, then Enter, once the guardrail allows it",
    args: [
      { name: 'session', required: true },
      { name: 'prompt', required: true },
    ],
    flags: [
      {
        name: 'force',
        type: 'boolean',
        required: false,
        description:
          'Send anyway: past a guardrail block or ask, a pane that runs a shell, or, as a person, an agent waiting on one',
      },
      {
        name: 'yes',
        type: 'boolean',
        required: false,
        description: 'Send past a guardrail ask (a strict project) without asking y/N',
      },
      {
        name: 'from',
        type: 'string',
        required: false,
        description:
          'The session it is from, named in a header with how to reply; default: the Mesa window this runs in',
      },
      {
        name: 'no-from',
        type: 'boolean',
        required: false,
        description: 'Send it as a person, even inside a Mesa window',
      },
    ],
    example: 'mesa send a1b2c3d4 "run the tests, then summarise the failures"',
  });
});

test('mesa help without --agent prints the command list', async () => {
  const { stdout } = await mesa('help');
  expect(stdout).toBe((await mesa('--help')).stdout);
});

test('each command lives in the file named for its first word, and every file is registered', async () => {
  const dir = new URL('.', import.meta.url);
  const files = readdirSync(dir).filter((f) => /^[a-z-]+\.ts$/.test(f) && f !== 'index.ts');
  const found: string[] = [];
  for (const file of files) {
    const commands = Object.values(await import(new URL(file, dir).href)) as Command[];
    for (const c of commands) {
      expect(`${c.name.split(' ')[0]}.ts`, c.name).toBe(file);
      found.push(c.name);
    }
  }
  expect(found.sort()).toEqual(COMMANDS.map((c) => c.name).sort());
});
