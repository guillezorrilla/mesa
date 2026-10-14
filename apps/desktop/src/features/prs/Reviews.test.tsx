// @vitest-environment happy-dom
import type { PrList, PrRow, PrSetupRow } from '@mesa/core';
import { useState } from 'react';
import { beforeEach, expect, test } from 'vitest';
import { click, envelope, fakeBridge, fakePlatform, renderWithMesa } from '@/lib/testing';
import { PrSetupScreen } from './PrSetupScreen';
import { ReviewsSection } from './ReviewsSection';
import { ReviewsTab } from './ReviewsTab';
import { usePrs } from './usePrs';

// Invented projects and people: storefront on GitHub, atlas-api on Bitbucket, pos-bridge without twg.

const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const pr = (
  project: string,
  number: number,
  bucket: PrRow['bucket'],
  over: Partial<PrRow> = {},
): PrRow => ({
  project,
  provider: project === 'atlas-api' ? 'bitbucket' : 'github',
  number,
  title: `Change ${number}`,
  url: `https://example.test/${project}/pull/${number}`,
  branch: `feat/${number}`,
  author: 'Dana Ruiz',
  updatedAt: ago(30),
  bucket,
  since: { lastWord: null, commits: 0, replies: 0, resolved: 0, threads: 0 },
  ...over,
});
const blocked: PrSetupRow = {
  project: 'pos-bridge',
  provider: 'bitbucket',
  cli: 'twg',
  state: 'missing',
  next: 'brew install atlassian/twg/twg',
};
const LIST: PrList = {
  // In core's order: most urgent first, then most recent.
  prs: [
    pr('storefront', 482, 'need'),
    pr('atlas-api', 91, 'need'),
    pr('storefront', 477, 'updated'),
    pr('atlas-api', 88, 'waiting'),
  ],
  blocked: [blocked],
  problems: [],
  quiet: ['kiosk'],
};
const texts = (els: HTMLElement[]) => els.map((el) => el.textContent?.trim());
const groupTitles = () =>
  [...document.querySelectorAll<HTMLElement>('[data-testid="pr-group"] > button')].map(
    (b) => b.querySelector('span')?.textContent,
  );
const radio = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
    (b) => b.textContent === name,
  );
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === label,
  );

beforeEach(() => localStorage.clear());

function Section(props: {
  onSetup?: (row: PrSetupRow) => void;
  onOpen?: (pr: PrRow) => void;
  current?: { project: string; number: number };
}) {
  const prs = usePrs();
  return (
    <ReviewsSection
      prs={prs}
      onSetup={props.onSetup ?? (() => undefined)}
      onOpen={props.onOpen ?? (() => undefined)}
      current={props.current}
    />
  );
}

test('the sidebar list groups by project, most urgent first, with a Set up row and the quiet projects', async () => {
  const setups: string[] = [];
  const opened: string[] = [];
  const { bridge, calls } = fakeBridge({ prs: () => envelope(LIST) });
  const byTestId = await renderWithMesa(
    <Section
      onSetup={(row) => setups.push(row.project)}
      onOpen={(row) => opened.push(`${row.project}#${row.number}`)}
      current={{ project: 'storefront', number: 477 }}
    />,
    bridge,
  );
  expect(groupTitles()).toEqual(['atlas-api', 'storefront', 'pos-bridge']);
  const rows = texts(byTestId('pr-row'));
  // Each project's PRs most urgent first; a tag only when a PR asks something of me.
  expect(rows[0]).toMatch(/^Change 91Review#91 · Dana Ruiz · 30m$/);
  expect(rows[1]).toMatch(/^Change 88#88/);
  expect(rows.slice(2).map((r) => r?.slice(0, 18))).toEqual([
    'Change 482Review#4',
    'Change 477Updated#',
  ]);
  // A row opens the PR's detail, and the one shown is marked.
  await click(byTestId('pr-row')[0]);
  expect(opened).toEqual(['atlas-api#91']);
  expect(byTestId('pr-row').map((row) => row.getAttribute('aria-current'))).toEqual([
    null,
    null,
    null,
    'page',
  ]);
  expect(document.body.textContent).toContain('No open PRs for you in kiosk');

  await click(byTestId('pr-setup-row')[0]);
  expect(setups).toEqual(['pos-bridge']);

  // Collapsing a project hides its rows.
  await click(
    document.querySelector<HTMLButtonElement>('[data-testid="pr-group"] > button') ?? undefined,
  );
  expect(byTestId('pr-row')).toHaveLength(2);

  await click(button('Refresh'));
  expect(calls.filter((c) => c[1] === 'prs')).toHaveLength(2);
});

test("By status groups the buckets, names each row's project, and is kept for the next visit", async () => {
  const { bridge } = fakeBridge({ prs: () => envelope(LIST) });
  const byTestId = await renderWithMesa(<Section />, bridge);
  await click(radio('By status'));
  expect(groupTitles()).toEqual([
    'Needs your review',
    'Updated since your review',
    'Waiting on the author',
    'pos-bridge',
  ]);
  expect(texts(byTestId('pr-row'))[0]).toContain('storefront · #482');

  await renderWithMesa(<Section />, bridge);
  expect(radio('By status')?.getAttribute('aria-checked')).toBe('true');
});

function ProjectReviews() {
  const [all, setAll] = useState(false);
  return (
    <ReviewsTab
      project="storefront"
      all={all}
      onAll={setAll}
      onSetup={() => undefined}
      onOpen={() => undefined}
    />
  );
}

test("a project's Reviews tab reads that project's PRs; All open PRs adds the ones not for me", async () => {
  const { bridge, calls } = fakeBridge({
    prs: (args: string[]) =>
      envelope({
        prs: args.includes('--all')
          ? [pr('storefront', 482, 'need'), pr('storefront', 466, 'other')]
          : [pr('storefront', 482, 'need'), pr('storefront', 470, 'waiting')],
        blocked: [],
        problems: [],
        quiet: [],
      } satisfies PrList),
  });
  const byTestId = await renderWithMesa(<ProjectReviews />, bridge);
  expect(calls.filter((c) => c[1] === 'prs')).toEqual([
    ['--json', 'prs', '--project', 'storefront'],
  ]);
  expect(groupTitles()).toEqual(['Needs your review', 'Waiting on the author']);
  expect(byTestId('reviews-tab')[0]?.textContent).toContain('All open PRs');

  await click(document.querySelector<HTMLButtonElement>('#reviews-all') ?? undefined);
  expect(calls.filter((c) => c[1] === 'prs').at(-1)).toEqual([
    '--json',
    'prs',
    '--project',
    'storefront',
    '--all',
  ]);
  expect(groupTitles()).toEqual(['Needs your review', 'Not for you']);
});

test('setup walks Install, Sign in, Connect Bitbucket and Check, resuming from what is done', async () => {
  let state: PrSetupRow['state'] = 'missing';
  const opened: string[] = [];
  const platform = fakePlatform();
  const { bridge, calls } = fakeBridge({
    'prs setup': () => envelope([{ ...blocked, state }]),
    'doctor install': () => {
      state = 'unauthenticated';
      return envelope({ name: 'twg', installed: true });
    },
    open: () => envelope({ id: 'termterm', receipt: null }),
    prs: () =>
      envelope({ prs: [pr('pos-bridge', 7, 'need')], blocked: [], problems: [], quiet: [] }),
  });
  const byTestId = await renderWithMesa(
    <PrSetupScreen project="pos-bridge" onSession={(id) => opened.push(id)} />,
    bridge,
    platform,
  );
  const states = () => byTestId('pr-setup-step').map((s) => s.dataset.state);
  expect(document.body.textContent).toContain('Connect Bitbucket');
  expect(states()).toEqual(['current', 'later', 'later', 'later']);

  await click(button('Install'));
  expect(calls.some((c) => c.join(' ') === '--json doctor install twg')).toBe(true);
  expect(states()).toEqual(['done', 'current', 'later', 'later']);

  await click(button('Open terminal'));
  expect(
    calls.some(
      (c) => c.includes('--terminal') && c.includes('--run=twg login') && c.at(-1) === 'pos-bridge',
    ),
  ).toBe(true);
  expect(platform.pasteboard).toEqual([]);
  expect(opened).toEqual(['termterm']);

  state = 'ready';
  await click(button('Check'));
  expect(states()).toEqual(['done', 'done', 'current', 'later']);

  await click(button('Open terminal'));
  expect(calls.some((c) => c.includes('--run=twg setup bitbucket'))).toBe(true);
  expect(states()).toEqual(['done', 'done', 'done', 'current']);
  expect(localStorage.length).toBe(0);

  const setupReads = calls.filter((c) => c[1] === 'prs' && c[2] === 'setup').length;
  await click(button('Check'));
  expect(states()).toEqual(['done', 'done', 'done', 'done']);
  // The proof is listing the project; setup is not read again for it.
  expect(calls.at(-1)).toEqual(['--json', 'prs', '--project', 'pos-bridge']);
  expect(calls.filter((c) => c[1] === 'prs' && c[2] === 'setup')).toHaveLength(setupReads);
  expect(document.body.textContent).toContain('Bitbucket is connected.');
});

test('without Homebrew, Install shows the official installer to copy', async () => {
  const { bridge } = fakeBridge({
    'prs setup': () => envelope([blocked]),
    'doctor install': () => ({
      ok: false,
      error: { code: 'not_found', message: 'Homebrew is not installed' },
    }),
  });
  await renderWithMesa(<PrSetupScreen project="pos-bridge" onSession={() => undefined} />, bridge);
  await click(button('Install'));
  expect(document.body.textContent).toContain(
    'bash <(curl -fsSL https://teamwork-graph.atlassian.com/cli/install)',
  );
});
