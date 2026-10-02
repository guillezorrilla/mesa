import { expect, test } from 'vitest';
import { VAULT_TOOLS, VAULT_WRITE_TOOLS } from './tools.js';

// A read-only Skill run blocks VAULT_WRITE_TOOLS: a new tool must be named here as a read, or be
// one of them, so a write tool is never left open by its name.
test('every vault tool is either a known read or a write a read-only run blocks', () => {
  const reads = VAULT_TOOLS.map((t) => t.name).filter((n) => !VAULT_WRITE_TOOLS.includes(n));
  expect(reads).toEqual(['project_context', 'read_note', 'search_vault', 'session_goals']);
  expect(VAULT_WRITE_TOOLS).toEqual(['save_decision', 'save_summary', 'save_note']);
});
