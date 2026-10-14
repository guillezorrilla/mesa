import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { decisionLog } from '../../decisions/log.js';
import {
  multiProjectSession,
  newSession,
  profilePaths,
  projectProfile,
  scriptedRunner,
  sequentialIds,
  testStore,
} from '../../testing/index.js';
import { callVaultTool, VAULT_TOOLS, VAULT_WRITE_TOOLS } from './tools.js';

// A read-only Skill run blocks VAULT_WRITE_TOOLS: a new tool must be named here as a read, or be
// one of them, so a write tool is never left open by its name.
test('every vault tool is either a known read or a write a read-only run blocks', () => {
  const reads = VAULT_TOOLS.map((t) => t.name).filter((n) => !VAULT_WRITE_TOOLS.includes(n));
  expect(reads).toEqual(['project_context', 'read_note', 'search_vault', 'session_goals']);
  expect(VAULT_WRITE_TOOLS).toEqual(['save_decision', 'save_summary', 'save_note']);
});

test("a session's additional project: save_note saves in its folder, and its sessions' goals list the session", async () => {
  const { home, mesa } = projectProfile(scriptedRunner().run);
  mkdirSync(join(home, 'src/tide-pool'));
  mesa.projects.register(join(home, 'src/tide-pool'), true);
  const store = testStore(home);
  const across = store.create(() => multiProjectSession({ goal: 'Wire both' }));
  const path = 'projects/tide-pool/notes/client.md';
  const saved = await callVaultTool(mesa.vault, across, 'save_note', {
    title: 'Client',
    body: 'Invented.',
    path,
  });
  expect(saved?.isError, saved?.content[0]?.text).toBe(false);
  expect(readFileSync(join(home, 'vault', path), 'utf8')).toContain('project: tide-pool');
  const onTide = store.create(() => newSession({ project: 'tide-pool' }));
  const goals = await callVaultTool(mesa.vault, onTide, 'session_goals', {});
  expect(JSON.parse(goals?.content[0]?.text ?? '[]')).toMatchObject([
    { id: across.id, goal: 'Wire both' },
  ]);
});

test('read_note logs an opened note once, only for a note advised to the bound session', async () => {
  // One clock for Mesa and the log, moved by hand: advice, reads, advice again, reads.
  let now = new Date('2026-10-13T11:00:00.000Z');
  const clock = () => now;
  const { home, mesa } = projectProfile(scriptedRunner().run, { clock });
  const store = testStore(home);
  const advised = store.create(() => newSession());
  const other = store.create(() => newSession());
  for (const path of ['wiki/notes/retry.md', 'wiki/notes/other.md']) {
    mkdirSync(join(home, 'vault/wiki/notes'), { recursive: true });
    writeFileSync(join(home, 'vault', path), '---\nproject: lantern-cove\n---\n# Note\n');
  }
  const log = decisionLog({
    dir: profilePaths(home, 'default').decisionLog,
    clock,
    newId: sequentialIds(),
  });
  const advice = {
    site: 'relevance',
    session: advised.id,
    project: 'lantern-cove',
    question: 'Which vault note helps this prompt?',
    rules: null,
    answer: 'wiki/notes/retry.md',
    by: 'clef',
    status: 'accepted',
    changed: true,
    note: 'wiki/notes/retry.md',
  } as const;
  log.append(advice);
  now = new Date('2026-10-13T12:00:00.000Z');
  const read = (session: typeof advised, path: string) =>
    callVaultTool(mesa.vault, session, 'read_note', { path });
  await read(advised, 'wiki/notes/retry.md');
  await read(advised, 'wiki/notes/retry.md');
  await read(advised, 'wiki/notes/other.md');
  await read(other, 'wiki/notes/retry.md');
  const opened = (id: string) =>
    mesa.decisions.log({ session: id }).filter((e) => e.status === 'opened');
  expect(opened(advised.id)).toEqual([
    expect.objectContaining({
      site: 'relevance',
      note: 'wiki/notes/retry.md',
      by: 'clef',
      changed: false,
    }),
  ]);
  expect(opened(other.id)).toEqual([]);
  // Advised again after it was opened: the next read is that advice's opened line.
  now = new Date('2026-10-13T13:00:00.000Z');
  log.append(advice);
  now = new Date('2026-10-13T14:00:00.000Z');
  await read(advised, 'wiki/notes/retry.md');
  await read(advised, 'wiki/notes/retry.md');
  expect(opened(advised.id)).toHaveLength(2);
});
