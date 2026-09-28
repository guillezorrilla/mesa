import { join } from 'node:path';
import { expect, test } from 'vitest';
import { codexWorld, plantTranscript, projectProfile, scriptedRunner } from '../testing/index.js';

test('native history lists project transcripts, ownership and unsupported providers without copying data', async () => {
  const codex = codexWorld();
  const { run } = scriptedRunner();
  const { mesa, home, dir } = projectProfile(run, { env: codex.env });
  const claudeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const codexId = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  plantTranscript(home, claudeId, dir);
  plantTranscript(home, '6c2f3a51-0d4e-4f8b-9a21-3b4c5d6e7f80', join(home, 'elsewhere'));
  codex.rollout({ id: codexId, cwd: dir, startedAt: '2026-09-20T11:58:00.000Z' });
  const { result } = await mesa.sessions.adopt(claudeId, { noResume: true });

  const history = mesa.sessions.history('lantern-cove');
  expect(history.rows.map((row) => [row.agent, row.id])).toEqual([
    ['claude', claudeId],
    ['codex', codexId],
  ]);
  expect(history.rows[0]).toMatchObject({ cwd: dir, importedAs: result.record.id });
  expect(history.rows[1]).not.toHaveProperty('importedAs');
  expect(history.unsupported).toEqual([
    { agent: 'antigravity', reason: 'No qualified native CLI history source' },
  ]);
});
