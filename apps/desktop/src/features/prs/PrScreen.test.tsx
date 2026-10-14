// @vitest-environment happy-dom
import type { PrDetail, PrList, TreeRow } from '@mesa/core';
import { beforeEach, expect, test } from 'vitest';
import { App } from '@/app/App';
import { click, envelope, failure, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { NavigateContext } from '@/lib/useNavigate';
import type { WorkspaceView } from '@/lib/workspaceView';
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

/** The PR screen with the board's sessions and the project's agent; the views it opened. */
async function startable(
  pr: PrDetail,
  opts: { sessions?: TreeRow[]; agent?: string | null; start?: () => unknown } = {},
) {
  const views: WorkspaceView[] = [];
  const { bridge, calls } = fakeBridge({
    'prs show': () => envelope(pr),
    'prs start':
      opts.start ??
      (() =>
        envelope({
          session: 'rev00001',
          round: 1,
          mode: 'drafts',
          worktree: '/wt/review/477',
          head: 'abc1234',
          existing: false,
        })),
  });
  const byTestId = await renderWithMesa(
    <NavigateContext.Provider value={(view) => views.push(view)}>
      <PrScreen
        project={pr.project}
        number={pr.number}
        sessions={opts.sessions ?? []}
        agent={'agent' in opts ? opts.agent : 'claude'}
      />
    </NavigateContext.Provider>,
    bridge,
  );
  const started = () =>
    calls.filter((c) => c[1] === 'prs' && c[2] === 'start').map((c) => c.slice(1).join(' '));
  const shows = () => calls.filter((c) => c[1] === 'prs' && c[2] === 'show').length;
  return { byTestId, views, started, shows };
}

test('Start review leaves drafts by default, then opens the new session on its own, once', async () => {
  const { byTestId, views, started, shows } = await startable(detail({ bucket: 'need' }));
  expect(byTestId('start-review')[0]?.textContent).toBe('Start review');
  await click(byTestId('start-review')[0]);
  expect(started()).toEqual(['prs start -- storefront 477']);
  expect(byTestId('start-progress')[0]?.textContent).toContain(
    'Read the PR and check out its head',
  );
  // The start reads the PR itself: the screen's own read is the only prs show.
  expect(shows()).toBe(1);
  expect(views).toEqual([{ kind: 'session', id: 'rev00001' }]);
});

test('Post now is picked for one start in the menu, and passes --post', async () => {
  const { byTestId, started } = await startable(detail());
  expect(byTestId('start-review')[0]?.textContent).toBe('Re-review');
  await click(byTestId('review-mode')[0]);
  await click(byTestId('review-mode-post')[0]);
  expect(byTestId('start-review')[0]?.textContent).toBe('Re-review and post');
  await click(byTestId('start-review')[0]);
  expect(started()).toEqual(['prs start --post -- storefront 477']);
});

test('Post now is off, with why, when the project reviews with Codex', async () => {
  const { byTestId } = await startable(detail(), { agent: 'codex' });
  await click(byTestId('review-mode')[0]);
  expect(byTestId('review-mode-post')[0]?.hasAttribute('data-disabled')).toBe(true);
  expect(document.body.textContent).toContain(
    'Post now needs Claude; storefront reviews with codex.',
  );
});

test('a live review session of the PR turns Start into Open review, and shows its round', async () => {
  const live = managedRow('rev00009', {
    project: 'storefront',
    review: { pr: 477, round: 2, mode: 'drafts', head: 'abc1234' },
  });
  const { byTestId, views, started } = await startable(detail(), { sessions: [live] });
  expect(byTestId('start-review')).toHaveLength(0);
  expect(byTestId('review-label')[0]?.textContent).toBe('Review #477 · round 2 · drafts · running');
  await click(byTestId('open-review')[0]);
  expect(views).toEqual([{ kind: 'session', id: 'rev00009' }]);
  expect(started()).toEqual([]);
});

test('a review already running elsewhere is opened, not started again; a failed start stays, with Back', async () => {
  const running = await startable(detail({ bucket: 'need' }), {
    start: () => envelope({ session: 'rev00007', existing: true }),
  });
  await click(running.byTestId('start-review')[0]);
  expect(running.views).toEqual([{ kind: 'session', id: 'rev00007' }]);

  document.body.innerHTML = '';
  const failed = await startable(detail({ bucket: 'need' }), {
    start: () => failure('cannot fetch pull request #477', 'internal'),
  });
  await click(failed.byTestId('start-review')[0]);
  expect(failed.views).toEqual([]);
  expect(failed.byTestId('start-progress')[0]?.textContent).toContain('Back');
});

test('Post now waits for the project: disabled with Loading project until its agent is known', async () => {
  const { byTestId } = await startable(detail(), { agent: undefined });
  await click(byTestId('review-mode')[0]);
  expect(byTestId('review-mode-post')[0]?.hasAttribute('data-disabled')).toBe(true);
  expect(document.body.textContent).toContain('Loading project');
});

test('Post now on a PR whose drafts review is running opens it and says Post now was not applied', async () => {
  const { byTestId, views } = await startable(detail(), {
    start: () => envelope({ session: 'rev00007', existing: true, mode: 'drafts' }),
  });
  await click(byTestId('review-mode')[0]);
  await click(byTestId('review-mode-post')[0]);
  await click(byTestId('start-review')[0]);
  expect(views).toEqual([{ kind: 'session', id: 'rev00007' }]);
  expect(document.body.textContent).toContain('Post now was not applied');
});

test('a PR that is not for me offers no Start review', async () => {
  const { byTestId } = await startable(detail({ bucket: 'other' }));
  expect(byTestId('start-review')).toHaveLength(0);
});
