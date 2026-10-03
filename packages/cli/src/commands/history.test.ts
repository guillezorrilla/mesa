import { codexWorld, plantTranscript } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('history --json exposes native identities and the unsupported provider', async () => {
  const dir = await cli.withProject();
  const codex = codexWorld();
  cli.env = codex.env;
  const claudeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const codexId = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  plantTranscript(cli.home, claudeId, dir);
  codex.rollout({ id: codexId, cwd: dir, startedAt: '2026-09-20T11:58:00.000Z' });
  codex.name(codexId, 'Lantern lights');
  const { json } = await cli.mesa('history', 'lantern-cove', '--json');
  expect(json).toMatchObject({
    ok: true,
    data: {
      total: 2,
      rows: expect.arrayContaining([
        expect.objectContaining({ agent: 'claude', id: claudeId, cwd: dir }),
        expect.objectContaining({ agent: 'codex', id: codexId, cwd: dir, name: 'Lantern lights' }),
      ]),
      unsupported: [{ agent: 'antigravity', reason: expect.any(String) }],
    },
  });
});

test('history search --json returns bounded native conversation text', async () => {
  const dir = await cli.withProject();
  const id = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  plantTranscript(
    cli.home,
    id,
    dir,
    JSON.stringify({
      type: 'user',
      cwd: dir,
      message: { role: 'user', content: 'Find harbor charts' },
    }),
  );
  const { json } = await cli.mesa('history', 'search', 'lantern-cove', 'harbor', '--json');
  expect(json).toMatchObject({
    ok: true,
    data: {
      hits: [expect.objectContaining({ id, role: 'user', excerpt: 'Find harbor charts' })],
      truncated: false,
    },
  });
});
