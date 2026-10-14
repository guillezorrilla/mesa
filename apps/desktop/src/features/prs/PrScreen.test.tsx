// @vitest-environment happy-dom
import type { PrDetail, PrList } from '@mesa/core';
import { beforeEach, expect, test } from 'vitest';
import { App } from '@/app/App';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { PrScreen } from './PrScreen';

// Invented PRs and people: Lee's storefront PR on GitHub, Kofi's atlas-api PR on Bitbucket.

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const detail = (over: Partial<PrDetail> = {}): PrDetail => ({
  project: 'storefront',
  provider: 'github',
  number: 477,
  title: 'Cache menu images at the edge',
  url: 'https://example.test/storefront/pull/477',
  branch: 'feat/edge-image-cache',
  base: 'main',
  updatedAt: hoursAgo(3),
  author: 'lee-park',
  bucket: 'updated',
  since: { lastWord: hoursAgo(5), commits: 3, replies: 2, resolved: 1, threads: 2 },
  additions: 233,
  deletions: 61,
  checks: 'passing',
  threads: [
    {
      id: 'T1',
      author: 'ana-r',
      path: 'src/edge/cache.ts',
      line: 42,
      body: 'Cache key ignores the image width',
      resolved: true,
      lastReply: { author: 'lee-park', body: 'Width is part of the key now.' },
    },
    {
      id: 'T2',
      author: 'ana-r',
      path: 'test/edge/cache.test.ts',
      line: null,
      body: 'Missing test for the 304 path',
      resolved: false,
    },
  ],
  drafts: [],
  files: [
    { path: 'src/edge/cache.ts', additions: 141, deletions: 38 },
    { path: 'test/edge/cache.test.ts', additions: 83, deletions: 19 },
  ],
  ...over,
});
const DRAFTS: PrDetail['drafts'] = [
  { id: 'D1', path: 'src/edge/cache.ts', line: 91, body: 'Key on the item id instead?' },
  { id: 'D2', path: null, line: null, body: 'Two correctness issues; the rest are nits.' },
];

const status = () => document.querySelector('[data-testid="pr-status"]')?.textContent ?? '';
const tab = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) =>
    t.textContent?.startsWith(name),
  );
const selectedTab = () =>
  document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? '';
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === label,
  );

beforeEach(() => localStorage.clear());

async function show(pr: PrDetail) {
  const { bridge, calls } = fakeBridge({ 'prs show': () => envelope(pr) });
  await renderWithMesa(<PrScreen project={pr.project} number={pr.number} />, bridge);
  return calls;
}

test('the status says, per state, where the PR stands in one sentence', async () => {
  await show(detail());
  expect(status()).toContain(
    'lee-park pushed 3 commits and replied 2 times since your review 5h ago.',
  );
  expect(status()).toContain('1 of your 2 threads resolved');

  await show(
    detail({
      bucket: 'need',
      since: { lastWord: null, commits: 1, replies: 0, resolved: 0, threads: 0 },
    }),
  );
  expect(status()).toContain('lee-park asked for your review.');
  expect(status()).toContain('Updated 3h ago.');

  await show(detail({ bucket: 'waiting' }));
  expect(status()).toContain('Nothing new since your review 5h ago.');
  expect(status()).toContain('It moves to Updated as soon as lee-park pushes or replies.');
});

test('pending drafts come first, with the submit link on their provider', async () => {
  await show(detail({ drafts: DRAFTS }));
  expect(status()).toContain('2 draft comments are waiting on GitHub. Only you can see them.');
  expect(status()).toContain('Nothing is posted until you submit.');
  const submit = [...document.querySelectorAll<HTMLAnchorElement>('[data-testid="pr-status"] a')];
  expect(submit.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
    ['Submit on GitHub', 'https://example.test/storefront/pull/477'],
  ]);

  await show(detail({ provider: 'bitbucket', drafts: DRAFTS.slice(0, 1) }));
  expect(status()).toContain('1 draft comment is waiting on Bitbucket.');
  expect(status()).toContain('Finish review in Bitbucket');
});

test('the tabs open on drafts, else my comments, else files, and switch on click', async () => {
  await show(detail({ drafts: DRAFTS }));
  expect(selectedTab()).toBe('Drafts2');
  expect(document.querySelector('[data-testid="pr-tab-drafts"]')?.textContent).toContain(
    'Review summary',
  );

  await show(detail());
  expect(selectedTab()).toBe('Your comments2');
  const comments = document.querySelector('[data-testid="pr-tab-comments"]')?.textContent ?? '';
  expect(comments).toContain('src/edge/cache.ts:42');
  expect(comments).toContain('lee-park: Width is part of the key now.');
  expect(comments).toContain('Resolved');
  expect(comments).toContain('Open');

  await click(tab('Files'));
  expect(selectedTab()).toBe('Files2');
  expect(document.querySelector('[data-testid="pr-tab-files"]')?.textContent).toContain(
    'test/edge/cache.test.ts+83 -19',
  );

  await show(detail({ threads: [] }));
  expect(selectedTab()).toBe('Files2');
});

test('Discard deletes the draft by its id and reads the PR again', async () => {
  let drafts = DRAFTS;
  const { bridge, calls } = fakeBridge({
    'prs show': () => envelope(detail({ drafts })),
    'prs discard': (args) => {
      drafts = drafts.filter((d) => d.id !== args.at(-1));
      return envelope({ id: args.at(-1), receipt: null });
    },
  });
  await renderWithMesa(<PrScreen project="storefront" number={477} />, bridge);
  await click(button('Discard'));
  expect(calls.find((c) => c[2] === 'discard')?.slice(-3)).toEqual(['storefront', '477', 'D1']);
  expect(calls.filter((c) => c[2] === 'show')).toHaveLength(2);
  expect(selectedTab()).toBe('Drafts1');
});

test('a PR row in the sidebar opens its detail', async () => {
  const list: PrList = {
    prs: [
      {
        project: 'storefront',
        provider: 'github',
        number: 477,
        title: 'Cache menu images at the edge',
        url: 'https://example.test/storefront/pull/477',
        branch: 'feat/edge-image-cache',
        author: 'lee-park',
        updatedAt: '2026-10-13T11:40:00Z',
        bucket: 'updated',
        since: { lastWord: hoursAgo(5), commits: 3, replies: 2, resolved: 1, threads: 2 },
      },
    ],
    blocked: [],
    problems: [],
    quiet: [],
  };
  const { bridge } = fakeBridge({
    prs: () => envelope(list),
    'prs show': () => envelope(detail()),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) =>
      t.textContent?.startsWith('Reviews'),
    ),
  );
  await click(byTestId('pr-row')[0]);
  expect(byTestId('pr-screen')).toHaveLength(1);
  expect(document.body.textContent).toContain('feat/edge-image-cache -> main');

  // Picking Files, leaving for Sessions and coming back: the same PR, on Files.
  await click(tab('Files'));
  const sidebarTab = (label: string) =>
    click(
      [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) =>
        t.textContent?.startsWith(label),
      ),
    );
  await sidebarTab('Sessions');
  expect(byTestId('pr-screen')).toHaveLength(0);
  await sidebarTab('Reviews');
  expect(byTestId('pr-screen')).toHaveLength(1);
  expect(
    document.querySelector('[aria-label="Pull request detail"] [aria-selected="true"]')
      ?.textContent,
  ).toMatch(/^Files/);
});
