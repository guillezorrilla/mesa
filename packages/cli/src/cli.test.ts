import { tempDir } from '@mesa/core/testing';
import { expect, test } from 'vitest';
import { runCli, VERSION } from './cli.js';
import { defineCommand } from './command.js';
import { cliDeps } from './testing.js';

let seen: { args: object; loud: boolean | undefined; profile: string } | undefined;
const greet = defineCommand({
  name: 'greet',
  summary: 'Greet someone (a fake command)',
  args: ['who', 'title?'],
  flags: { loud: { type: 'boolean', description: 'Shout' } },
  example: 'mesa greet ada --loud',
  run: (ctx) => {
    seen = { args: ctx.args, loud: ctx.flags.loud, profile: ctx.mesa.info().profile };
    return { data: { who: ctx.args.who }, text: `hi ${ctx.args.title ?? ''}${ctx.args.who}` };
  },
});
const greetTwice = defineCommand({
  name: 'greet twice',
  summary: 'Greet twice',
  args: ['who'],
  example: 'mesa greet twice ada',
  run: ({ args }) => ({ data: null, text: `hi ${args.who}, hi ${args.who}` }),
});
const warn = defineCommand({
  name: 'warn',
  summary: 'Succeed with a problem',
  example: 'mesa warn',
  run: () => ({ data: [1], text: 'bad', code: 3 }),
});

const deps = cliDeps(tempDir(), {
  commands: [greet, greetTwice, warn],
  env: { MESA_PROFILE: 'work' },
});
const cli = (...argv: string[]) => runCli(argv, deps);

test('main help lists every command with its arguments and summary', async () => {
  const { code, stdout } = await cli('--help');
  expect(code).toBe(0);
  expect(stdout).toMatch(/\n {2}greet <who> \[title\] {2}Greet someone \(a fake command\)\n/);
  expect(stdout).toContain('greet twice <who>');
});

test('command help prints the derived usage and the flags', async () => {
  const { code, stdout } = await cli('greet', '--help');
  expect(code).toBe(0);
  expect(stdout).toMatch(/^Usage: mesa greet <who> \[title\] \[flags\]/);
  expect(stdout).toContain('--loud');
});

test('a command gets its named args, flags, and the resolved profile', async () => {
  expect((await cli('greet', 'ada', 'dr ', '--loud')).stdout).toBe('hi dr ada\n');
  expect(seen?.args).toEqual({ who: 'ada', title: 'dr ' });
  expect(seen?.loud).toBe(true);
  expect(seen?.profile).toBe('work');
  expect((await cli('greet', 'ada', '--profile', 'p1')).code).toBe(0);
  expect(seen?.profile).toBe('p1');
});

test('a command lists its subcommands in help and in a usage error', async () => {
  const help = (await cli('greet', '--help')).stdout;
  expect(help).toContain('Subcommands:\n  greet twice <who>  Greet twice');
  const typo = await cli('greet', 'twise', 'bo', 'x');
  expect(typo.code).toBe(2);
  expect(typo.stderr).toContain('greet twice <who>');
});

test('the longest command name wins', async () => {
  expect((await cli('greet', 'twice', 'bo')).stdout).toBe('hi bo, hi bo\n');
  expect((await cli('greet', 'bo')).stdout).toBe('hi bo\n');
});

test('arity is checked from the declaration', async () => {
  const none = await cli('greet');
  expect(none.code).toBe(2);
  expect(none.stderr).toMatch(/^Usage: mesa greet <who> \[title\] \[flags\]\n/);
  expect((await cli('greet', 'a', 'b', 'c', '--json')).stdout).toContain('"code":"usage"');
});

test('global flags go before or after the command; --version is global', async () => {
  expect(await cli('--json', '--profile', 'x', 'greet', 'a')).toEqual(
    await cli('greet', 'a', '--profile', 'x', '--json'),
  );
  expect((await cli('--version', 'greet', 'a')).stdout).toBe(`${VERSION}\n`);
});

test('unknown flags and commands are usage errors through the envelope', async () => {
  const flag = await cli('greet', 'a', '--nope', '--json');
  expect(flag.code).toBe(2);
  expect(JSON.parse(flag.stdout).error.code).toBe('usage');
  const cmd = await cli('nope');
  expect(cmd).toMatchObject({ code: 2, stdout: '' });
  expect(cmd.stderr).toContain('Unknown command: nope');
  // After `--`, --json is a positional, not the flag.
  expect((await cli('nope', '--', '--json')).stdout).toBe('');
});

test('a renamed command names its successor and stays out of help', async () => {
  const old = await cli('rules', 'list');
  expect(old).toMatchObject({ code: 2, stdout: '', stderr: 'renamed to mesa instructions list\n' });
  const json = await cli('--profile', 'x', 'rules', 'list', '--project', 'y', '--json');
  expect(json.code).toBe(2);
  expect(JSON.parse(json.stdout)).toMatchObject({
    ok: false,
    error: {
      code: 'usage',
      message: 'renamed to mesa --profile x instructions list --project y --json',
    },
  });
  expect((await cli('--profile', 'rules', 'rules', 'list')).stderr).toBe(
    'renamed to mesa --profile rules instructions list\n',
  );
  expect(await cli('--version', 'rules')).toMatchObject({ code: 0, stdout: `${VERSION}\n` });
  const real = cliDeps(tempDir());
  for (const argv of [['help'], ['help', '--agent']]) {
    const { stdout } = await runCli(argv, real);
    expect(stdout).toContain('instructions');
    expect(stdout).not.toMatch(/^ *(#+ )?(mesa )?rules\b/m);
  }
});

test('a command flag cannot shadow a global one; code overrides the exit code', async () => {
  const shadow = defineCommand({
    name: 's',
    summary: 's',
    flags: { json: { type: 'string', description: 'clash' } },
    example: 'mesa s',
    run: () => ({ data: 1, text: '1' }),
  });
  const out = await runCli(['s', '--json'], { ...deps, commands: [shadow] });
  expect(JSON.parse(out.stdout)).toEqual({ ok: true, data: 1 });

  const bad = await cli('warn', '--json');
  expect(bad.code).toBe(3);
  expect(JSON.parse(bad.stdout)).toEqual({ ok: true, data: [1] });
});

test('a required flag is checked from the declaration and shows in the usage line', async () => {
  const needs = defineCommand({
    name: 'needs',
    summary: 'Needs a flag',
    flags: { to: { type: 'string', required: true, description: 'Where' } },
    example: 'mesa needs --to here',
    run: ({ flags }) => ({ data: flags.to, text: flags.to }),
  });
  const run = (...argv: string[]) => runCli(argv, { ...deps, commands: [needs] });
  expect(await run('needs')).toMatchObject({
    code: 2,
    stderr: '--to is required. Usage: mesa needs --to <string> [flags]\n',
  });
  expect((await run('needs', '--to', 'x')).stdout).toBe('x\n');
});

test('a last `words...` argument takes the words left, none or many, flags after `--` too', async () => {
  const say = defineCommand({
    name: 'say',
    summary: 'Say words',
    args: ['who', 'words...'],
    flags: { loud: { type: 'boolean', description: 'Shout' } },
    example: 'mesa say ada -- hello',
    run: ({ args, flags }) => ({ data: { ...args, loud: flags.loud ?? false }, text: '' }),
  });
  const run = async (...argv: string[]) =>
    JSON.parse((await runCli([...argv, '--json'], { ...deps, commands: [say] })).stdout);
  expect((await run('say', 'ada')).data).toEqual({ who: 'ada', words: [], loud: false });
  expect((await run('say', 'ada', 'hi', 'there', '--loud')).data).toEqual({
    who: 'ada',
    words: ['hi', 'there'],
    loud: true,
  });
  // After `--` a word that looks like a flag is a word; --json before it is still the flag.
  const words = await runCli(['say', 'ada', '--json', '--', '--loud', '-x'], {
    ...deps,
    commands: [say],
  });
  expect(JSON.parse(words.stdout).data).toEqual({
    who: 'ada',
    words: ['--loud', '-x'],
    loud: false,
  });
  const none = await runCli(['say'], { ...deps, commands: [say] });
  expect(none).toMatchObject({ code: 2, stderr: 'Usage: mesa say <who> [words...] [flags]\n' });
});
