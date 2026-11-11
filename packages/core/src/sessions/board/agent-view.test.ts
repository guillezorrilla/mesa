import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { newSession, placedRow, shortIds, testStore } from '../../testing/index.js';
import { agentCrewRow, agentRow, agentShown } from './agent-view.js';
import type { ForeignRow } from './rows.js';

test('an agent reads a few fields a row: state and confidence flat, branch and progress when set', () => {
  const store = testStore(
    mkdtempSync(join(tmpdir(), 'mesa-view-')),
    'default',
    shortIds('bbbbbbbb'),
  );
  const record = store.create(() => ({
    ...newSession({
      project: 'lantern-cove',
      parent: 'aaaaaaaa',
      startedAt: '2026-09-24T11:00:00.000Z',
      worktree: { path: '/w/lantern-cove/tide', branch: 'tide' },
      progress: { text: 'charting buoys', at: '2026-09-24T11:30:00.000Z' },
    }),
    endedAt: '2026-09-24T12:00:00.000Z',
  }));
  const row = placedRow(record, 'idle', 0.9);
  expect(agentRow(row)).toEqual({
    id: 'bbbbbbbb',
    project: 'lantern-cove',
    agent: 'claude',
    kind: 'interactive',
    state: 'idle',
    confidence: 0.9,
    parent: 'aaaaaaaa',
    branch: 'tide',
    alive: true,
    startedAt: '2026-09-24T11:00:00.000Z',
    endedAt: '2026-09-24T12:00:00.000Z',
    progress: { text: 'charting buoys', at: '2026-09-24T11:30:00.000Z' },
  });
  const diff = { added: 4, removed: 1 };
  expect(agentCrewRow({ ...row, branch: 'tide', diff })).toMatchObject({ id: 'bbbbbbbb', diff });

  const foreign = {
    id: 'claude-0000',
    managed: false,
    project: null,
    agent: 'claude',
    cwd: '/src/tide',
    agentSessionId: 'f0',
    startedAt: '2026-09-24T10:00:00.000Z',
    alive: true,
    runningSeconds: 5,
    attention: 0,
    lastState: {
      state: 'working',
      confidence: 0.7,
      at: '2026-09-24T10:00:05.000Z',
      source: 'faro',
    },
  } as unknown as ForeignRow;
  expect(agentRow(foreign)).toEqual({
    id: 'claude-0000',
    project: null,
    agent: 'claude',
    state: 'working',
    confidence: 0.7,
    alive: true,
    startedAt: '2026-09-24T10:00:00.000Z',
  });
});

test('a shown session keeps its record, with its hook, vault and decisions as their state alone', () => {
  const configured = { state: 'configured', reason: 'it is' };
  expect(
    agentShown({
      id: 'aaaaaaaa',
      instructions: configured,
      vault: { state: 'missing', reason: 'run mesa hooks install' },
      decisions: { tool: configured, advice: { state: 'disabled', reason: 'off' } },
    }),
  ).toEqual({
    id: 'aaaaaaaa',
    instructions: 'configured',
    vault: 'missing',
    decisions: { tool: 'configured', advice: 'disabled' },
  });
});
