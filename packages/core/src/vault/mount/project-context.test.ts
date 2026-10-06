import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createMesa } from '../../mesa.js';
import { GENERAL_PROJECT } from '../../sessions/record/general.js';
import {
  newSession,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
  thrown,
} from '../../testing/index.js';
import { CONTEXT_BYTES } from './project-context.js';

let home: string;
let mesa: ReturnType<typeof projectProfile>['mesa'];
let sessions: ReturnType<typeof testStore>;
beforeEach(() => {
  ({ home, mesa } = projectProfile(scriptedRunner().run));
  sessions = testStore(home);
});

/** Writes an invented file into the vault, last changed `minute` minutes after 12:00 that day. */
const put = (path: string, text: string, minute = 0) => {
  const file = join(home, 'vault', path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  const at = new Date(Date.UTC(2026, 8, 1, 12, minute));
  utimesSync(file, at, at);
};
const note = (project: string, body: string, fields = '') =>
  `---\nproject: ${project}\n${fields}---\n${body}`;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

test('a project with nothing yet: empty lists and a more hint, not an error', () => {
  expect(mesa.vault.context('lantern-cove')).toEqual({
    project: 'lantern-cove',
    hub: null,
    index: [],
    notes: [],
    decisions: [],
    goals: [],
    more: 'Nothing in the vault for lantern-cove yet: no hub at projects/lantern-cove.md, no notes, and no earlier sessions.',
  });
  expect(thrown(() => mesa.vault.context('driftwood'))).toEqual({
    code: 'not_found',
    message: 'no project named driftwood; see mesa projects',
  });
  // A vault not laid out yet is an empty one: its sessions still count.
  rmSync(join(home, 'vault'), { recursive: true });
  expect(mesa.vault.context('lantern-cove')).toMatchObject({
    hub: null,
    notes: [],
    more: 'The vault does not exist yet: mesa vault init lays it out.',
  });
});

test('the overview: hub, index lines, notes and decisions newest first, goals, each capped', () => {
  put(
    'projects/lantern-cove.md',
    '---\ntype: project\n---\n# Lantern Cove\n\n## Purpose\n\nTide tables for the cove.\n\n```sh\n# not a heading\n```\n\n## Status\n\nCharting the neaps. See [[harbour]].\n',
  );
  for (let n = 1; n <= 25; n++) {
    put(`wiki/notes/lc-${n}.md`, note('lantern-cove', `# Note ${n}\n\nText.\n`), n);
  }
  // Decisions: a note with type decision, dated by its file name; a receipt is never one.
  for (let n = 1; n <= 12; n++) {
    const day = String(n).padStart(2, '0');
    put(
      `wiki/decisions/2026-09-${day}-choice-${n}.md`,
      note('lantern-cove', `# Choice ${n}\n`, 'type: decision\n'),
      60 - n,
    );
  }
  put(
    'receipts/2026/09/20260924T120000Z-decision-01K62V4Q8J3M5N7P9R1S2T3V4W.md',
    note('lantern-cove', 'Chose.\n', 'type: decision\n'),
    99,
  );
  put('wiki/driftwood.md', note('driftwood', '# Driftwood\n'), 98);
  const lines = [
    '# Index',
    '',
    '- [[projects/lantern-cove]]: the hub',
    '- [[wiki/driftwood]]: another project',
    '- no link, only lantern-cove named',
    ...Array.from({ length: 25 }, (_, i) => `- [[lc-${i + 1}]]: note ${i + 1}`),
  ];
  put('index.md', `${lines.join('\n')}\n`);
  for (let n = 1; n <= 12; n++) {
    sessions.create(() =>
      newSession({
        startedAt: `2026-09-${String(n).padStart(2, '0')}T12:00:00.000Z`,
        goal: `Goal ${n}`,
      }),
    );
  }

  const context = mesa.vault.context('lantern-cove');
  expect(context.hub).toEqual({
    path: 'projects/lantern-cove.md',
    headings: ['# Lantern Cove', '## Purpose', '## Status'],
    excerpt:
      '# Lantern Cove\n\n## Purpose\n\nTide tables for the cove.\n\n```sh\n# not a heading\n```\n\n## Status\n\nCharting the neaps. See [[harbour]].',
  });
  expect(context.index).toEqual([
    '- [[projects/lantern-cove]]: the hub',
    ...Array.from({ length: 19 }, (_, i) => `- [[lc-${i + 1}]]: note ${i + 1}`),
  ]);
  expect(context.notes).toHaveLength(20);
  expect(context.notes[0]).toEqual({
    path: 'wiki/notes/lc-25.md',
    title: 'Note 25',
    modified: '2026-09-01T12:25:00.000Z',
  });
  expect(context.notes.at(-1)?.path).toBe('wiki/notes/lc-6.md');
  expect(context.decisions.map((d) => [d.title, d.when])).toEqual(
    Array.from({ length: 10 }, (_, i) => [
      `Choice ${12 - i}`,
      `2026-09-${String(12 - i).padStart(2, '0')}`,
    ]),
  );
  expect(context.decisions[0]?.path).toBe('wiki/decisions/2026-09-12-choice-12.md');
  expect(context.goals.map((g) => [g.id, g.goal])).toEqual(
    Array.from({ length: 10 }, (_, i) => [String(12 - i).padStart(8, '0'), `Goal ${12 - i}`]),
  );
  expect(context.more).toBe(
    'Left out: 6 index lines, 5 notes, 2 decisions and 2 goals. mesa vault read <path> reads a note in full, mesa vault list --project lantern-cove lists every item, and mesa vault goals lantern-cove lists earlier goals.',
  );
  // The same vault and sessions give the same overview.
  expect(mesa.vault.context('lantern-cove')).toEqual(context);
});

test('500 invented notes for the project keep the overview under 8 KB', () => {
  const words = 'Tide gauges log the neap and spring range at the cove harbour wall each dawn.';
  put('projects/lantern-cove.md', `# Lantern Cove\n\n## Purpose\n\n${words.repeat(60)}\n`);
  const index = ['# Index', ''];
  for (let n = 1; n <= 500; n++) {
    const decision = n % 25 === 0;
    const path = decision
      ? `wiki/decisions/2026-08-${String((n % 28) + 1).padStart(2, '0')}-tide-choice-${n}.md`
      : `wiki/notes/lantern-cove-tide-gauge-reading-${n}.md`;
    put(
      path,
      note(
        'lantern-cove',
        `# Tide gauge reading ${n} at the harbour wall\n\n${words}\n`,
        decision ? 'type: decision\n' : '',
      ),
      n % 600,
    );
    index.push(`- [[${path.replace(/\.md$/, '')}]]: ${words}`);
  }
  put('index.md', `${index.join('\n')}\n`);
  for (let n = 1; n <= 30; n++) {
    sessions.create(() => newSession({ goal: `${words.repeat(6)} (${n})` }));
  }

  const context = mesa.vault.context('lantern-cove');
  const size = bytes(context);
  expect(size).toBeLessThanOrEqual(CONTEXT_BYTES);
  expect(size).toBeLessThan(8 * 1024);
  expect(context.hub?.excerpt.length).toBeLessThanOrEqual(2000);
  expect(context.index.length).toBeLessThanOrEqual(20);
  expect(context.notes.length).toBeLessThanOrEqual(20);
  expect(context.decisions.length).toBeLessThanOrEqual(10);
  expect(context.goals.length).toBeLessThanOrEqual(10);
  for (const goal of context.goals) expect(goal.goal?.length).toBeLessThanOrEqual(300);
  expect(context.notes.length).toBeGreaterThan(0);
  expect(context.goals.length).toBeGreaterThan(0);
  expect(context.more).toMatch(
    /^Left out: the rest of the hub, \d+ index lines, \d+ notes, \d+ decisions and \d+ goals\. /,
  );
  expect(mesa.vault.context('lantern-cove')).toEqual(context);
});

test('General: the whole vault, its index lines and counts per category, no hub', () => {
  put('projects/lantern-cove.md', '# Lantern Cove\n', 1);
  put('wiki/tides.md', '# Tides\n', 2);
  put('raw/chart.png', 'png');
  put('index.md', '# Index\n\n- [[wiki/tides]]: tides\n- [[projects/lantern-cove]]: the hub\n');
  sessions.create(() => newSession({ project: GENERAL_PROJECT, cwd: home, goal: 'Tidy the desk' }));
  sessions.create(() => newSession({ goal: 'Chart the cove' }));

  const context = mesa.vault.context(GENERAL_PROJECT);
  expect(context).toMatchObject({
    project: GENERAL_PROJECT,
    hub: null,
    counts: {
      raw: 1,
      wiki: 1,
      projects: 1,
      receipts: 0,
      daily: 0,
      index: 1,
      log: 1,
      agents: 1,
      user: 0,
    },
    index: ['- [[wiki/tides]]: tides', '- [[projects/lantern-cove]]: the hub'],
    notes: [
      { path: 'wiki/tides.md', title: 'Tides' },
      { path: 'projects/lantern-cove.md', title: 'Lantern Cove' },
    ],
    decisions: [],
    more: 'Nothing left out. mesa vault read <path> reads a note in full, mesa vault list lists every item, and mesa vault goals --general lists earlier goals.',
  });
  expect(context.goals.map((g) => g.goal)).toEqual(['Tidy the desk']);
});

test('the calling session is left out of its own overview', () => {
  const own = sessions.create(() => newSession({ goal: 'This one' }));
  sessions.create(() =>
    newSession({ goal: 'An earlier one', startedAt: '2026-09-23T12:00:00.000Z' }),
  );
  const inside = createMesa(
    'default',
    testDeps(home, { env: { MESA_SESSION_ID: own.id, MESA_PROFILE: 'default' } }),
  );
  expect(inside.vault.context('lantern-cove').goals.map((g) => g.goal)).toEqual(['An earlier one']);
  expect(mesa.vault.context('lantern-cove').goals.map((g) => g.goal)).toEqual([
    'This one',
    'An earlier one',
  ]);
});
