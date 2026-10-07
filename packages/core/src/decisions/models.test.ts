import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  profilePaths,
  projectProfile,
  scriptedRunner,
  systemOneWorld,
  TEST_CLOUDFLARE_ACCOUNT,
} from '../testing/index.js';

const TYPESAFE_KEY = 'ts-test-0000-1111-abcd';
const CLOUDFLARE_TOKEN = 'cf-test-2222-3333-wxyz';
const SERVICE = 'mesa-default-decisions';
const UNKNOWN = [{ kind: 'Choice', id: 'route', options: ['ingest', 'ask'] }];

/** A profile over systemOneWorld: Jev and CLEF in memory, an empty Keychain. */
function setup() {
  const world = systemOneWorld();
  const { home, mesa } = projectProfile(scriptedRunner().run, world.deps);
  const config = () => readFileSync(profilePaths(home, 'default').config, 'utf8');
  const model = () => mesa.config.get().decisions.model;
  return { world, mesa, config, model };
}

test('a key is tested with one invented question, kept in the Keychain, and listed only by its last 4', async () => {
  const { world, mesa, config, model } = setup();
  expect(await mesa.decisions.keys.list()).toEqual([
    { provider: 'typesafe', set: false },
    { provider: 'cloudflare', set: false },
  ]);
  const saved = await mesa.decisions.keys.set('typesafe', `${TYPESAFE_KEY}\n`);
  expect(saved).toEqual({
    key: { provider: 'typesafe', set: true, addedAt: '2026-09-24T12:00:00.000Z', last4: 'abcd' },
    model: 'jev',
  });
  // One call, with the key as its bearer and a question Mesa made up.
  expect(world.requests).toHaveLength(1);
  expect(world.requests[0]).toMatchObject({
    url: world.urls.jev,
    headers: { authorization: `Bearer ${TYPESAFE_KEY}` },
  });
  expect(JSON.parse(world.requests[0]?.body ?? '{}')).toMatchObject({ model: 'jev-1.13.0' });
  expect(world.secrets.items.get(`${SERVICE} typesafe`)).toContain(TYPESAFE_KEY);
  const listed = await mesa.decisions.keys.list();
  expect(listed[0]).toEqual(saved.key);
  expect(JSON.stringify(listed)).not.toContain(TYPESAFE_KEY);
  expect(config()).not.toContain(TYPESAFE_KEY);
  expect(model()).toBe('jev');

  expect(await mesa.decisions.keys.remove('typesafe')).toEqual({
    provider: 'typesafe',
    removed: true,
    model: 'none',
  });
  expect(world.secrets.items.size).toBe(0);
  expect((await mesa.decisions.keys.list())[0]).toEqual({ provider: 'typesafe', set: false });
  expect((await mesa.decisions.keys.remove('typesafe')).removed).toBe(false);
});

test('a rejected or unreachable key is not saved, and the error never holds it', async () => {
  const { world, mesa, model } = setup();
  world.refuse('jev', 401);
  const rejected = mesa.decisions.keys.set('typesafe', TYPESAFE_KEY);
  await expect(rejected).rejects.toMatchObject({
    code: 'invalid_config',
    message: 'Jev rejected the key (HTTP 401); the key was not saved',
  });
  world.refuse('jev', 503);
  await expect(mesa.decisions.keys.set('typesafe', TYPESAFE_KEY)).rejects.toMatchObject({
    message: 'Jev is unavailable (HTTP 503); the key was not saved',
  });
  expect(world.secrets.items.size).toBe(0);
  expect(model()).toBe('none');
  await expect(mesa.decisions.keys.set('typesafe', '  ')).rejects.toMatchObject({ code: 'usage' });
  await expect(mesa.decisions.keys.set('openai', TYPESAFE_KEY)).rejects.toMatchObject({
    message: 'unknown key openai; one of typesafe, cloudflare',
  });
});

test('a Cloudflare token needs its account ID, which config.yaml keeps; the token stays in the Keychain', async () => {
  const { world, mesa, config, model } = setup();
  await expect(mesa.decisions.keys.set('cloudflare', CLOUDFLARE_TOKEN)).rejects.toMatchObject({
    code: 'usage',
    message: 'a Cloudflare token needs its account ID: --account <id>',
  });
  await expect(
    mesa.decisions.keys.set('typesafe', TYPESAFE_KEY, { account: TEST_CLOUDFLARE_ACCOUNT }),
  ).rejects.toMatchObject({ code: 'usage' });
  expect(world.requests).toEqual([]);
  const saved = await mesa.decisions.keys.set('cloudflare', CLOUDFLARE_TOKEN, {
    account: TEST_CLOUDFLARE_ACCOUNT,
  });
  expect(saved).toMatchObject({ key: { last4: 'wxyz' }, model: 'clef' });
  expect(world.requests.map((r) => r.url)).toEqual([world.urls.clef]);
  expect(mesa.config.get().decisions.cloudflareAccount).toBe(TEST_CLOUDFLARE_ACCOUNT);
  expect(config()).not.toContain(CLOUDFLARE_TOKEN);
  // A replaced token reuses the account ID kept.
  await mesa.decisions.keys.set('cloudflare', `${CLOUDFLARE_TOKEN}-2`);
  expect(model()).toBe('clef');
});

test('the first key selects its model; with both the person picks; removing the chosen one falls to the other', async () => {
  const { mesa, model } = setup();
  await expect(mesa.decisions.use('jev')).rejects.toMatchObject({
    code: 'usage',
    message: 'jev has no key: run mesa decisions key set typesafe',
  });
  await expect(mesa.decisions.use('haiku')).rejects.toMatchObject({ code: 'usage' });
  // The model is chosen through mesa decisions use only, which checks its key.
  expect(() => mesa.config.set('decisions.model', 'jev')).toThrow(/mesa decisions use/);
  expect(model()).toBe('none');

  await mesa.decisions.keys.set('cloudflare', CLOUDFLARE_TOKEN, {
    account: TEST_CLOUDFLARE_ACCOUNT,
  });
  expect(model()).toBe('clef');
  // A second key leaves the choice alone.
  expect((await mesa.decisions.keys.set('typesafe', TYPESAFE_KEY)).model).toBe('clef');
  expect(await mesa.decisions.use('jev')).toEqual({ model: 'jev', changed: true });
  expect(await mesa.decisions.use('none')).toEqual({ model: 'none', changed: true });
  // None stays chosen when a key is replaced while the other is set.
  await mesa.decisions.keys.set('typesafe', TYPESAFE_KEY);
  expect(model()).toBe('none');
  await mesa.decisions.use('jev');
  // Removing the other key keeps the choice; removing the chosen one moves to the other, or none.
  await mesa.decisions.keys.set('cloudflare', CLOUDFLARE_TOKEN);
  expect((await mesa.decisions.keys.remove('cloudflare')).model).toBe('jev');
  await mesa.decisions.keys.set('cloudflare', CLOUDFLARE_TOKEN);
  expect((await mesa.decisions.keys.remove('typesafe')).model).toBe('clef');
  expect((await mesa.decisions.keys.remove('cloudflare')).model).toBe('none');
});

test('mesa decide asks the chosen model about questions no rules know, and only it; none asks nothing', async () => {
  const { world, mesa } = setup();
  const none = await mesa.decide(null, UNKNOWN);
  expect(none.result).toMatchObject({
    backend: 'rules',
    answers: [{ answer: 'ingest', probabilities: { ingest: 0.5, ask: 0.5 } }],
  });
  expect(world.requests).toEqual([]);

  await mesa.decisions.keys.set('typesafe', TYPESAFE_KEY);
  await mesa.decisions.keys.set('cloudflare', CLOUDFLARE_TOKEN, {
    account: TEST_CLOUDFLARE_ACCOUNT,
  });
  world.requests.length = 0;
  const asked = await mesa.decide('a screen', UNKNOWN);
  expect(asked.result).toMatchObject({
    backend: 'jev',
    model: 'jev-1.13.0',
    answers: [{ id: 'route', answer: 'ingest', probabilities: { ingest: 0.8, ask: 0.2 } }],
  });
  expect(asked.result.costUsd).toBeCloseTo((100 * 0.042) / 1e6);
  // A Score is asked too: no rules have an opinion on it.
  const scored = await mesa.decide(null, [{ kind: 'Score', id: 'u', levels: ['low', 'high'] }]);
  expect(scored.result.backend).toBe('jev');
  expect(world.requests.map((r) => r.url)).toEqual([world.urls.jev, world.urls.jev]);

  await mesa.decisions.use('clef');
  expect((await mesa.decide(null, UNKNOWN)).result).toMatchObject({
    backend: 'clef',
    model: 'clef',
  });

  // No fallback to the other provider: a failed call is the rules' answer, with the reason.
  world.refuse('clef', 503);
  expect((await mesa.decide(null, UNKNOWN)).result).toMatchObject({
    backend: 'rules-fallback',
    fallbackReason: 'CLEF is unavailable (HTTP 503)',
    answers: [{ probabilities: { ingest: 0.5, ask: 0.5 } }],
  });
  expect(world.requests.filter((r) => r.url === world.urls.jev)).toHaveLength(2);
  // A key deleted outside Mesa is never sent: the rules answer, and say why.
  world.refuse('clef');
  world.secrets.items.delete(`${SERVICE} cloudflare`);
  expect((await mesa.decide(null, UNKNOWN)).result).toMatchObject({
    backend: 'rules-fallback',
    fallbackReason: 'no cloudflare key: run mesa decisions key set cloudflare',
  });
});
