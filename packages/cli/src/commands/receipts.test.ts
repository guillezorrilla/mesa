import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

type Listed = { receipt: { type: string; session?: string; command: string } }[];
const listed = async (...flags: string[]) =>
  ((await mesa('receipts', '--json', ...flags)).json.data as Listed).map((e) => e.receipt);

test('receipts --session and --type list only those receipts, newest first, still limited', async () => {
  await cli.withProject();
  const a = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const b = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  await mesa('rename', a, 'tidy');

  expect((await listed('--session', a)).map((r) => [r.type, r.session, r.command])).toEqual([
    ['session', a, `mesa rename ${a} tidy`],
    ['session', a, 'mesa open lantern-cove --json'],
  ]);
  expect((await listed('--type', 'session')).map((r) => r.session)).toEqual([a, b, a]);
  expect((await listed('--type', 'session', '--session', b)).map((r) => r.session)).toEqual([b]);
  expect((await listed('--type', 'action')).map((r) => r.command)).toEqual([
    `mesa register --create ${cli.home}/src/lantern-cove`,
    'mesa vault init',
    'mesa init --vault vault',
  ]);
  expect(await listed('--type', 'action', '--limit', '1')).toHaveLength(1);
  expect(await listed('--session', 'nope0000')).toEqual([]);
  expect(await mesa('receipts', '--type', 'job')).toMatchObject({
    code: 2,
    stderr: "a receipt's type is one of session, skill, decision, action, not job\n",
  });
});
