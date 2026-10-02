// @vitest-environment happy-dom
import type { BrowseChild, BrowseResult, ImportListRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa, toasts } from '@/lib/testing';
import { ImportPanel } from './ImportPanel';

const SITE = 'https://lantern-cove.atlassian.net';

const node = (id: string, kind: string, title: string, url = SITE, hasChildren = true) => ({
  id,
  kind,
  title,
  url,
  hasChildren,
});
const page = (id: string, title: string): BrowseChild =>
  node(`page:cloud-1:${id}:LC`, 'page', title, `${SITE}/wiki/spaces/LC/pages/${id}`);
const issue = (key: string, summary: string): BrowseChild =>
  node(`issue:cloud-1:${key}`, 'issue', `${key}: ${summary}`, `${SITE}/browse/${key}`, false);

/** The pages under Harbour: 26 of them, over two pages of 25. */
const LOGS = Array.from({ length: 26 }, (_, at) => page(String(9100 + at), `Tide log ${at}`));

/**
 * lantern-cove's tree, by `<node> [<cursor>] [<search>] [all]` (all: --descendants), the root's
 * under `root`. Any other node has no children.
 */
const TREE: Record<string, Omit<BrowseResult, 'node'>> = {
  root: { children: [node('site:cloud-1', 'site', 'lantern-cove')] },
  'site:cloud-1': {
    children: [
      node('confluence:cloud-1', 'confluence', 'Confluence', `${SITE}/wiki`),
      node('jira:cloud-1', 'jira', 'Jira', `${SITE}/jira`),
    ],
  },
  'confluence:cloud-1': {
    children: [node('space:cloud-1:100:LC', 'space', 'Harbour', `${SITE}/wiki/spaces/LC`)],
  },
  'space:cloud-1:100:LC': {
    children: [page('9000', 'Harbour home'), page('9001', 'Tide schedule')],
  },
  'page:cloud-1:9000:LC': { children: LOGS.slice(0, 25), cursor: 'c1' },
  'page:cloud-1:9000:LC c1': { children: LOGS.slice(25) },
  'page:cloud-1:9000:LC all': { children: LOGS },
  'jira:cloud-1': { children: [node('project:cloud-1:LC', 'project', 'Lantern Cove')] },
  'project:cloud-1:LC': { children: [issue('LC-12', 'Fix the tide alarm')] },
  'root tide': { children: [page('9001', 'Tide schedule'), issue('LC-12', 'Fix the tide alarm')] },
};

/** `mesa sources browse` over TREE. */
function browse(args: string[]) {
  const end = args.indexOf('--');
  const flag = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 && at < end ? args[at + 1] : undefined;
  };
  const at = args[end + 2] ?? 'root';
  const key = [at, flag('--cursor'), flag('--search'), args.includes('--descendants') && 'all']
    .filter(Boolean)
    .join(' ');
  return envelope({ node: args[end + 2] ?? null, children: [], ...TREE[key] });
}

const imported = (url: string, title: string): ImportListRow => ({
  source: url.includes('/browse/') ? 'jira' : 'confluence',
  id: url.split('/').at(-1) ?? '',
  url,
  title,
  fetched: '2026-09-24T12:00',
  snapshot: `raw/x/${title}.md`,
});

/** The Import panel over TREE; `import` lists what it imported, with its links. */
async function setUp(answers: Record<string, (args: string[]) => unknown> = {}) {
  let items: ImportListRow[] = [];
  const fake = fakeBridge({
    'import list': () => envelope({ items }),
    import: (args) => {
      const links = args.slice(args.indexOf('--') + 1);
      items = links.map((url) => imported(url, url));
      return envelope({ project: 'lantern-cove', items, receipt: null });
    },
    'sources browse': browse,
    ...answers,
  });
  const byTestId = await renderWithMesa(<ImportPanel project="lantern-cove" />, fake.bridge);
  return { ...fake, byTestId };
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );
const open = (title: string) => click(button(`Open ${title}`));
const tick = (title: string) => click(button(`Tick ${title}`));
const nodes = () =>
  [...document.querySelectorAll('[data-testid="source-node"] > div')].map((n) => n.textContent);
const count = () => document.querySelector('[data-testid="picked-count"]')?.textContent;

test('Browse opens the tree a node at a time; two pages and an issue ticked import together, and the panel lists them', async () => {
  const { calls, byTestId } = await setUp();
  await click(button('Browse'));
  expect(nodes()).toEqual(['lantern-cove']);
  await open('lantern-cove');
  await open('Confluence');
  await open('Harbour');
  await open('Harbour home');
  expect(nodes()).toHaveLength(6 + 25);
  await click(button('Load more'));
  expect(nodes()).toContain('Tide log 25');
  expect(calls).toContainEqual([
    '--json',
    'sources',
    'browse',
    '--cursor',
    'c1',
    '--',
    'atlassian',
    'page:cloud-1:9000:LC',
  ]);

  // A page with pages under it asks; Only this page ticks it alone.
  await tick('Harbour home');
  expect(byTestId('include-descendants-dialog')[0]?.textContent).toContain(
    'Include the pages under Harbour home?',
  );
  await click(button('Only this page'));
  expect(byTestId('include-descendants-dialog')).toHaveLength(0);
  // One with none ticks without asking.
  await tick('Tide schedule');
  expect(byTestId('include-descendants-dialog')).toHaveLength(0);
  await open('Jira');
  await open('Lantern Cove');
  await tick('LC-12: Fix the tide alarm');
  expect(count()).toBe('3 ticked');

  await click(byTestId('import-picked')[0]);
  expect(calls).toContainEqual([
    '--json',
    'import',
    '--project',
    'lantern-cove',
    '--',
    `${SITE}/wiki/spaces/LC/pages/9000`,
    `${SITE}/wiki/spaces/LC/pages/9001`,
    `${SITE}/browse/LC-12`,
  ]);
  expect(byTestId('source-picker-dialog')).toHaveLength(0);
  expect(byTestId('import-item')).toHaveLength(3);
});

test('Include them ticks every page under it, and Write notes off imports with --no-notes', async () => {
  const { calls, byTestId } = await setUp();
  await click(button('Browse'));
  await open('lantern-cove');
  await open('Confluence');
  await open('Harbour');
  await tick('Harbour home');
  await click(button('Include them'));
  expect(calls).toContainEqual([
    '--json',
    'sources',
    'browse',
    '--descendants',
    '--',
    'atlassian',
    'page:cloud-1:9000:LC',
  ]);
  expect(count()).toBe('27 ticked');
  await click(
    byTestId('source-picker-dialog')[0]?.querySelector('[aria-label="Write notes"]') as HTMLElement,
  );
  await click(byTestId('import-picked')[0]);
  const run = calls.find((c) => c[1] === 'import' && c[2] === '--project');
  expect(run?.slice(0, 6)).toEqual([
    '--json',
    'import',
    '--project',
    'lantern-cove',
    '--no-notes',
    '--',
  ]);
  expect(run).toHaveLength(6 + 27);
});

test('a search lists what it finds under the root, and clearing it shows the tree again', async () => {
  const { calls } = await setUp();
  await click(button('Browse'));
  const field = document.querySelector<HTMLInputElement>('[aria-label="Search Atlassian"]');
  const type = (text: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, text);
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await type('tide');
  await click(button('Search'));
  expect(calls).toContainEqual([
    '--json',
    'sources',
    'browse',
    '--search',
    'tide',
    '--',
    'atlassian',
  ]);
  expect(nodes()).toEqual(['Tide schedule', 'LC-12: Fix the tide alarm']);
  await type('');
  expect(nodes()).toEqual(['lantern-cove']);
});

test('a connection that needs reconnecting shows Reconnect, which signs in and loads the tree', async () => {
  let revoked = true;
  const { calls, byTestId } = await setUp({
    'sources browse': (args) =>
      revoked
        ? {
            ok: false,
            error: {
              code: 'invalid_config',
              message: 'Atlassian needs reconnecting: run mesa sources connect atlassian',
              details: { connect: 'atlassian' },
            },
          }
        : browse(args),
    'sources connect': () => {
      revoked = false;
      return envelope({
        id: 'atlassian',
        label: 'Atlassian',
        connected: true,
        status: 'connected',
        receipt: null,
      });
    },
  });
  await click(button('Browse'));
  expect(byTestId('source-error')[0]?.textContent).toContain('Atlassian needs reconnecting');
  await click(button('Reconnect'));
  expect(calls).toContainEqual(['--json', 'sources', 'connect', 'atlassian']);
  expect(nodes()).toEqual(['lantern-cove']);
  expect(toasts(byTestId)).toEqual([]);
});
