// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { choose, click, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import { type WorkerModel, WorkerDialog } from './WorkerDialog';

const render = (started: [string, WorkerModel][]) =>
  renderWithMesa(
    <WorkerDialog
      sessionId="lead0001"
      project="lantern-cove"
      disabled={false}
      onStart={(task, how) => started.push([task, how])}
      onCancel={() => {}}
    />,
    fakeBridge().bridge,
  );

test('New worker passes the chosen model and effort, and neither when left at Default', async () => {
  const started: [string, WorkerModel][] = [];
  const byTestId = await render(started);
  const options = (id: string) =>
    [...(byTestId(id)[0]?.querySelectorAll('option') ?? [])].map((o) => o.textContent);
  expect(options('worker-model')).toEqual(['Default', 'Sonnet', 'Haiku']);
  expect(options('worker-effort')).toEqual(['Default', 'Low', 'Medium', 'High']);

  await fill('worker-task', 'Rename tideTable');
  await click(byTestId('worker-submit')[0]);
  await choose(byTestId('worker-model')[0], 'sonnet');
  await choose(byTestId('worker-effort')[0], 'low');
  await click(byTestId('worker-submit')[0]);
  expect(started).toEqual([
    ['Rename tideTable', {}],
    ['Rename tideTable', { model: 'sonnet', effort: 'low' }],
  ]);
});
