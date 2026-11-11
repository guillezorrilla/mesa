import { expect, test } from 'vitest';
import { counted } from '../../lib/format.js';
import type { SessionRow } from '../board/rows.js';
import {
  attentionScore,
  contextPercent,
  crewTitle,
  doingNow,
  isSetupSession,
  nameAsk,
  reviewLabel,
  sessionBranch,
  sessionCount,
  sessionLabel,
  sessionTitle,
  setupSessionsOf,
  taskTitle,
  waitingOn,
  wantsName,
} from './labels.js';

// Only the fields the view reads.
const row = (fields: object) => fields as SessionRow;
const managed = (fields: object) => row({ managed: true, id: 'a1b2c3d4', ...fields });
const foreign = row({ managed: false, id: 'ext-4200' });

test('a row reads as its name, else its agent name, else its id; its branch is its worktree, else the one it waits for', () => {
  expect(sessionLabel(managed({ name: 'tide notes' }))).toBe('tide notes');
  expect(sessionLabel(managed({}))).toBe('a1b2c3d4');
  // The name its agent gives it (a /rename in Claude Code), unless a person named it in Mesa.
  expect(sessionLabel(managed({ agentName: 'tide-charts' }))).toBe('tide-charts');
  expect(sessionLabel(managed({ name: 'tide notes', agentName: 'tide-charts' }))).toBe(
    'tide notes',
  );
  expect(sessionTitle(managed({ agentName: 'tide-charts', goal: 'Chart the tide' }))).toBe(
    'tide-charts',
  );
  expect(sessionTitle(managed({ goal: 'Chart the tide' }))).toBe('Chart the tide');
  expect(sessionLabel(row({ managed: false, id: 'ext-4200', name: 'theirs' }))).toBe('ext-4200');
  expect(sessionLabel(foreign)).toBe('ext-4200');
  const worktree = { path: '/w/try-x', branch: 'try/x' };
  expect(sessionBranch(managed({ worktree, pending: { branch: 'later' } }))).toBe('try/x');
  expect(sessionBranch(managed({ pending: { branch: 'later' } }))).toBe('later');
  // The branch its agent works on now wins: a worktree it made, or a branch it moved to.
  expect(sessionBranch(managed({ worktree, gitBranch: 'try/y' }))).toBe('try/y');
  expect(sessionBranch(managed({}))).toBeUndefined();
  expect(sessionBranch(foreign)).toBeUndefined();
  expect(waitingOn('a1b2c3d4')).toBe('waiting on a1b2c3d4');
  expect([1, 2].map(sessionCount)).toEqual(['1 session', '2 sessions']);
  expect([1, 30].map((n) => counted(n, 'day'))).toEqual(['1 day', '30 days']);
});

test('an attention score and a context reading read the same everywhere', () => {
  expect(attentionScore(0.8333)).toBe('0.83');
  expect([21.16, 54.5, 120, -3].map(contextPercent)).toEqual([21, 55, 100, 0]);
});

test('a session is worth naming on its first prompt, then between turns, until someone names it', () => {
  const idle = { kind: 'interactive', lastState: { state: 'idle', at: 'x' } };
  expect(wantsName(managed({ ...idle, goal: 'Chart the tide' }))).toBe(true);
  expect(wantsName(managed({ ...idle, conversation: true }))).toBe(true);
  const asking = { ...idle, lastState: { state: 'waiting-question', at: 'x' } };
  expect(wantsName(managed({ ...asking, goal: 'x' }))).toBe(true);
  // The first prompt names it at once, while its first turn works.
  const working = { ...idle, lastState: { state: 'working', at: 'x' } };
  expect(wantsName(managed({ ...working, conversation: true }))).toBe(true);
  // Asked once already: never again during a turn, as its state time moves with each tool call.
  expect(wantsName(managed({ ...working, conversation: true, nameAsked: 'w' }))).toBe(false);
  expect(wantsName(managed({ ...idle, conversation: true, nameAsked: 'w' }))).toBe(true);
  expect(wantsName(managed(idle))).toBe(false);
  expect(wantsName(managed({ ...idle, goal: 'x', agentName: 'tide' }))).toBe(false);
  expect(wantsName(managed({ ...idle, goal: 'x', name: 'tide' }))).toBe(false);
  expect(wantsName(managed({ ...idle, kind: 'run', goal: 'x' }))).toBe(false);
  expect(wantsName(foreign)).toBe(false);
});

test('a review session reads Review #<n> unless a person named it, and Mesa never names it', () => {
  const review = { pr: 12, round: 2, mode: 'drafts', head: 'a'.repeat(40) } as const;
  const idle = { kind: 'interactive', lastState: { state: 'idle', at: 'x' }, goal: 'Review it' };
  expect(sessionTitle(managed({ ...idle, review, agentName: 'tide-charts' }))).toBe(
    'Review #12 · round 2 · drafts',
  );
  expect(sessionLabel(managed({ review }))).toBe('Review #12');
  expect(sessionTitle(managed({ ...idle, review, name: 'tide notes' }))).toBe('tide notes');
  expect(reviewLabel(review)).toBe('Review #12 · round 2 · drafts');
  expect(wantsName(managed({ ...idle, review }))).toBe(false);
});

test('a session started from an item is named from its title at once, and asked once', () => {
  const working = { kind: 'interactive', goal: 'x', lastState: { state: 'working', at: 't1' } };
  const ticket = managed({
    ...working,
    from: { source: 'jira', id: 'LC-12', title: 'LC-12: Tide' },
  });
  expect(wantsName(ticket)).toBe(true);
  expect(nameAsk(ticket)).toBe('title');
  expect(wantsName(managed({ ...ticket, nameAsked: 'title' }))).toBe(false);
  // Prompts are read once per turn, by the time its state was set.
  const idle = managed({ ...working, lastState: { state: 'idle', at: 't3' } });
  expect(nameAsk(idle)).toBe('t3');
  expect(wantsName(managed({ ...idle, nameAsked: 't3' }))).toBe(false);
  expect(wantsName(managed({ ...idle, nameAsked: 't1' }))).toBe(true);
});

test('a child reads as its task title, else its title, and is doing its progress, else its report, else its reply', () => {
  expect(taskTitle('  Chart the tide\nwith the buoys')).toBe('Chart the tide');
  expect(crewTitle(managed({ taskTitle: 'Chart the tide', name: 'tides' }))).toBe('Chart the tide');
  expect(crewTitle(managed({ name: 'tides' }))).toBe('tides');
  const reply = { text: '\nLit the buoys.\nAll pass.', at: '2026-09-24T12:00:00.000Z' };
  const report = { kind: 'done', at: '2026-09-24T12:01:00.000Z', message: 'Logged it. Then more' };
  const progress = { text: 'Editing src/tides.ts', at: '2026-09-24T12:02:00.000Z' };
  expect(doingNow(managed({ progress, report, lastReply: reply }))).toBe('Editing src/tides.ts');
  // An ended child's progress line is stale.
  const ended = { endedAt: '2026-09-24T12:03:00.000Z' };
  expect(doingNow(managed({ ...ended, progress, report, lastReply: reply }))).toBe('Logged it.');
  expect(doingNow(managed({ lastReply: reply }))).toBe('Lit the buoys.');
  expect(doingNow(managed({}))).toBeUndefined();
  expect(doingNow(foreign)).toBeUndefined();
});

test('a Setup session is a child terminal Mesa named Setup', () => {
  const setup = { kind: 'terminal', parent: 'e5f6a7b8' };
  expect(isSetupSession(managed({ ...setup, name: 'Setup' }))).toBe(true);
  expect(isSetupSession(managed({ ...setup, name: 'Setup tide-pool' }))).toBe(true);
  expect(isSetupSession(managed({ ...setup, name: 'Setups' }))).toBe(false);
  expect(isSetupSession(managed({ kind: 'terminal', name: 'Setup' }))).toBe(false);
  const mine = managed({ ...setup, id: 'f0f0f0f0', name: 'Setup', parentNow: 'e5f6a7b8' });
  const theirs = managed({ ...setup, id: 'f1f1f1f1', name: 'Setup', parentNow: 'c0c0c0c0' });
  expect(setupSessionsOf([mine, theirs], 'e5f6a7b8')).toEqual([mine]);
  expect(isSetupSession(managed({ kind: 'interactive', parent: 'e5f6a7b8', name: 'Setup' }))).toBe(
    false,
  );
});
