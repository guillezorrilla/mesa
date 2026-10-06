import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  multiProjectSession,
  newSession,
  projectProfile,
  scriptedRunner,
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
