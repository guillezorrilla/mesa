import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { listReceipts } from '../receipts/store.js';
import { isolateGit, testStore, twoProjects } from '../testing/index.js';

isolateGit({ beforeAll, afterAll });

const WIDENED = 'read-only to workspace-write';

test("every start of a read-only profile's Codex session across projects keeps its sandbox override", async () => {
  const { world, home, mesa } = twoProjects();
  mesa.config.set('agents.codex.sandbox', 'read-only');
  const exitAll = () => {
    for (const w of world.tmux.windows) w.dead = true;
  };
  const kept = () => listReceipts(join(home, 'vault'), 50).map((r) => r.receipt);
  /** The sandbox override the receipt of a recorded start keeps. */
  const override = (recorded: { receipt: { id: string } | null }) =>
    kept().find((r) => r.id === recorded.receipt?.id)?.outputs?.sandboxOverride;

  // Swap: a fresh Claude Code session across projects, swapped to Codex.
  const { result: fresh } = await mesa.sessions.open('lantern-cove', { with: ['tide-pool'] });
  const swapped = await mesa.sessions.swap(fresh.id, 'codex');
  expect(override(swapped)).toBe(WIDENED);

  const opened = await mesa.sessions.open('lantern-cove', {
    agent: 'codex',
    with: ['tide-pool'],
    goal: 'Tie them',
  });
  expect(override(opened)).toBe(WIDENED);
  const first = opened.result;
  // The thread id Codex picks, as a look at the board would read it.
  testStore(home).update(first.id, { agentSessionId: '01a0e14e-be41-72f1-a81b-e25d2198602a' });
  exitAll();
  const resumed = await mesa.sessions.resume(first.id);
  expect(override(resumed)).toBe(WIDENED);

  const forked = await mesa.sessions.fork(resumed.result.record.id, { branch: 'try' });
  expect(override(forked)).toBe(WIDENED);

  const note = join(home, 'note.md');
  writeFileSync(note, '## Left\n');
  const handed = await mesa.sessions.handoff(resumed.result.record.id, { note });
  expect(override(handed)).toBe(WIDENED);

  // A dependency change that starts a queued session at once.
  const queued = await mesa.sessions.open('lantern-cove', {
    agent: 'codex',
    with: ['tide-pool'],
    branch: 'later',
    after: handed.result.to.id,
  });
  // Queued, it has not started, so its open keeps no receipt; its start does.
  expect(queued.receipt).toBeNull();
  await mesa.sessions.stop(forked.result.id, true);
  const started = await mesa.sessions.dependencies(queued.result.id, { after: forked.result.id });
  expect(override(started)).toBe(WIDENED);
});
