import { expect, test } from 'vitest';
import { sessionRow } from '../../testing/sessions.js';
import {
  activeSession,
  exited,
  isOver,
  queued,
  recoverable,
  resumable,
  reviewable,
  waitingForInput,
} from './lifecycle.js';
import type { SessionRecord } from './record.js';
import type { SessionState } from './states.js';

// Only the fields the predicates read.
const at = '2026-01-01T00:00:00.000Z';
const state = (s: SessionState): Pick<SessionRecord, 'lastState'> => ({
  lastState: { state: s, confidence: 1, at, source: 'mesa' },
});
const managed = (fields: object) =>
  sessionRow({
    managed: true,
    id: 'a1b2c3d4',
    kind: 'interactive',
    agent: 'claude',
    alive: true,
    ...state('working'),
    ...fields,
  });
const foreign = (fields: object) =>
  sessionRow({ managed: false, id: 'ext-4200', alive: true, ...state('working'), ...fields });

test('a record is over once ended or in a final state, and not while it runs or waits', () => {
  expect(isOver({ ...state('working') })).toBe(false);
  expect(isOver({ ...state('queued') })).toBe(false);
  expect(isOver({ ...state('working'), endedAt: at })).toBe(true);
  for (const s of ['done', 'failed', 'stopped'] as const) expect(isOver(state(s))).toBe(true);
});

test('a row has exited when its window is gone or its state is final; a queued one is still active', () => {
  expect(exited(managed({}))).toBe(false);
  expect(exited(managed({ alive: false }))).toBe(true);
  expect(exited(managed(state('done')))).toBe(true);
  const waiting = managed({ alive: false, ...state('queued') });
  expect(queued(waiting)).toBe(true);
  expect(activeSession(waiting)).toBe(true);
  expect(activeSession(managed({}))).toBe(true);
  expect(activeSession(managed(state('failed')))).toBe(false);
  // A foreign session is never one of Mesa's active or queued ones.
  expect(queued(foreign(state('queued')))).toBe(false);
  expect(activeSession(foreign({}))).toBe(false);
});

test('only an active session in a waiting state waits for input', () => {
  const waitingStates = ['waiting-permission', 'waiting-question'] as const;
  for (const s of waitingStates) expect(waitingForInput(managed(state(s)))).toBe(true);
  expect(waitingForInput(managed({ alive: false, ...state('waiting-permission') }))).toBe(false);
  expect(waitingForInput(managed({}))).toBe(false);
  expect(waitingForInput(foreign(state('waiting-permission')))).toBe(false);
});

test('Review reads only a Mesa session with an interactive agent', () => {
  expect(reviewable(managed({}))).toBe(true);
  expect(reviewable(managed({ kind: 'run' }))).toBe(false);
  expect(reviewable(managed({ agent: 'terminal' }))).toBe(false);
  expect(reviewable(foreign({}))).toBe(false);
});

test('an exited session with a conversation not yet resumed is resumable', () => {
  const over = { alive: false, agentSessionId: 'conv-1' };
  expect(resumable(managed(over))).toBe(true);
  expect(resumable(managed({ ...over, alive: true }))).toBe(false);
  expect(resumable(managed({ ...over, agentSessionId: undefined }))).toBe(false);
  expect(resumable(managed({ ...over, resumedBy: 'b2c3d4e5' }))).toBe(false);
  expect(resumable(foreign(over))).toBe(false);
});

test('an exited session not ended, hidden, resumed, queued or in the background is recoverable', () => {
  const gone = { alive: false };
  expect(recoverable(managed(gone))).toBe(true);
  expect(recoverable(managed({}))).toBe(false);
  for (const extra of [
    { backgroundId: 'bg-1' },
    { endedAt: at },
    { archivedAt: at },
    { resumedBy: 'b2c3d4e5' },
    state('queued'),
  ]) {
    expect(recoverable(managed({ ...gone, ...extra }))).toBe(false);
  }
  expect(recoverable(foreign(gone))).toBe(false);
});
