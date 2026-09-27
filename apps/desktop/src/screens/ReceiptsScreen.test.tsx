// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { App } from '@/App';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';

test('the Receipts screen lists the newest receipts with their summary', async () => {
  const receipt = (id: string, type: string, status: string) => ({
    path: `receipts/2026/09/20260924T120000Z-${type}-${id}.md`,
    receipt: {
      type,
      id,
      profile: 'default',
      started: '2026-09-24T12:00:00.000Z',
      status,
      command: 'mesa x',
      decisions: [],
      inputs: {},
      outputs: {},
    },
    summary: `${type} ${status}`,
    body: `${type} ${status}\n\n## Details\n\nNone.\n`,
  });
  const { bridge } = fakeBridge({
    receipts: () =>
      envelope([receipt('01B', 'action', 'ok'), receipt('01A', 'decision', 'blocked')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-receipts')[0]);
  const rows = byTestId('receipt-row');
  expect(rows.map((r) => r.dataset.status)).toEqual(['ok', 'blocked']);
  expect(rows[1]?.textContent).toContain('decision blocked');
});
