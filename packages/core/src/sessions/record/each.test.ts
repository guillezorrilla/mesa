import { expect, test } from 'vitest';
import { MesaError } from '../../lib/result.js';
import { CLAUDE_VERSION, fakeTmux, projectProfile, scriptedRunner } from '../../testing/index.js';
import { applyEach } from './each.js';

const known = new Set(['alpha', 'beta', 'gamma']);
const exists = (id: string) => known.has(id);

test('an unknown id throws not_found naming it, and no step runs', async () => {
  const ran: string[] = [];
  const result = applyEach(['alpha', 'zzzzzzzz', 'beta'], exists, async (id) => ran.push(id));
  await expect(result).rejects.toMatchObject({
    code: 'not_found',
    message: expect.stringContaining('zzzzzzzz'),
  });
  expect(ran).toEqual([]);
});

test('a duplicate id runs once, in first-seen order', async () => {
  const ran: string[] = [];
  const { items } = await applyEach(['beta', 'alpha', 'beta'], exists, async (id) => ran.push(id));
  expect(ran).toEqual(['beta', 'alpha']);
  expect(items.map((item) => item.id)).toEqual(['beta', 'alpha']);
});

test('a step that throws keeps its code and message, and the next id still runs', async () => {
  const { items } = await applyEach(['alpha', 'beta', 'gamma'], exists, async (id) => {
    if (id === 'beta') throw new MesaError('usage', 'beta is busy');
    return id.toUpperCase();
  });
  expect(items).toEqual([
    { id: 'alpha', ok: true, result: 'ALPHA' },
    { id: 'beta', ok: false, error: { code: 'usage', message: 'beta is busy' } },
    { id: 'gamma', ok: true, result: 'GAMMA' },
  ]);
});

test('archiveEach archives two live sessions and closes both windows', async () => {
  const world = fakeTmux();
  const { mesa } = projectProfile(
    scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run,
  );
  const a = (await mesa.sessions.open('lantern-cove')).result;
  const b = (await mesa.sessions.open('lantern-cove')).result;
  expect(world.windows).toHaveLength(2);
  const { items } = await mesa.sessions.archiveEach([a.id, b.id]);
  expect(items).toMatchObject([
    { id: a.id, ok: true, result: { id: a.id, archivedAt: expect.any(String) } },
    { id: b.id, ok: true, result: { id: b.id, archivedAt: expect.any(String) } },
  ]);
  expect((await mesa.sessions.show(a.id)).archivedAt).toBeTruthy();
  expect((await mesa.sessions.show(b.id)).archivedAt).toBeTruthy();
  expect(world.windows).toHaveLength(0);
});
