import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { GENERAL_PROJECT } from '../sessions/general.js';
import type { NewSession, SessionRecord } from '../sessions/record.js';
import { sessionUri } from '../sessions/uri.js';
import { newSession } from '../testing/index.js';
import { parseCanvas } from '../vault/canvas.js';
import type { VaultItem } from '../vault/item.js';
import { buildMap, mapGroups } from './map.js';

const through = Date.parse('2026-09-24T12:00:00.000Z');
const options = { profile: 'default', from: through - 30 * 86400000, through };
const record = (id: string, extra: Partial<NewSession> = {}): SessionRecord => ({
  ...newSession(extra),
  id,
  events: [],
});
const summary: VaultItem = {
  path: 'wiki/sessions/aaaaaaaa.md',
  kind: 'markdown',
  category: 'wiki',
  size: 10,
  modified: '2026-09-24T12:00:00.000Z',
};

test('golden Canvas pins namespaces, geometry, summary target, warning and predecessor direction', () => {
  const canvas = buildMap(
    [
      record('bbbbbbbb', {
        name: 'Chart shoals',
        goal: 'Use the blue buoy',
        resumedFrom: 'aaaaaaaa',
      }),
      record('aaaaaaaa', { startedAt: '2026-08-01T12:00:00.000Z' }),
    ],
    [{ name: 'lantern-cove', path: '/invented/missing', label: 'Lantern Cove', hidden: true }],
    [summary],
    options,
  );
  const golden = JSON.parse(
    readFileSync(new URL('./fixtures/map.canvas', import.meta.url), 'utf8'),
  );
  expect(canvas).toEqual(golden);
  expect(parseCanvas(canvas)).toEqual(canvas);
  expect(mapGroups(canvas)).toEqual([
    {
      project: 'lantern-cove',
      label: 'Lantern Cove',
      sessions: [
        { id: 'aaaaaaaa', label: 'aaaaaaaa', summary: summary.path },
        { id: 'bbbbbbbb', label: 'Chart shoals' },
      ],
    },
  ]);
  expect(
    buildMap(
      [
        record('aaaaaaaa', { startedAt: '2026-08-01T12:00:00.000Z' }),
        record('bbbbbbbb', {
          name: 'Chart shoals',
          goal: 'Use the blue buoy',
          resumedFrom: 'aaaaaaaa',
        }),
      ],
      [],
      [summary],
      options,
    ).nodes.map((n) => n.id),
  ).toEqual(canvas.nodes.map((n) => n.id));
});

test('inclusive elapsed cutoff, future exclusion, transitive ancestors, cycles and missing references', () => {
  const records = [
    record('aaaaaaaa', {
      startedAt: new Date(options.from).toISOString(),
      resumedFrom: 'bbbbbbbb',
    }),
    record('bbbbbbbb', { startedAt: '2026-07-01T00:00:00.000Z', resumedFrom: 'cccccccc' }),
    record('cccccccc', { startedAt: '2026-06-01T00:00:00.000Z', resumedFrom: 'bbbbbbbb' }),
    record('dddddddd', { startedAt: new Date(options.from - 1).toISOString() }),
    record('eeeeeeee', { startedAt: new Date(through + 1).toISOString() }),
    record('ffffffff', { resumedFrom: 'missing1', parent: 'dddddddd', after: 'eeeeeeee' }),
  ];
  const canvas = buildMap(records, [], [], options);
  expect(mapGroups(canvas)[0]?.sessions.map((s) => s.id)).toEqual([
    'cccccccc',
    'bbbbbbbb',
    'aaaaaaaa',
    'ffffffff',
  ]);
  expect(
    canvas.edges.map((e) => [e.fromNode.split(':').at(-1), e.toNode.split(':').at(-1)]),
  ).toEqual([
    ['bbbbbbbb', 'aaaaaaaa'],
    ['cccccccc', 'bbbbbbbb'],
    ['bbbbbbbb', 'cccccccc'],
  ]);
  expect(mapGroups(buildMap(records, [], [], { ...options, all: true }))[0]?.sessions).toHaveLength(
    6,
  );
});

test('all saved kinds, terminal states, group identities, ties, General and orphan labels', () => {
  const records = [
    record('cccccccc', { project: 'orphan', kind: 'run', archivedAt: '2026-09-24T12:00:00.000Z' }),
    record('bbbbbbbb', {
      project: GENERAL_PROJECT,
      kind: 'terminal',
      agent: 'terminal',
      endedAt: '2026-09-24T12:00:00.000Z',
    }),
    record('aaaaaaaa', { project: 'orphan' }),
  ];
  const canvas = buildMap(records, [{ name: 'empty', path: '/invented/empty' }], [], options);
  expect(mapGroups(canvas).map((g) => [g.project, g.label, g.sessions.map((s) => s.id)])).toEqual([
    [GENERAL_PROJECT, 'General', ['bbbbbbbb']],
    ['orphan', 'orphan', ['aaaaaaaa', 'cccccccc']],
  ]);
  expect(
    canvas.nodes
      .filter((n) => n.type === 'text')
      .map((n) => n.text)
      .join('\n'),
  ).toContain('terminal: working');
});

test('summary availability selects file nodes and text goals are clipped by code point', () => {
  const records = [record('aaaaaaaa', { goal: '🐚'.repeat(201) })];
  const nodeOf = (items: VaultItem[]) => buildMap(records, [], items, options).nodes[2];
  expect(nodeOf([summary])).toMatchObject({ type: 'file', file: summary.path });
  for (const items of [
    [],
    [{ ...summary, unavailable: 'unreadable' as const }],
    [{ ...summary, kind: 'other' as const }],
    [{ ...summary, path: 'wiki/sessions/elsewhere.md' }],
  ]) {
    const node = nodeOf(items);
    expect(node?.type).toBe('text');
    if (node?.type !== 'text') throw new Error('expected text');
    expect([...(node.text.split('\n')[2] ?? '')]).toHaveLength(200);
    expect(node.text).toContain('mesa://session/aaaaaaaa?profile=default');
  }
  expect(sessionUri('aaaaaaaa', "coast!'()* /?")).toBe(
    'mesa://session/aaaaaaaa?profile=coast%21%27%28%29%2A%20%2F%3F',
  );
});

test('chronology and equal-instant id ties use timestamps with mixed valid precision', () => {
  const records = [
    record('cccccccc', { startedAt: '2026-09-24T12:00:00.100Z' }),
    record('bbbbbbbb', { startedAt: '2026-09-24T12:00:00Z' }),
    record('aaaaaaaa', { startedAt: '2026-09-24T12:00:00.000Z' }),
  ];
  expect(
    mapGroups(buildMap(records, [], [], { ...options, all: true }))[0]?.sessions.map((s) => s.id),
  ).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
});
