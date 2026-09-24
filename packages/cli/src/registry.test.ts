import { expect, test } from 'vitest';
import { COMMANDS } from './commands.js';
import { type Command, type Context, runCli } from './registry.js';

let seen: Context | undefined;
const fake: Command = {
  name: 'fake',
  summary: 'A fake command for the registry test',
  flags: {
    name: { type: 'string', description: 'Who to greet' },
    loud: { type: 'boolean', description: 'Shout' },
  },
  run: (ctx) => {
    seen = ctx;
    return { data: { greeted: ctx.flags.name }, text: `hi ${ctx.flags.name}` };
  },
};
const table = [...COMMANDS, fake];
const env = { MESA_PROFILE: 'work' };

test('main help lists every registered command with its summary', async () => {
  const { code, stdout } = await runCli(['--help'], table, env);
  expect(code).toBe(0);
  for (const c of table) expect(stdout).toMatch(new RegExp(`${c.name}\\s+${c.summary}`));
});

test('command help prints its flags and exits 0', async () => {
  const { code, stdout } = await runCli(['fake', '--help'], table, env);
  expect(code).toBe(0);
  expect(stdout).toContain('--name <value>');
  expect(stdout).toContain('--loud');
});

test('the command receives parsed flags, args, and the resolved profile', async () => {
  const { code, stdout } = await runCli(['fake', 'extra', '--name', 'ada', '--loud'], table, env);
  expect(code).toBe(0);
  expect(stdout).toBe('hi ada\n');
  expect(seen?.flags).toMatchObject({ name: 'ada', loud: true });
  expect(seen?.args).toEqual(['extra']);
  expect(seen?.profile).toBe('work');
});

test('--version is global and a command cannot shadow a global flag', async () => {
  expect((await runCli(['--version', 'profile'], table, env)).stdout).toBe('0.1.0\n');
  const shadow: Command = {
    ...fake,
    flags: { json: { type: 'string', description: 'clash' } },
  };
  const out = await runCli(['fake', '--json'], [shadow], env);
  expect(JSON.parse(out.stdout)).toMatchObject({ ok: true });
});

test('global flags work before or after the command', async () => {
  const before = await runCli(['--json', '--profile', 'p1', 'profile'], table, env);
  const after = await runCli(['profile', '--profile', 'p1', '--json'], table, env);
  expect(before).toEqual(after);
  expect(JSON.parse(before.stdout)).toMatchObject({ ok: true, data: { profile: 'p1' } });
});

test('unknown flags and commands are usage errors through the envelope', async () => {
  const flag = await runCli(['fake', '--nope', '--json'], table, env);
  expect(flag.code).toBe(2);
  expect(JSON.parse(flag.stdout).error.code).toBe('usage');

  const cmd = await runCli(['nope'], table, env);
  expect(cmd).toMatchObject({ code: 2, stdout: '' });
  expect(cmd.stderr).toContain('Unknown command: nope');

  // After `--`, --json is a positional, not the flag.
  expect((await runCli(['nope', '--', '--json'], table, env)).stdout).toBe('');
});
