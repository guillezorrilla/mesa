import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('each command lives in the file or folder named for its first word, and every file is registered', async () => {
  const dir = new URL('.', import.meta.url);
  const isModule = (f: string) => /^[a-z-]+\.ts$/.test(f) && f !== 'index.ts';
  const found: string[] = [];
  const check = async (file: URL, word: string) => {
    const exported = Object.values(await import(file.href)) as unknown[];
    const commands = exported.filter((v): v is Command => typeof v === 'object' && v !== null);
    for (const c of commands) {
      expect(c.name.split(' ')[0], c.name).toBe(word);
      found.push(c.name);
    }
  };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const folder = new URL(`${entry.name}/`, dir);
      for (const file of readdirSync(folder).filter(isModule)) {
        await check(new URL(file, folder), entry.name);
      }
    } else if (isModule(entry.name)) {
      await check(new URL(entry.name, dir), entry.name.slice(0, -'.ts'.length));
    }
  }
  expect(found.sort()).toEqual(COMMANDS.map((c) => c.name).sort());
});

test("the mesa-vault skill's save commands parse as vault save's own", async () => {
  const deps = cliDeps(cli.home, { mesa: { run: cli.run } });
  const skill = readFileSync(join(deps.mesa.skillsDir, 'mesa-vault/SKILL.md'), 'utf8');
  const saves = skill.split('\n').filter((line) => line.startsWith('mesa vault save '));
  expect(saves).toHaveLength(3);
  const named = COMMANDS.map((c) => ({ ...c, run: () => ({ data: c.name, text: c.name }) }));
  for (const line of saves) {
    // Each ends in --json, as an agent runs it.
    const out = await runCli(wordsOf(line), { ...deps, commands: named });
    const name = line.split(' ').slice(1, 4).join(' ');
    expect([out.code, JSON.parse(out.stdout)], line).toEqual([0, { ok: true, data: name }]);
  }
});
