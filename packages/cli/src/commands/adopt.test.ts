import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { codexWorld, plantTranscript } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('adopt records a session found on disk and says to end it in its original terminal', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const dir = join(cli.home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  await mesa('register', dir, '--create');
  const [first, second] = [
    '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f',
    '6c2f3a51-0d4e-4f8b-9a21-3b4c5d6e7f80',
  ];
  for (const id of [first, second]) plantTranscript(cli.home, id, dir);
  const warning = 'end the session in its original terminal first: both hold the same transcript';
  const { json } = await mesa('adopt', first, '--no-resume', '--json');
  expect(json).toMatchObject({
    ok: true,
    data: {
      id: expect.stringMatching(/^[0-9a-z]{8}$/),
      agentSessionId: first,
      adopted: true,
      project: 'lantern-cove',
      receipt: null,
      warning,
    },
  });
  const { stdout } = await mesa('adopt', second, '--no-resume');
  expect(stdout).toMatch(
    new RegExp(`^[0-9a-z]{8}: adopted on lantern-cove, recorded\nwarning: ${warning}\n$`),
  );
  expect((await mesa('adopt', first)).stderr).toBe(
    `Mesa has ${first} already, as session ${json.data.id}\n`,
  );
});

test('adopt --json imports an older Codex rollout without copying its native transcript', async () => {
  const dir = await cli.withProject();
  const codex = codexWorld();
  cli.env = codex.env;
  const id = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  codex.rollout({ id, cwd: dir, startedAt: '2026-09-20T11:58:00.000Z' });
  const { json } = await mesa('adopt', id, '--no-resume', '--json');
  expect(json).toMatchObject({
    ok: true,
    data: { agent: 'codex', agentSessionId: id, project: 'lantern-cove', adopted: true },
  });
});
