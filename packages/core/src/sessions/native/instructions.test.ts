import { expect, test } from 'vitest';
import { newSession } from '../../testing/index.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionRecord } from '../record/record.js';
import { DECISIONS_LINE, GUIDELINES_LINE, mesaPointer } from './instructions.js';

// The longest ids and paths a pointer realistically names: a long profile and project, and a
// worktree of a long branch under a long home.
const PROFILE = 'work-client-2026';
const PROJECT = 'lantern-cove-platform-api';
const CWD = `/Users/alexandra-montgomery/.mesa/${PROFILE}/worktrees/${PROJECT}/issue-1234-long-branch-name-for-feature`;
const record = (over: Partial<SessionRecord>): SessionRecord => ({
  ...newSession({ project: PROJECT }),
  id: 'abcdefgh',
  events: [],
  ...over,
});

test.each(['claude', 'codex', 'antigravity'] as const)(
  'the %s pointer stays under 1,000 UTF-8 bytes and says how to use the vault',
  (agent) => {
    const pointer = mesaPointer(record({ agent }), PROFILE, CWD);
    expect(Buffer.byteLength(pointer)).toBeLessThan(1000);
    expect(pointer).toContain(`Mesa session abcdefgh; profile ${PROFILE}; project ${PROJECT};`);
    expect(pointer).toContain(
      "Vault: mesa-vault's project_context, read_note, search_vault and session_goals on demand, when past work bears on the task. After a design decision: search_vault, then save_decision; save_summary, save_note only for lasting knowledge.",
    );
    expect(pointer).toContain(`Without the tools: mesa vault context ${PROJECT} --json`);
    expect(pointer).not.toContain('unavailable until P5');
    // The vault tools are on demand: no pointer promises a first step agents skip (#555).
    expect(pointer).not.toContain('first');
  },
);

test('a General pointer falls back to the General vault context, with no project to name', () => {
  const pointer = mesaPointer(record({ project: GENERAL_PROJECT }), PROFILE, '/Users/alexandra');
  expect(Buffer.byteLength(pointer)).toBeLessThan(1000);
  expect(pointer).toContain('Without the tools: mesa vault context --general --json');
  expect(pointer).not.toContain(`mesa vault context ${GENERAL_PROJECT}`);
});

test('a session across projects names them in one line, eliding past the 1,000-byte cap', () => {
  const name = (c: string) => `${c.repeat(52)}-project`;
  const additional = ['a', 'b', 'c'].map((c) => ({
    project: name(c),
    worktree: { path: `/w/${name(c)}`, branch: 'issue-1234-long-branch-name-for-feature' },
  }));
  expect(name('a')).toHaveLength(60);
  const worktree = { path: CWD, branch: 'issue-1234-long-branch-name-for-feature' };
  const two = mesaPointer(record({ worktree, additional: additional.slice(0, 2) }), PROFILE, CWD);
  expect(two.split('\n')[1]).toBe('Also in projects and 2 more.');
  expect(Buffer.byteLength(two)).toBeLessThan(1000);
  // As many as fit, then the rest counted; shorter names all fit.
  const short = mesaPointer(record({ worktree, additional }), PROFILE, '/src/lantern-cove');
  expect(short.split('\n')[1]).toBe(`Also in projects ${name('a')}, and 2 more.`);
  const named = ['tide-pool', 'harbor'].map((project) => ({ project, worktree }));
  const fits = mesaPointer(record({ worktree, additional: named }), PROFILE, '/src/lantern-cove');
  expect(fits.split('\n')[1]).toBe('Also in projects tide-pool, harbor.');
  for (const agent of ['claude', 'codex', 'antigravity'] as const) {
    const pointer = mesaPointer(record({ agent, worktree, additional }), PROFILE, CWD);
    expect(Buffer.byteLength(pointer)).toBeLessThan(1000);
    expect(pointer).toMatch(/^Also in projects (.+, )?and \d more\.$/m);
    expect(pointer).toContain('session_goals on demand');
    expect(pointer).not.toContain('first');
  }
  expect(mesaPointer(record({}), PROFILE, CWD)).not.toContain('Also in');
});

test.each(['claude', 'codex', 'antigravity'] as const)(
  'with sessions.guidelines on, the %s pointer names the agent-guidelines skill, before decisions',
  (agent) => {
    const plain = mesaPointer(record({ agent }), PROFILE, CWD);
    expect(plain).not.toContain('Guidelines:');
    expect(mesaPointer(record({ agent }), PROFILE, CWD, { guidelines: true })).toBe(
      `${plain}\n${GUIDELINES_LINE}`,
    );
    expect(GUIDELINES_LINE).toContain('read the agent-guidelines skill');
    expect(
      mesaPointer(record({ agent }), PROFILE, CWD, { guidelines: true, decisions: true }),
    ).toBe(`${plain}\n${GUIDELINES_LINE}\n${DECISIONS_LINE}`);
  },
);

test.each(['claude', 'codex', 'antigravity'] as const)(
  'with the decision tool, the %s pointer ends with one capability line of under 400 bytes',
  (agent) => {
    const plain = mesaPointer(record({ agent }), PROFILE, CWD);
    const pointer = mesaPointer(record({ agent }), PROFILE, CWD, { decisions: true });
    expect(pointer).toBe(`${plain}\n${DECISIONS_LINE}`);
    expect(Buffer.byteLength(DECISIONS_LINE)).toBeLessThan(400);
    expect(DECISIONS_LINE).toContain('decision_evaluate');
    expect(DECISIONS_LINE).toContain('advice only');
    // It names when to ask (#692): next-step before a recommendation, with its probabilities and
    // preference questions left to the person; evidence before a task is called done.
    expect(DECISIONS_LINE).toContain(
      'Before presenting options with a recommendation, ask next-step and show its probabilities beside it',
    );
    expect(DECISIONS_LINE).toContain("preference questions are the person's");
    expect(DECISIONS_LINE).toContain('Before claiming a task done, ask evidence.');
    expect(plain).not.toContain('Decisions:');
    // Across projects, the projects line keeps the pointer itself under its cap.
    const name = (c: string) => `${c.repeat(52)}-project`;
    const worktree = { path: CWD, branch: 'issue-1234-long-branch-name-for-feature' };
    const additional = ['a', 'b'].map((c) => ({ project: name(c), worktree }));
    const across = mesaPointer(record({ agent, worktree, additional }), PROFILE, CWD, {
      decisions: true,
    });
    expect(Buffer.byteLength(across)).toBeLessThan(1000 + 1 + Buffer.byteLength(DECISIONS_LINE));
  },
);
