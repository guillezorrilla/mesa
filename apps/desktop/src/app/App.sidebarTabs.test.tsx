// @vitest-environment happy-dom
import type { PrList, PrRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { HEALTHY } from '@/lib/testing/healthy';
import { App } from './App';

// An invented PR on an invented project, which asks for my review.
const PR: PrRow = {
  project: 'lantern-cove',
  provider: 'github',
  number: 12,
  title: 'Trim the harbour map tiles',
  url: 'https://example.test/lantern-cove/pull/12',
  branch: 'feat/tiles',
  author: 'Dana Ruiz',
  updatedAt: new Date().toISOString(),
  bucket: 'need',
  since: { lastWord: null, commits: 0, replies: 0, resolved: 0, threads: 0 },
};

function bridgeWith(tabs: { id: string; shown: boolean }[]) {
  const base = (HEALTHY.config as (args: string[]) => { data: object })([]).data;
  let sidebar = { tabs, tabStyle: 'compact' };
  return fakeBridge({
    config: () => envelope({ ...base, sidebar }),
    'config set': (args) => {
      sidebar = { ...sidebar, tabs: JSON.parse(String(args[5])) };
      return envelope({ path: args[4], value: sidebar.tabs });
    },
    prs: () => envelope({ prs: [PR], blocked: [], problems: [], quiet: [] } satisfies PrList),
  });
}

const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((each) => each.title === name);
const byLabel = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`) ?? undefined;
const reviewsListed = () => document.body.textContent?.includes('Trim the harbour map tiles');

test('hiding the open tab moves the sidebar to Sessions', async () => {
  const { bridge } = bridgeWith([
    { id: 'reviews', shown: true },
    { id: 'logs', shown: true },
  ]);
  await renderWithMesa(<App />, bridge);
  await click(tab('Reviews'));
  expect(tab('Reviews')?.getAttribute('aria-selected')).toBe('true');
  await click(byLabel('Tab bar menu'));
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('Customize tabs'),
    ),
  );
  await click(byLabel('Show Reviews'));
  expect(tab('Reviews')).toBeUndefined();
  expect(tab('Sessions')?.getAttribute('aria-selected')).toBe('true');
});

test('a hidden tab opens from Search, and its count reaches the Inbox, which opens it too', async () => {
  const { bridge } = bridgeWith([
    { id: 'reviews', shown: false },
    { id: 'logs', shown: true },
  ]);
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(tab('Reviews')).toBeUndefined();
  expect(reviewsListed()).toBe(false);
  await click(byTestId('search-trigger')[0]);
  await click(byTestId('palette-hit').find((hit) => hit.textContent?.startsWith('Reviews')));
  expect(reviewsListed()).toBe(true);
  // Still hidden: no tab came back, and Sessions brings its list back.
  expect(tab('Reviews')).toBeUndefined();
  await click(tab('Sessions'));
  expect(reviewsListed()).toBe(false);
  expect(byTestId('nav-inbox')[0]?.getAttribute('aria-label')).toContain('1 in Reviews');
  await click(byTestId('nav-inbox')[0]);
  const row = byTestId('inbox-tab-reviews')[0];
  expect(row?.textContent).toContain('Reviews');
  expect(row?.textContent).toContain('1');
  await click(row);
  expect(reviewsListed()).toBe(true);
});
