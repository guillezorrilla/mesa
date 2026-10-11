import { TEST_CHANGELOG } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(() => {
  cli.reset();
  cli.deps = { version: '0.1.9', changelog: () => TEST_CHANGELOG };
});

test("whats-new prints the running version's notes, or a named one's, in --json and as text", async () => {
  expect((await cli.mesa('whats-new', '--json')).json.data).toEqual({
    version: '0.1.9',
    date: '2026-10-05',
    added: ['Tide charts in 0.1.9.'],
    changed: [],
    fixed: ['Kelp sync in 0.1.9.', 'Reef scroll in 0.1.9.'],
  });
  expect((await cli.mesa('whats-new', '0.1.1', '--json')).json.data).toMatchObject({
    version: '0.1.1',
    added: ['Lantern board'],
  });
  expect((await cli.mesa('whats-new', '0.1.4')).stdout).toBe(
    [
      "What's new in 0.1.4 (2026-10-05)",
      '',
      'New',
      '- Tide charts in 0.1.4.',
      '',
      'Fixed',
      '- Kelp sync in 0.1.4.',
      '- Reef scroll in 0.1.4.',
      '',
    ].join('\n'),
  );
});

test('an unknown version exits non-zero naming it', async () => {
  const out = await cli.mesa('whats-new', '0.0.9');
  expect(out.code).not.toBe(0);
  expect(out.stderr).toContain('no release notes for 0.0.9');
});
