// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import {
  attached,
  click,
  envelope,
  fakeBridge,
  fakePlatform,
  fill,
  renderWithMesa,
} from '@/lib/testing';
import { HEALTHY } from '@/lib/testing/healthy';
import { CloudLogsSection } from './CloudLogsSection';

const config = () => {
  const base = (HEALTHY.config as (args: string[]) => { data: object })([]).data;
  return envelope({
    ...base,
    logs: {
      panel: true,
      cloudTab: true,
      views: [{ name: 'checkout', services: ['tide-tables-123/tide-api'] }],
      prodAsk: [],
      mask: true,
      fixProjects: {},
      askModel: 'claude-opus-5-5',
      recentProjects: [],
      starredProjects: [],
    },
  });
};

const item = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
    el.textContent?.includes(text),
  );

test("the Logs tab's menu exports the saved views to a folder picked and imports them from a file picked", async () => {
  const { bridge, calls } = fakeBridge({
    config: () => config(),
    'logs asks': () => envelope({ asks: [] }),
    'logs views': (args) =>
      args[3] === 'export'
        ? envelope({ file: args.at(-1), views: 1 })
        : envelope({ views: [{ name: 'prod 5xx', filter: 'httpRequest.status>=500' }] }),
  });
  await renderWithMesa(
    <CloudLogsSection view={{ kind: 'logs' }} onView={() => {}} />,
    bridge,
    fakePlatform({ folder: '/tmp/share', file: '/tmp/share/views.yaml' }),
  );
  await attached();
  const menu = () => document.querySelector<HTMLElement>('[aria-label="Logs menu"]') ?? undefined;
  await click(menu());
  await click(item('Export views'));
  await attached();
  expect(calls.find((argv) => argv[3] === 'export')).toEqual([
    '--json',
    'logs',
    'views',
    'export',
    '--',
    '/tmp/share/mesa-log-views.yaml',
  ]);
  await click(menu());
  await click(item('Import views'));
  await attached();
  expect(calls.find((argv) => argv[3] === 'import')).toEqual([
    '--json',
    'logs',
    'views',
    'import',
    '--',
    '/tmp/share/views.yaml',
  ]);
});

test('own views come first; metric views wait in a closed From metrics group; past ten views a filter shows, opening matches', async () => {
  const views = [
    { name: 'checkout', services: ['tide-tables-123/tide-api'] },
    ...Array.from({ length: 12 }, (_, i) => ({ name: `metric view ${i}`, metric: `metric-${i}` })),
  ];
  const base = (HEALTHY.config as (args: string[]) => { data: { logs: object } })([]).data;
  const { bridge } = fakeBridge({
    config: () => envelope({ ...base, logs: { ...base.logs, views } }),
    'logs asks': () => envelope({ asks: [] }),
  });
  await renderWithMesa(<CloudLogsSection view={{ kind: 'logs' }} onView={() => {}} />, bridge);
  await attached();
  const names = (label: string) =>
    [...document.querySelectorAll(`[aria-label="${label}"] li`)].map((li) => li.textContent);
  expect(names('Saved views')).toEqual(['checkout']);
  const group = [...document.querySelectorAll<HTMLElement>('button[aria-expanded]')].find((b) =>
    b.textContent?.includes('From metrics'),
  );
  expect(group?.textContent).toContain('12');
  expect(group?.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('[aria-label="Views from metrics"]')).toBeNull();
  await fill(document.querySelector<HTMLInputElement>('[aria-label="Filter views"]'), 'view 1');
  expect(names('Views from metrics')).toEqual([
    'metric view 1',
    'metric view 10',
    'metric view 11',
  ]);
});
