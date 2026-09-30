import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { GENERAL_PROJECT } from '../sessions/general.js';
import type { NewSession, SessionRecord } from '../sessions/record.js';
import { sessionUri } from '../sessions/uri.js';
import { newSession } from '../testing/index.js';
import { type CanvasData, parseCanvas } from '../vault/canvas.js';
import type { VaultItem } from '../vault/item.js';
import { buildMap, mapSession } from './map.js';

const savedSessions = (canvas: CanvasData) =>
  canvas.nodes.flatMap((node) => mapSession(node) ?? []);

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
  expect(savedSessions(canvas)).toEqual([
    { project: 'lantern-cove', id: 'aaaaaaaa', label: 'aaaaaaaa', summary: summary.path },
    { project: 'lantern-cove', id: 'bbbbbbbb', label: 'Chart shoals' },
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
  expect(savedSessions(canvas).map((s) => s.id)).toEqual([
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
  expect(savedSessions(buildMap(records, [], [], { ...options, all: true }))).toHaveLength(6);
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
  expect(
    canvas.nodes.filter((node) => node.type === 'group').map((node) => [node.id, node.label]),
  ).toEqual([
    [`project:${encodeURIComponent(GENERAL_PROJECT)}`, 'General'],
    ['project:orphan', 'orphan'],
  ]);
  expect(savedSessions(canvas).map((session) => [session.project, session.id])).toEqual([
    [GENERAL_PROJECT, 'bbbbbbbb'],
    ['orphan', 'aaaaaaaa'],
    ['orphan', 'cccccccc'],
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
    savedSessions(buildMap(records, [], [], { ...options, all: true })).map((s) => s.id),
  ).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
});

test('saved namespaces reject malformed session ids and project encodings without guessing targets', () => {
  const group = {
    id: 'project:coast%20%23',
    type: 'group' as const,
    label: 'Coast',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  const node = {
    id: 'session:coast%20%23:aaaaaaaa',
    type: 'file' as const,
    file: 'wiki/exact #note.md',
    x: 1,
    y: 2,
    width: 50,
    height: 50,
  };
  expect(mapSession(node)).toEqual({
    project: 'coast #',
    id: 'aaaaaaaa',
    label: 'aaaaaaaa',
    summary: 'wiki/exact #note.md',
  });
  expect(mapSession(group)).toBeNull();
  for (const id of [
    'session:coast%20%23:bad',
    'session:coast%20%23:aaaaaaaa:extra',
    'session:%zz:aaaaaaaa',
    'personal:aaaaaaaa',
  ]) {
    expect(mapSession({ ...node, id })).toBeNull();
  }
});
