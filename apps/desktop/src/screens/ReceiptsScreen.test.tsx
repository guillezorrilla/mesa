// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { App } from '@/App';
import {
  cells,
  choose,
  click,
  deferred,
  envelope,
  fakeBridge,
  RECEIPTS,
  RUN_RECEIPT,
  receiptAnswers,
  renderWithMesa,
  SESSION_RECEIPT,
} from '@/lib/testing';

const openReceipts = async () => {
  const { bridge, calls } = fakeBridge(receiptAnswers());
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-receipts')[0]);
  return { byTestId, calls };
};

test('the Receipts screen lists the newest 50: started, type, project, status, decisions, summary', async () => {
  const { byTestId, calls } = await openReceipts();
  expect(calls).toContainEqual(['--json', 'receipts', '--limit', '50']);
  const rows = byTestId('receipt-row');
  expect(rows.map((r) => r.dataset.status)).toEqual(['ok', 'ok', 'failed']);
  expect(rows.map(cells)).toEqual([
    [
      '2026-09-25 12:05',
      'skill',
      'lantern-cove',
      'ok',
      '2',
      'Ran skill tidy-readme on lantern-cove as session eeeeeeee',
    ],
    [
      '2026-09-25 12:00',
      'session',
      'lantern-cove',
      'ok',
      '0',
      'Opened session bbbbbbbb on lantern-cove',
    ],
    ['2026-09-25 11:58', 'action', '', 'failed', '0', 'Could not register /src/tide'],
  ]);
  expect(byTestId('receipt-details')).toEqual([]);
});

test('a selected receipt shows its frontmatter and its decisions; a Noul has one probability and no confidence', async () => {
  const { byTestId, calls } = await openReceipts();
  await click(byTestId('receipt-open')[0]);
  expect(calls).toContainEqual(['--json', 'receipts', 'show', '--', RUN_RECEIPT.receipt.id]);
  expect(byTestId('receipt-row')[0]?.dataset.state).toBe('selected');
  const details = byTestId('receipt-details')[0];
  expect(details?.querySelector('h3')?.textContent).toBe(RUN_RECEIPT.summary);
  const fields = [...(byTestId('receipt-frontmatter')[0]?.querySelectorAll('dt') ?? [])].map(
    (dt) => [dt.textContent, dt.nextElementSibling?.textContent],
  );
  expect(fields.slice(0, 10)).toEqual([
    ['id', RUN_RECEIPT.receipt.id],
    ['profile', 'default'],
    ['project', 'lantern-cove'],
    ['session', 'eeeeeeee'],
    ['agent', 'claude'],
    ['started', '2026-09-25T12:05'],
    ['ended', '2026-09-25T12:06'],
    ['command', 'mesa run --project lantern-cove --yes -- tidy-readme "focus on tests"'],
    ['cost', '$0.0420'],
    ['inputs', JSON.stringify(RUN_RECEIPT.receipt.inputs, null, 2)],
  ]);
  expect(fields[10]).toEqual(['outputs', JSON.stringify(RUN_RECEIPT.receipt.outputs, null, 2)]);
  // The guardrail's two answers: its verdict, a Choice, and a Noul.
  const decisions = byTestId('decision-row');
  expect(decisions.map((d) => d.dataset.kind)).toEqual(['Choice', 'Noul']);
  expect(decisions.map(cells)).toEqual([
    ['verdictChoice', 'ask', 'ask 95%', '95%', 'rules'],
    ['secret-or-destructiveNoul', 'no', 'yes 5%', 'none', 'rules'],
  ]);

  // Another receipt, with no decision; Close puts the list back alone.
  await click(byTestId('receipt-open')[2]);
  expect(byTestId('receipt-details')[0]?.textContent).toContain('No Faro decision behind it.');
  expect(byTestId('receipt-decisions')).toEqual([]);
  const close = byTestId('receipt-details')[0]?.querySelector<HTMLElement>('[aria-label="Close"]');
  await click(close ?? undefined);
  expect(byTestId('receipt-details')).toEqual([]);
});

test('a late receipt detail reply cannot replace the newer selection', async () => {
  const first = deferred();
  const second = deferred();
  const { bridge } = fakeBridge({
    ...receiptAnswers(),
    'receipts show': (args) =>
      args.at(-1) === RUN_RECEIPT.receipt.id ? first.promise : second.promise,
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-receipts')[0]);
  await click(byTestId('receipt-open')[0]);
  await click(byTestId('receipt-open')[1]);
  await act(async () => second.resolve(envelope(SESSION_RECEIPT)));
  expect(byTestId('receipt-details')[0]?.querySelector('h3')?.textContent).toBe(
    SESSION_RECEIPT.summary,
  );
  await act(async () => first.resolve(envelope(RUN_RECEIPT)));
  expect(byTestId('receipt-details')[0]?.querySelector('h3')?.textContent).toBe(
    SESSION_RECEIPT.summary,
  );
});

test('a late filtered list cannot replace the newest filter result', async () => {
  const skill = deferred();
  const session = deferred();
  const { bridge } = fakeBridge({
    ...receiptAnswers(),
    receipts: (args) =>
      args.includes('skill')
        ? skill.promise
        : args.includes('session')
          ? session.promise
          : envelope(RECEIPTS),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-receipts')[0]);
  await choose(byTestId('receipts-type')[0], 'skill');
  expect(byTestId('receipt-row')).toEqual([]);
  await choose(byTestId('receipts-type')[0], 'session');
  await act(async () => session.resolve(envelope([SESSION_RECEIPT])));
  expect(byTestId('receipt-row').map((row) => cells(row)[1])).toEqual(['session']);
  await act(async () => skill.resolve(envelope([RUN_RECEIPT])));
  expect(byTestId('receipt-row').map((row) => cells(row)[1])).toEqual(['session']);
});

test('the list filters by type and by session, and says when nothing matches', async () => {
  const { byTestId, calls } = await openReceipts();
  const types = () => byTestId('receipt-row').map((r) => cells(r)[1]);
  const options = [...(byTestId('receipts-type')[0] as HTMLSelectElement).options];
  expect(options.map((o) => o.value)).toEqual(['', 'session', 'skill', 'decision', 'action']);

  await choose(byTestId('receipts-type')[0], 'session');
  expect(calls.at(-1)).toEqual(['--json', 'receipts', '--limit', '50', '--type', 'session']);
  expect(types()).toEqual(['session']);

  await choose(byTestId('receipts-type')[0], '');
  const session = byTestId('receipts-session')[0] as HTMLInputElement;
  session.value = ' eeeeeeee ';
  await act(async () => session.form?.requestSubmit());
  expect(calls.at(-1)).toEqual(['--json', 'receipts', '--limit', '50', '--session=eeeeeeee']);
  expect(types()).toEqual(['skill']);

  await choose(byTestId('receipts-type')[0], 'action');
  expect(calls.at(-1)).toEqual([
    '--json',
    'receipts',
    '--limit',
    '50',
    '--type',
    'action',
    '--session=eeeeeeee',
  ]);
  expect(byTestId('receipt-row')).toEqual([]);
  expect(byTestId('receipts-empty')[0]?.textContent).toBe('No receipt matches these filters.');

  await choose(byTestId('receipts-type')[0], '');
  await click(byTestId('receipts-session-clear')[0]);
  expect(calls.at(-1)).toEqual(['--json', 'receipts', '--limit', '50']);
  expect(byTestId('receipt-row')).toHaveLength(RECEIPTS.length);
});
