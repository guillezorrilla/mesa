import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('vault health prints the same advisory findings in JSON and text without recording history', async () => {
  await cli.mesa('init', '--vault', 'vault');
  await cli.mesa('vault', 'init');
  mkdirSync(join(cli.home, 'vault/wiki/notes'), { recursive: true });
  writeFileSync(join(cli.home, 'vault/wiki/notes/rule.md'), '# Rule\n[[missing]]\n');
  const before = (await cli.mesa('receipts', '--json')).json.data;
  const json = await cli.mesa('vault', 'health', '--json');
  expect(json.code).toBe(0);
  expect(json.json.data.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'broken-link',
        path: 'wiki/notes/rule.md',
        line: 2,
        target: 'missing',
      }),
      expect.objectContaining({ kind: 'missing-project', path: 'wiki/notes/rule.md' }),
    ]),
  );
  const text = await cli.mesa('vault', 'health');
  expect(text.code).toBe(0);
  expect(text.stdout).toContain('wiki/notes/rule.md:2 [broken-link]');
  expect(text.stdout).toContain('Findings are advisory; no files are changed.');
  expect((await cli.mesa('receipts', '--json')).json.data).toEqual(before);
});

test('vault health explains a missing vault and reports a laid-out empty vault as clean', async () => {
  await cli.mesa('init', '--vault', 'vault');
  const missing = await cli.mesa('vault', 'health', '--json');
  expect(missing.json).toMatchObject({ ok: false, error: { code: 'not_found' } });
  await cli.mesa('vault', 'init');
  expect((await cli.mesa('vault', 'health', '--json')).json.data).toMatchObject({
    checked: 1,
    findings: [],
  });
});
