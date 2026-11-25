// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { attached, click, deferred, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { CloudErrorsView } from './CloudErrorsView';

const q = (selector: string) => document.querySelector<HTMLElement>(selector) ?? undefined;
const GROUP = {
  project: 'tide-tables-123',
  id: 'json:action=findCustomerByCustomerId',
  message: 'findCustomerByCustomerId: Customer not found',
  sample: JSON.stringify({
    action: 'findCustomerByCustomerId',
    customerId: 'cus_1000AbCdEf',
    message: 'Customer not found',
  }),
  count: 494,
  firstSeen: new Date(Date.now() - 600_000).toISOString(),
  lastSeen: new Date().toISOString(),
  services: ['tide-api'],
  badge: null,
  source: 'logs',
};

test('the first read shows skeleton rows and a status line naming what it reads; Cancel stops waiting; a JSON error shows its fields and its occurrences are read by its own terms', async () => {
  const pending = deferred();
  let first = true;
  const { bridge, calls } = fakeBridge({
    'logs errors': () => {
      if (!first) return envelope({ env: 'beta', warnings: [], groups: [GROUP], incidents: [] });
      first = false;
      return pending.promise;
    },
    'logs gcp': () =>
      envelope({ projects: [], env: 'beta', envs: [], filters: {}, warnings: [], entries: [] }),
  });
  await renderWithMesa(
    <CloudErrorsView
      filters={{ env: 'beta' }}
      reading="tide-tables-123 beta"
      onAsk={() => {}}
      onExplore={() => {}}
      onSession={() => {}}
    />,
    bridge,
  );
  await attached();
  expect(q('[aria-label="Loading error groups"]')).toBeDefined();
  expect(q('[role="status"]')?.textContent).toContain(
    'Reading and grouping tide-tables-123 beta errors',
  );
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((b) =>
      b.textContent?.includes('Cancel'),
    ),
  );
  expect(document.body.textContent).not.toContain('Reading and grouping');
  await click(q('[aria-label="Refresh"]'));
  await attached();
  const detail = q('[aria-label="Error detail"]');
  expect(detail?.querySelector('h2')?.textContent).toBe(
    'findCustomerByCustomerId: Customer not found',
  );
  expect(q('[aria-label="Payload"]')?.textContent).toContain('cus_1000AbCdEf');
  const read = calls.filter((argv) => argv[2] === 'gcp').at(-1) ?? [];
  expect(read).toEqual(
    expect.arrayContaining([
      '--project=tide-tables-123',
      expect.stringContaining('"findCustomerByCustomerId"'),
    ]),
  );
});
