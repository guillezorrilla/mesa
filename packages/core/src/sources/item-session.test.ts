import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { finishesRun, importProfile, testStore } from '../testing/index.js';

const SITE = 'https://lantern-cove.atlassian.net';
const PAGE_URL = `${SITE}/wiki/spaces/LC/pages/9001/Tide+schedule`;

/** lantern-cove with LC-12 imported, with its note. */
async function imported() {
  const world = await importProfile();
  world.world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  world.world.servePage('9001', { title: 'Tide schedule', html: '<p>Twice a day.</p>' });
  await world.mesa.imports.add('lantern-cove', ['LC-12']);
  return world;
}

const LC12_GOAL = [
  'Work on the imported Jira issue LC-12: Fix the tide alarm',
  `Source: ${SITE}/browse/LC-12`,
  'Read these with the mesa-vault read_note tool before you begin:',
  '- Note: wiki/notes/lc-12-fix-the-tide-alarm.md',
  '- Latest snapshot: raw/jira/LC-12/2026-09-24T1200.md',
].join('\n');

test('a session started from an imported item by id or link gets its goal and keeps its source and id', async () => {
  const { mesa, agents } = await imported();

  const byId = await mesa.imports.open('lantern-cove', { from: 'LC-12', goal: 'Then fix it.' });
  expect(byId.result).toMatchObject({
    project: 'lantern-cove',
    goal: `${LC12_GOAL}\n\nThen fix it.`,
    from: { source: 'jira', id: 'LC-12' },
  });
  // The goal is claude's first prompt, whole.
  expect(agents.tmux.windows.at(-1)?.launch).toContain('mesa-vault read_note tool');

  // A link to it finds the same item, with no new fetch.
  const byLink = await mesa.imports.open('lantern-cove', { from: `${SITE}/browse/LC-12` });
  expect(byLink.result).toMatchObject({ goal: LC12_GOAL, from: { source: 'jira', id: 'LC-12' } });
  expect(mesa.imports.list('lantern-cove').items).toHaveLength(1);

  const rows = await mesa.sessions.list(false, { adapter: false });
  const started = rows.flatMap((r) => (r.managed && r.kind === 'interactive' ? [r.from] : []));
  expect(started).toEqual([
    { source: 'jira', id: 'LC-12' },
    { source: 'jira', id: 'LC-12' },
  ]);

  expect(await mesa.imports.goal('lantern-cove', 'LC-12')).toEqual({
    source: 'jira',
    id: 'LC-12',
    title: 'LC-12: Fix the tide alarm',
    goal: LC12_GOAL,
  });
  // The app's edited goal stands as given, the item still kept.
  const edited = await mesa.imports.open('lantern-cove', {
    from: 'LC-12',
    goal: 'Only the alarm part.',
    exactGoal: true,
  });
  expect(edited.result).toMatchObject({
    goal: 'Only the alarm part.',
    from: { source: 'jira', id: 'LC-12' },
  });
});

test('a link not imported yet is imported first, honouring notes off, then started', async () => {
  const { mesa, vault, agents } = await imported();
  const runs = () => agents.tmux.windows.filter((w) => w.launch.includes('/import-notes')).length;
  const before = runs();

  const { result } = await mesa.imports.open('lantern-cove', { from: PAGE_URL, notes: false });

  expect(runs()).toBe(before);
  expect(readdirSync(join(vault, 'raw/confluence/9001'))).toEqual(['2026-09-24T1200.md']);
  expect(result).toMatchObject({
    goal: [
      'Work on the imported Confluence page Tide schedule',
      `Source: ${SITE}/wiki/spaces/LC/pages/9001`,
      'Read these with the mesa-vault read_note tool before you begin:',
      '- Latest snapshot: raw/confluence/9001/2026-09-24T1200.md',
    ].join('\n'),
    from: { source: 'confluence', id: '9001' },
  });
});

test('a link imported first whose notes run fails still starts, with a warning that says why', async () => {
  const { mesa, agent } = await imported();
  const fails = finishesRun({ output: '', status: 1, stderr: 'claude: not logged in' });
  agent((w) => {
    if (w.launch.includes('/import-notes')) fails(w);
  });

  const opened = await mesa.imports.open('lantern-cove', { from: PAGE_URL });

  expect(opened.result).toMatchObject({ from: { source: 'confluence', id: '9001' } });
  expect(opened.result.goal).not.toContain('- Note:');
  expect(opened.warning).toBe(
    'notes not written for 9001 (claude printed no result; claude exited with status 1; claude: not logged in)',
  );
});

test('an item that cannot be imported, --goal-file, or a goal too long starts nothing', async () => {
  const { mesa, home, vault, world } = await imported();
  const started = testStore(home).list().length;

  await expect(
    mesa.imports.open('lantern-cove', { from: `${SITE}/browse/LC-404` }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(existsSync(join(vault, 'raw/jira/LC-404'))).toBe(false);
  await expect(
    mesa.imports.open('lantern-cove', { from: 'https://elsewhere.atlassian.net/browse/X-1' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(mesa.imports.goal('lantern-cove', `${SITE}/browse/LC-13`)).rejects.toMatchObject({
    code: 'not_found',
    message: expect.stringContaining('lantern-cove imported no'),
  });

  world.servePage('9002', { title: 'Harbour', html: '<p>Boats.</p>' });
  await expect(
    mesa.imports.open('lantern-cove', {
      from: `${SITE}/wiki/spaces/LC/pages/9002`,
      goalFile: join(home, 'goal.md'),
    }),
  ).rejects.toMatchObject({ code: 'usage', message: 'pass --from or --goal-file, not both' });
  expect(existsSync(join(vault, 'raw/confluence/9002'))).toBe(false);
  await expect(
    mesa.imports.open(undefined, { from: 'LC-12', general: true }),
  ).rejects.toMatchObject({ code: 'usage' });
  await expect(mesa.imports.open('lantern-cove', { exactGoal: true })).rejects.toMatchObject({
    code: 'usage',
    message: '--no-notes and --exact-goal need --from',
  });

  await expect(
    mesa.imports.open('lantern-cove', { from: 'LC-12', goal: 'x'.repeat(13_000) }),
  ).rejects.toMatchObject({ code: 'usage', message: expect.stringContaining('over the 12000') });
  expect(testStore(home).list()).toHaveLength(started);
});

test('a long title is clipped in the goal, never its paths', async () => {
  const { mesa, world } = await importProfile();
  world.serveIssue('LC-12', { summary: 'Tide '.repeat(100), description: '<p>Late.</p>' });
  await mesa.imports.add('lantern-cove', ['LC-12'], false);

  const { goal } = await mesa.imports.goal('lantern-cove', 'LC-12');

  const [first = '', ...rest] = goal.split('\n');
  expect(first.endsWith('...')).toBe(true);
  expect(first.length).toBeLessThan(260);
  expect(rest.at(-1)).toBe('- Latest snapshot: raw/jira/LC-12/2026-09-24T1200.md');
});
