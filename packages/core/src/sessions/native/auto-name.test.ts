import { expect, test } from 'vitest';
import type { Runner } from '../../lib/process.js';
import { newSession, plantTranscript, tempDir, testStore } from '../../testing/index.js';
import type { NewSession } from '../record/record.js';
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
    plantTranscript(
      home,
      AGENT_ID,
      '/src/lantern-cove',
      lines.map((l) => JSON.stringify(l)).join('\n'),
    );
  }
  const asks: { file: string; args: string[]; env?: object; input?: string }[] = [];
  const run: Runner = async (file, args, _timeout, options) => {
    asks.push({ file, args, env: options?.env, input: options?.input });
    return reply === false
      ? { ok: false, reason: 'failed', detail: 'exit 1' }
      : { ok: true, stdout: reply };
  };
  const deps = { store, run, home, env: { MESA_SESSION_ID: 'outer123' }, secrets: () => [SECRET] };
  const name = () => autoName(deps, id);
  return { name, asks };
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
  expect(ask?.env).toMatchObject({ MESA_SESSION_ID: '' });
  expect(ask?.input).toContain('<message>\nhi\n</message>');
  // Commands and their output are not the person's words, and secrets never leave Mesa.
  expect(ask?.input).toContain('the tide pump alarm rings twice');
  expect(ask?.input).not.toContain('/model');
  expect(ask?.input).not.toContain(SECRET);
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
  expect(bare.asks[0]?.input).toContain('<message>\nLC-12: Tide alarm rings twice\n</message>');
  expect(bare.asks[0]?.input).not.toContain('Load LC-12');
  expect((await setUp(ticket, 'lc-12-tide-alarm').name()).agentName).toBe('lc-12-tide-alarm');
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

test('a reply becomes a short lowercase slug', () => {
  expect(slugName('  Fix: the "tide" pump!  \nmore')).toBe('fix-the-tide-pump');
  expect(slugName('None')).toBeUndefined();
  expect(slugName('')).toBeUndefined();
  expect(slugName('a'.repeat(80))).toHaveLength(60);
});
