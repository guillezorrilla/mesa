import { expect, test } from 'vitest';
import { newSession } from '../testing/index.js';
import { GENERAL_PROJECT } from './general.js';
import { mesaPointer } from './instructions.js';
import type { SessionRecord } from './record.js';

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
      "Vault: mesa-vault's project_context, read_note, search_vault and session_goals on demand, when earlier decisions, notes or goals bear on the task. save_decision, save_summary, save_note keep meaningful knowledge, never routine events.",
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
