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
      "Vault: call mesa-vault's project_context first; read_note, search_vault, session_goals on demand. save_decision, save_summary, save_note keep meaningful knowledge, never routine events.",
    );
    expect(pointer).toContain(`Without the tools: mesa vault context ${PROJECT} --json`);
    expect(pointer).not.toContain('unavailable until P5');
  },
);

test('a General pointer falls back to vault search, with no project to name', () => {
  const pointer = mesaPointer(record({ project: GENERAL_PROJECT }), PROFILE, '/Users/alexandra');
  expect(pointer).toContain('Without the tools: mesa vault search <text> --json');
  expect(pointer).not.toContain('mesa vault context');
});
