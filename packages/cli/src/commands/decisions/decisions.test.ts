import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Stdio } from '@mesa/core';
import {
  driveMcp,
  mcpInitialize,
  rpc,
  systemOneWorld,
  TEST_CLOUDFLARE_ACCOUNT,
} from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

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

// Decision assistance for sessions (#462): evaluate, context, advise, status, off/on and mcp.

const NEXT = {
  site: 'next-step',
  candidates: [
    { id: 'add-retry', step: 'Wrap the feed call in the retry helper' },
    { id: 'rerun', step: 'Rerun the suite' },
  ],
};

/** Jev with its key, a live session on lantern-cove with a goal, and mesa run in its window. */
async function assisted() {
  const world = await setup();
  cli.withTmux();
  cli.stdin = TYPESAFE_KEY;
  await cli.mesa('decisions', 'key', 'set', 'typesafe');
  const opened = await cli.mesa(
    'open',
    'lantern-cove',
    '--goal',
    'Make the feed import retry',
    '--json',
  );
  const id = opened.json.data.id as string;
  cli.env = { MESA_SESSION_ID: id, MESA_PROFILE: 'default' };
  world.requests.length = 0;
  return { world, id };
}

/** An answer without what differs between two calls of the same request. */
const normal = ({
  evaluation: { cached: _, latencyMs: __, ...evaluation },
  ...rest
}: {
  evaluation: Record<string, unknown>;
}) => ({ ...rest, evaluation });

test('evaluate, advise and context answer a session alike, in JSON and in words', async () => {
  const { world, id } = await assisted();
  cli.stdin = JSON.stringify(NEXT);
  const evaluated = await cli.mesa('decisions', 'evaluate', '--json');
  expect(evaluated).toMatchObject({ code: 0, stderr: '' });
  expect(evaluated.json.data).toMatchObject({
    session: id,
    site: 'next-step',
    evaluation: { status: 'accepted', answer: 'add-retry', model: 'jev-1.13.0' },
  });
  cli.stdin = JSON.stringify({ candidates: NEXT.candidates });
  const advised = await cli.mesa('decisions', 'advise', 'next-step', '--json');
  expect(normal(advised.json.data)).toEqual(normal(evaluated.json.data));
  expect(world.requests).toHaveLength(1);
  cli.stdin = JSON.stringify({ candidates: NEXT.candidates });
  expect((await cli.mesa('decisions', 'advise', 'next-step')).stdout).toBe(
    'Suggested next step: add-retry (margin 0.70, jev-1.13.0). Advice only: weigh it and act yourself.\naccepted, jev-1.13.0, margin 0.70, ready answer\n',
  );
  const put = (path: string, text: string) => {
    mkdirSync(join(cli.home, 'vault', path, '..'), { recursive: true });
    writeFileSync(join(cli.home, 'vault', path), text);
  };
  put('projects/lantern-cove/retry.md', '# Retry\n\nThe feed import retries through the helper.\n');
  const context = await cli.mesa('decisions', 'context', 'feed retry', '--json');
  expect(context.json.data).toMatchObject({
    query: 'feed retry',
    required: { goal: 'Make the feed import retry' },
    sources: [{ id: 'note:projects/lantern-cove/retry.md' }],
  });
  cli.stdin = JSON.stringify({ site: 'relevance', query: 'feed retry' });
  expect(normal((await cli.mesa('decisions', 'evaluate', '--json')).json.data)).toEqual(
    normal(context.json.data),
  );
  expect((await cli.mesa('decisions', 'context')).stdout).toContain(
    '1. note:projects/lantern-cove/retry.md  Retry',
  );
});

test('a session reaches only its own context; a person names one; bad input is usage', async () => {
  const { world, id } = await assisted();
  const other = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  expect(await cli.mesa('decisions', 'context', '--session', other)).toMatchObject({
    code: 2,
    stderr: `session ${id} uses only its own context, not session ${other}'s\n`,
  });
  cli.env = {};
  expect((await cli.mesa('decisions', 'context')).stderr).toBe(
    'not in a Mesa session: name one with --session <id>\n',
  );
  cli.stdin = JSON.stringify(NEXT);
  expect(
    (await cli.mesa('decisions', 'evaluate', '--session', other, '--json')).json.data.session,
  ).toBe(other);
  cli.stdin = 'not json';
  expect((await cli.mesa('decisions', 'evaluate', '--session', other)).code).toBe(2);
  expect((await cli.mesa('decisions', 'advise', 'supervision', '--session', other)).stderr).toBe(
    'advise next-step or evidence, not supervision\n',
  );
  await cli.mesa('stop', other);
  cli.stdin = JSON.stringify(NEXT);
  expect((await cli.mesa('decisions', 'evaluate', '--session', other)).stderr).toMatch(/ended at/);
  expect(world.requests).toHaveLength(1);
});

test('status shows each mode, off and on turn a session off and back, and a kept decision prints its receipt', async () => {
  const { world, id } = await assisted();
  const status = await cli.mesa('decisions', 'status');
  expect(status.stdout).toBe(
    [
      `session ${id} (lantern-cove), model jev`,
      'relevance  automatic  accepts at margin 0.5',
      'next-step  automatic  accepts at margin 0.5',
      'evidence   automatic  accepts at margin 0.5',
      'deadlines 1.5 s per turn, 10 s on demand; 0 ready answers',
      'no decision use yet',
      '',
    ].join('\n'),
  );
  expect((await cli.mesa('decisions', 'off')).stdout).toBe(
    `decision assistance off for session ${id}\n`,
  );
  cli.stdin = JSON.stringify(NEXT);
  expect((await cli.mesa('decisions', 'evaluate', '--json')).json.data.evaluation).toMatchObject({
    status: 'unavailable',
    reason: `decision assistance is off for session ${id}`,
  });
  expect(
    (await cli.mesa('decisions', 'status', '--json')).json.data.sites.map(
      (s: { mode: string }) => s.mode,
    ),
  ).toEqual(['off', 'off', 'off']);
  await cli.mesa('decisions', 'on');
  expect(world.requests).toEqual([]);
  cli.stdin = JSON.stringify(NEXT);
  const kept = await cli.mesa(
    'decisions',
    'evaluate',
    '--rationale',
    'The helper is the convention',
  );
  expect(kept.stdout).toMatch(/\nreceipt receipts\/2026\/09\/.*-decision-.*\.md\n$/);
  expect((await cli.mesa('decisions', 'status')).stdout).toMatch(
    /2026-09-24T12:00:00.000Z {2}next-step {2}accepted {2}0 ms/,
  );
});

test('decisions mcp serves the same answers over stdio, and prints its tool with --tools', async () => {
  const { world } = await assisted();
  const tools = (await cli.mesa('decisions', 'mcp', '--tools', '--json')).json.data.tools;
  expect(tools.map((t: { name: string }) => t.name)).toEqual(['decision_evaluate']);
  const started = await cli.mesa('decisions', 'mcp');
  expect([started.code, started.stdout, started.stderr]).toEqual([0, '', '']);
  const out = await driveMcp(
    started.serve as (io: Stdio) => Promise<void>,
    mcpInitialize,
    rpc(2, 'tools/list'),
    rpc(3, 'tools/call', { name: 'decision_evaluate', arguments: NEXT }),
  );
  expect(out.reply(2)?.result?.tools).toEqual(tools);
  cli.stdin = JSON.stringify(NEXT);
  const cliAnswer = (await cli.mesa('decisions', 'evaluate', '--json')).json.data;
  expect(normal(JSON.parse(out.text(3)))).toEqual(normal(cliAnswer));
  expect(world.requests).toHaveLength(1);
});
