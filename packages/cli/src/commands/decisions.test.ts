import { readFileSync } from 'node:fs';
import { systemOneWorld, TEST_CLOUDFLARE_ACCOUNT } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const TYPESAFE_KEY = 'ts-test-0000-1111-abcd';
const CLOUDFLARE_TOKEN = 'cf-test-2222-3333-wxyz';
const CHOICE = { questions: [{ kind: 'Choice', id: 'route', options: ['ingest', 'ask'] }] };

/** An initialised profile over Jev and CLEF in memory; the world, to read or shape. */
async function setup() {
  const world = systemOneWorld();
  cli.deps = world.deps;
  await cli.withProject();
  return world;
}

/** Every output of `out`, which must never hold a key. */
const printed = (out: { stdout: string; stderr: string }) => out.stdout + out.stderr;

test('key set reads the key from stdin, or a hidden prompt in a terminal, and prints only its last 4', async () => {
  const world = await setup();
  cli.tty = false;
  cli.stdin = `${TYPESAFE_KEY}\n`;
  const piped = await cli.mesa('decisions', 'key', 'set', 'typesafe');
  expect(piped).toMatchObject({ code: 0, stderr: '' });
  expect(piped.stdout).toBe('typesafe  set, ending in abcd  added 2026-09-24\nmodel jev\n');

  cli.tty = true;
  cli.stdin = '';
  cli.typed = CLOUDFLARE_TOKEN;
  const prompted = await cli.mesa(
    'decisions',
    'key',
    'set',
    'cloudflare',
    '--account',
    TEST_CLOUDFLARE_ACCOUNT,
    '--json',
  );
  expect(cli.asked).toEqual(['Cloudflare API token: ']);
  expect(prompted.json.data).toEqual({
    key: {
      provider: 'cloudflare',
      set: true,
      addedAt: '2026-09-24T12:00:00.000Z',
      last4: 'wxyz',
    },
    model: 'jev',
  });
  const list = await cli.mesa('decisions', 'key', 'list', '--json');
  expect(list.json.data.keys.map((k: object) => Object.keys(k).sort())).toEqual([
    ['addedAt', 'last4', 'provider', 'set'],
    ['addedAt', 'last4', 'provider', 'set'],
  ]);
  for (const out of [piped, prompted, list]) {
    expect(printed(out)).not.toContain(TYPESAFE_KEY);
    expect(printed(out)).not.toContain(CLOUDFLARE_TOKEN);
  }
  const config = readFileSync(cli.paths.config, 'utf8');
  expect(config).toContain(`cloudflareAccount: ${TEST_CLOUDFLARE_ACCOUNT}`);
  expect(config).not.toContain(TYPESAFE_KEY);
  expect(world.secrets.items.size).toBe(2);
});

test('a key given as an argument is refused, and nothing is saved or sent', async () => {
  const world = await setup();
  const out = await cli.mesa('decisions', 'key', 'set', 'typesafe', TYPESAFE_KEY);
  expect(out.code).toBe(2);
  expect(printed(out)).not.toContain(TYPESAFE_KEY);
  expect(world.secrets.items.size).toBe(0);
  expect(world.requests).toEqual([]);
});

test('a rejected key says so and is not saved', async () => {
  const world = await setup();
  world.refuse('jev', 401);
  cli.stdin = TYPESAFE_KEY;
  const out = await cli.mesa('decisions', 'key', 'set', 'typesafe', '--json');
  expect(out.json.error).toEqual({
    code: 'invalid_config',
    message: 'Jev rejected the key (HTTP 401); the key was not saved',
  });
  expect(printed(out)).not.toContain(TYPESAFE_KEY);
  expect(world.secrets.items.size).toBe(0);
});

test('use picks a model with a key, and remove moves to the other one', async () => {
  await setup();
  expect((await cli.mesa('decisions', 'use', 'clef')).stderr).toBe(
    'clef has no key: run mesa decisions key set cloudflare\n',
  );
  cli.stdin = TYPESAFE_KEY;
  await cli.mesa('decisions', 'key', 'set', 'typesafe');
  cli.stdin = CLOUDFLARE_TOKEN;
  await cli.mesa('decisions', 'key', 'set', 'cloudflare', '--account', TEST_CLOUDFLARE_ACCOUNT);
  expect((await cli.mesa('decisions', 'use', 'clef')).stdout).toBe('model clef\n');
  expect((await cli.mesa('decisions', 'key', 'list')).stdout).toBe(
    'typesafe    set, ending in abcd  added 2026-09-24\n' +
      'cloudflare  set, ending in wxyz  added 2026-09-24\n' +
      'model clef\n',
  );
  expect((await cli.mesa('decisions', 'key', 'remove', 'cloudflare')).stdout).toBe(
    'removed cloudflare\nmodel jev\n',
  );
  expect((await cli.mesa('decisions', 'key', 'remove', 'typesafe', '--json')).json.data).toEqual({
    provider: 'typesafe',
    removed: true,
    model: 'none',
  });
});

test('decide asks the chosen model and records its model id; with none it asks nothing; doctor names it', async () => {
  const world = await setup();
  cli.stdin = JSON.stringify(CHOICE);
  expect((await cli.mesa('decide', '--json')).json.data.backend).toBe('rules');
  expect(world.requests).toEqual([]);
  expect((await cli.mesa('doctor', '--json')).json.data.checks).toContainEqual(
    expect.objectContaining({ name: 'decisions', version: 'rules', hint: 'rules only' }),
  );

  cli.stdin = CLOUDFLARE_TOKEN;
  await cli.mesa('decisions', 'key', 'set', 'cloudflare', '--account', TEST_CLOUDFLARE_ACCOUNT);
  cli.stdin = JSON.stringify(CHOICE);
  const decided = await cli.mesa('decide', '--json');
  expect(decided.json.data).toMatchObject({
    backend: 'clef',
    model: 'clef',
    answers: [{ id: 'route', answer: 'ingest', probabilities: { ingest: 0.8, ask: 0.2 } }],
  });
  expect((await cli.mesa('decide')).stdout).toContain('backend clef, model clef');
  const receipt = (await cli.mesa('receipts', 'show', decided.json.data.receipt.id, '--json')).json
    .data.receipt;
  expect(receipt).toMatchObject({
    outputs: { model: 'clef' },
    decisions: [{ question: 'route', backend: 'clef' }],
  });
  expect(JSON.stringify(receipt)).not.toContain(CLOUDFLARE_TOKEN);
  expect((await cli.mesa('doctor', '--json')).json.data.checks).toContainEqual(
    expect.objectContaining({
      name: 'decisions',
      version: 'clef',
      hint: 'rules first; clef below confidence 0.7',
    }),
  );
});
