import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { profilePaths } from '../../profile/paths.js';
import {
  newSession,
  plantTranscript,
  scriptedRunner,
  tempDir,
  testStore,
} from '../../testing/index.js';
import type { NewSession } from '../record/record.js';
import { eventsLog } from '../signals/hook-events.js';
import { autoName, slugName } from './auto-name.js';

const AGENT_ID = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
const say = (content: string) => ({ type: 'user', message: { role: 'user', content } });
const SECRET = 'tide-token-8f3a';

/** A session in a temp home, Haiku answering `reply`; each ask's argv, env and prompt kept. */
function setUp(fields: Partial<NewSession>, reply: string | false, ...prompts: string[]) {
  const home = tempDir();
  const store = testStore(home);
  const { id } = store.create(() => newSession(fields));
  if (prompts.length) {
    const lines = [{ type: 'user', cwd: '/src/lantern-cove' }, ...prompts.map(say)];
    plantTranscript(home, AGENT_ID, '/src/lantern-cove', lines);
  }
  const { run, calls: asks } = scriptedRunner(
    { claude: reply || '' },
    { failing: reply === false ? ['claude'] : [] },
  );
  const paths = profilePaths(home, 'default');
  const deps = {
    store,
    run,
    home,
    paths,
    env: { MESA_SESSION_ID: 'outer123' },
    secrets: () => [SECRET],
  };
  const name = () => autoName(deps, id);
  /** A turn later: its state's time moves on, a new ask. */
  const turn = (at: string) => store.update(id, { lastState: { ...store.get(id).lastState, at } });
  return { id, name, asks, turn, paths };
}

test('an unnamed session is named from its prompts by one bare Haiku call', async () => {
  const { name, asks } = setUp(
    { agentSessionId: AGENT_ID },
    'Fix Tide-Pump alarm\n',
    'hi',
    '<command-name>/model</command-name>',
    '<local-command-stdout>Set model to haiku</local-command-stdout>',
    `the tide pump alarm rings twice with key ${SECRET}, fix it`,
  );
  expect((await name()).agentName).toBe('fix-tide-pump-alarm');
  const [ask] = asks;
  expect(ask?.file).toBe('claude');
  expect(ask?.args).toEqual(
    expect.arrayContaining(['-p', '--model', 'haiku', '--no-session-persistence']),
  );
  // Its hooks would log into the session that asked.
  expect(ask?.options?.env).toMatchObject({ MESA_SESSION_ID: '' });
  expect(ask?.options?.input).toContain('<message>\nhi\n</message>');
  // Commands and their output are not the person's words, and secrets never leave Mesa.
  expect(ask?.options?.input).toContain('the tide pump alarm rings twice');
  expect(ask?.options?.input).not.toContain('/model');
  expect(ask?.options?.input).not.toContain(SECRET);
  // Named once: the next call asks nothing.
  await name();
  expect(asks).toHaveLength(1);
});

test("a ticket session is named from its ticket's title, after its branch", async () => {
  const ticket = {
    goal: 'Load LC-12 as context, then wait for my instructions.',
    from: { source: 'jira' as const, id: 'LC-12', title: 'LC-12: Tide alarm rings twice' },
  };
  const bare = setUp(ticket, 'tide-alarm');
  expect((await bare.name()).agentName).toBe('lc-12-tide-alarm');
  expect(bare.asks[0]?.options?.input).toContain(
    '<message>\nLC-12: Tide alarm rings twice\n</message>',
  );
  expect(bare.asks[0]?.options?.input).not.toContain('Load LC-12');
  expect((await setUp(ticket, 'lc-12-tide-alarm').name()).agentName).toBe('lc-12-tide-alarm');
  // A longer key is another ticket's, never this one's.
  const other = { ...ticket, from: { ...ticket.from, id: 'LC-1' } };
  expect((await setUp(other, 'lc-12-tide-alarm').name()).agentName).toBe('lc-1-lc-12-tide-alarm');
});

test('no name when there is nothing to name from, Haiku says none or fails, or it has one', async () => {
  for (const [fields, reply] of [
    [{}, 'tide-pump'],
    [{ goal: 'hi' }, 'none'],
    [{ goal: 'Fix the tide pump' }, false],
  ] as const) {
    expect((await setUp(fields, reply).name()).agentName).toBeUndefined();
  }
  const named = setUp({ goal: 'Fix the tide pump', name: 'pump' }, 'tide-pump');
  expect((await named.name()).agentName).toBeUndefined();
  expect(named.asks).toHaveLength(0);
});

test('each ask is made once, however often it is called: again only a turn later', async () => {
  const { name, asks, turn } = setUp({ goal: 'hi' }, 'none');
  await Promise.all([name(), name()]);
  await name();
  expect(asks).toHaveLength(1);
  turn('2026-09-24T12:05:00.000Z');
  await name();
  expect(asks).toHaveLength(2);
  // Nothing to name it from marks the ask too, so it is not tried until the next turn.
  const bare = setUp({}, 'tide-pump');
  expect((await bare.name()).nameAsked).toBe('2026-09-24T12:00:00.000Z');
  expect(bare.asks).toHaveLength(0);
});

test('a reply becomes a short lowercase slug', () => {
  expect(slugName('  Fix: the "tide" pump!  \nmore')).toBe('fix-the-tide-pump');
  expect(slugName('None')).toBeUndefined();
  expect(slugName('')).toBeUndefined();
  expect(slugName('a'.repeat(80))).toHaveLength(60);
});

test('a first prompt not yet in the transcript names the session from its prompt hook', async () => {
  const { id, name, asks, paths } = setUp({ agentSessionId: AGENT_ID }, 'chart-the-tide');
  const hook = (prompt: string) =>
    JSON.stringify({
      at: '2026-09-24T12:00:01.000Z',
      agent: 'claude',
      event: 'UserPromptSubmit',
      payload: { prompt },
    });
  mkdirSync(paths.events, { recursive: true });
  writeFileSync(
    eventsLog(paths.events, id),
    `${hook('/model')}\n${hook('chart the tide for the harbor')}\n`,
  );
  expect((await name()).agentName).toBe('chart-the-tide');
  expect(asks[0]?.options?.input).toContain('<message>\nchart the tide for the harbor\n</message>');
  expect(asks[0]?.options?.input).not.toContain('/model');
});
