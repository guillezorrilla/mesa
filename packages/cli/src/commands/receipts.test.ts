import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

type Listed = { receipt: { type: string; kind?: string; session?: string; command: string } }[];
const listed = async (...flags: string[]) =>
  ((await mesa('receipts', '--json', ...flags)).json.data as Listed).map((e) => e.receipt);

test('receipts lists meaningful decisions and filters out routine actions', async () => {
  await cli.withProject();
  const a = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  await mesa('rename', a, 'tidy');
  expect(await listed()).toEqual([]);
  await mesa('config', 'set', 'decisions.backend', 'rules');
  cli.stdin = JSON.stringify({ questions: [{ kind: 'Noul', id: 'ship', statement: 'Ready' }] });
  const decision = await mesa('decide', '--json');
  expect((await mesa('decide', '--project', 'lantern-cove', '--json')).code).toBe(2);
  const scoped = await mesa(
    'decide',
    '--project',
    'lantern-cove',
    '--session',
    a,
    '--rationale',
    'The release needs a reversible migration',
    '--json',
  );
  expect(scoped.json.data.receipt).not.toBeNull();
  expect((await listed('--type', 'decision', '--kind', 'decision')).map((r) => r.kind)).toEqual([
    'decision',
    'decision',
  ]);
  expect(await listed('--type', 'action')).toEqual([]);
  expect(await listed('--type', 'decision', '--limit', '1')).toHaveLength(1);
  expect(
    (await mesa('receipts', 'show', decision.json.data.receipt.id, '--json')).json.data.receipt
      .kind,
  ).toBe('decision');
  expect((await listed('--project', 'lantern-cove', '--session', a)).map((r) => r.kind)).toEqual([
    'decision',
  ]);
  const scopedReceipt = (await mesa('receipts', 'show', scoped.json.data.receipt.id, '--json')).json
    .data.receipt;
  expect(scopedReceipt).toMatchObject({
    project: 'lantern-cove',
    session: a,
    inputs: { rationale: 'The release needs a reversible migration' },
  });
  expect(await listed('--session', 'nope0000')).toEqual([]);
  expect(await mesa('receipts', '--type', 'job')).toMatchObject({
    code: 2,
    stderr: "a receipt's type is one of session, skill, decision, action, not job\n",
  });
});

test('historical receipts without a kind remain readable', async () => {
  await cli.withProject();
  cli.stdin = JSON.stringify({ questions: [{ kind: 'Noul', id: 'ship', statement: 'Ready' }] });
  const decision = await mesa('decide', '--json');
  const path = join(cli.home, 'vault', decision.json.data.receipt.path);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^kind: decision\n/m, ''));
  const shown = await mesa('receipts', 'show', decision.json.data.receipt.id, '--json');
  expect(shown.json.data.receipt.kind).toBeUndefined();
  expect((await listed('--type', 'decision')).map((receipt) => receipt.kind)).toEqual([undefined]);
  expect(await listed('--kind', 'decision')).toEqual([]);
});
