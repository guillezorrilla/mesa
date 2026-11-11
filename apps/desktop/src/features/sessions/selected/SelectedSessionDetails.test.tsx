// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { SelectedSessionDetails } from './SelectedSessionDetails';

const details = (row: ReturnType<typeof managedRow>, depth: number) =>
  fakeBridge({
    show: () =>
      envelope({
        ...row,
        depth,
        instructions: { state: 'missing', reason: 'Run mesa hooks install' },
        vault: { state: 'missing', reason: 'Run mesa hooks install' },
      }),
  }).bridge;

test("a worker's details show its depth among workers; a session with no parent shows none", async () => {
  const worker = managedRow('aaaaaaaa', { parent: 'bbbbbbbb' });
  const byTestId = await renderWithMesa(
    <SelectedSessionDetails row={worker} />,
    details(worker, 2),
  );
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  expect(byTestId('session-worker-depth')[0]?.textContent).toBe('2');
  expect(document.body.textContent).toContain('Worker depth');
});

test('a session with no parent shows no worker depth', async () => {
  const top = managedRow('cccccccc');
  const byTestId = await renderWithMesa(<SelectedSessionDetails row={top} />, details(top, 0));
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  expect(byTestId('session-worker-depth')).toHaveLength(0);
});
