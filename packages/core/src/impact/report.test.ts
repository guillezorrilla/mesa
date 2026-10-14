import { expect, test } from 'vitest';
import type { LogEntry } from '../decisions/log.js';
import type { ReceiptEntry } from '../receipts/store.js';
import { EMPTY_IMPACT, foldedText, type ImpactRecord, impactReport } from './report.js';

const AT = '2026-10-13T09:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(AT) + minutes * 60_000).toISOString();

let n = 0;
const entry = (over: Partial<LogEntry>): LogEntry => ({
  id: `e${++n}`,
  at: AT,
  site: 'supervision',
  session: 'a1b2c3d4',
  project: 'lantern-cove',
  question: 'What state is this session in?',
  rules: 'idle',
  answer: 'idle',
  by: 'clef',
  status: 'accepted',
  changed: false,
  ...over,
});

/** A receipt as listReceipts reads it, with only the fields Impact reads. */
const receipt = (over: Record<string, unknown>): ReceiptEntry =>
  ({
    path: 'receipts/2026/10/x.md',
    summary: '',
    body: '',
    receipt: {
      id: `r${++n}`,
      profile: 'default',
      session: 'a1b2c3d4',
      project: 'lantern-cove',
      started: at(30),
      status: 'ok',
      outputs: {},
      ...over,
    },
  }) as unknown as ReceiptEntry;

const records = new Map<string, ImpactRecord>([
  [
    'a1b2c3d4',
    { id: 'a1b2c3d4', name: 'checkout-retry', project: 'lantern-cove', prompts: [at(2)] },
  ],
  ['e5f6a7b8', { id: 'e5f6a7b8', name: 'rate-limits', project: 'harbor', prompts: [] }],
]);

const report = (
  entries: LogEntry[],
  receipts: ReceiptEntry[] = [],
  hooks: Record<string, { at: string; state: string }[]> = {},
) =>
  impactReport({
    days: 7,
    since: at(-7 * 24 * 60),
    entries,
    receipts,
    records,
    hookStates: (id) => hooks[id] ?? [],
  });

test('a changed line is a Moment with its outcome; the rest fold into counts', () => {
  const r = report(
    [
      entry({
        answer: 'waiting-question',
        changed: true,
        probabilities: { 'waiting-question': 0.82 },
      }),
      entry({ at: at(10) }),
      entry({ at: at(11) }),
      entry({ at: at(12), status: 'abstained', answer: 'idle' }),
      entry({ at: at(13), status: 'unavailable', answer: 'idle' }),
      entry({ at: at(14), site: 'relevance', status: 'skipped', rules: null, answer: null }),
    ],
    [],
  );
  expect(r.summary).toEqual({
    caught: 1,
    corrected: 0,
    notesIn: 0,
    stopped: 0,
    kept: 0,
    sessions: 1,
  });
  expect(r.sentence).toBe(
    'In the last 7 days, Mesa caught 1 question the rules missed, across 1 session.',
  );
  const [session] = r.sessions;
  expect(session).toMatchObject({ id: 'a1b2c3d4', name: 'checkout-retry', model: 'clef' });
  expect(session?.moments).toEqual([
    {
      id: expect.any(String),
      at: AT,
      site: 'supervision',
      question: 'What state is this session in?',
      title: 'Saw it was waiting on your answer',
      by: 'clef',
      confidence: 0.82,
      rulesAlone: 'idle',
      outcome: { kind: 'answered', minutes: 2, text: 'You answered 2 min later' },
    },
  ]);
  expect(session?.folded).toEqual({ agreed: 2, unsure: 1, failed: 1, skipped: 1 });
  expect(session && foldedText(session)).toBe(
    '+ 2 checks where clef agreed with the rules, 1 unsure, 1 with no answer, 1 prompt with no matching note',
  );
});

test('a later hook agrees or disagrees with a placement; with none in 10 minutes there is no outcome', () => {
  const placed = (minutes: number) =>
    entry({ at: at(minutes), rules: 'working', answer: 'done', changed: true });
  const r = report([placed(0), placed(20), placed(40)], [], {
    a1b2c3d4: [
      { at: at(1), state: 'done' },
      { at: at(25), state: 'working' },
      { at: at(55), state: 'done' },
    ],
  });
  expect(r.summary.corrected).toBe(3);
  expect(r.sessions[0]?.moments.map((m) => m.outcome)).toEqual([
    { kind: 'hook-agreed', text: 'A hook agreed later' },
    { kind: 'hook-disagreed', text: 'A hook said working later' },
    null,
  ]);
});

test('notes brought in, guardrail stops and vault writes are Moments; sessions sort newest first', () => {
  const r = report(
    [
      entry({
        site: 'relevance',
        rules: null,
        answer: 'wiki/decisions/retry-policy.md',
        note: 'wiki/decisions/retry-policy.md',
        changed: true,
      }),
      entry({
        at: at(5),
        session: 'e5f6a7b8',
        project: 'harbor',
        site: 'guardrail',
        by: 'rules',
        rules: 'block',
        answer: 'block',
        status: 'blocked',
        reason: 'the text holds a destructive command (rm -rf)',
        changed: true,
      }),
      entry({
        at: at(6),
        session: null,
        project: 'harbor',
        site: 'guardrail',
        by: 'rules',
        rules: 'ask',
        answer: 'ask',
        status: 'overridden',
        override: 'yes',
        reason: 'project harbor has guardrail: strict',
        changed: true,
      }),
    ],
    [
      receipt({ kind: 'capture', outputs: { notes: ['wiki/notes/a.md', 'wiki/decisions/b.md'] } }),
      receipt({ kind: 'vault-change', started: at(31), outputs: { target: 'wiki/notes/c.md' } }),
      receipt({ kind: 'capture', status: 'failed', outputs: {} }),
      receipt({ kind: 'decision', outputs: {} }),
    ],
  );
  expect(r.summary).toMatchObject({ notesIn: 1, stopped: 1, kept: 3, sessions: 3 });
  expect(r.sentence).toBe(
    'In the last 7 days, Mesa brought 1 vault note into prompts, stopped 1 risky command and kept 3 notes, across 3 sessions.',
  );
  expect(r.sessions.map((s) => s.name)).toEqual([
    'checkout-retry',
    'Outside a session',
    'rate-limits',
  ]);
  expect(r.sessions[0]?.moments.map((m) => [m.site, m.title, m.notes])).toEqual([
    [
      'relevance',
      'Brought wiki/decisions/retry-policy.md into the prompt',
      ['wiki/decisions/retry-policy.md'],
    ],
    ['vault', 'Kept 2 notes when it ended', ['wiki/notes/a.md', 'wiki/decisions/b.md']],
    ['vault', 'Saved wiki/notes/c.md', ['wiki/notes/c.md']],
  ]);
  expect(r.sessions[1]?.moments[0]).toMatchObject({
    title: 'Asked first: project harbor has guardrail: strict',
    outcome: { kind: 'overridden', text: 'You went ahead (yes)' },
  });
  expect(r.sessions[2]?.moments[0]).toMatchObject({
    title: 'Stopped: the text holds a destructive command (rm -rf)',
    outcome: { kind: 'not-overridden', text: 'You did not override it' },
  });
});

test('nothing that changed anything gives the empty state, and a project names itself', () => {
  expect(report([entry({})]).sentence).toBe(EMPTY_IMPACT);
  const scoped = impactReport({
    days: 30,
    since: at(-30 * 24 * 60),
    project: 'lantern-cove',
    entries: [entry({ answer: 'waiting-permission', changed: true })],
    receipts: [],
    records,
    hookStates: () => [],
  });
  expect(scoped.sentence).toBe(
    'In the last 30 days in lantern-cove, Mesa caught 1 question the rules missed, across 1 session.',
  );
});
