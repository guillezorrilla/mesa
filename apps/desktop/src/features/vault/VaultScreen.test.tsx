// @vitest-environment happy-dom
import type {
  VaultInventory,
  VaultItem,
  VaultLink,
  VaultPreview,
  VaultRead,
  VaultSearch,
} from '@mesa/core';
import { act, useState } from 'react';
import { expect, test, vi } from 'vitest';
import type { Bridge } from '@/lib/client';
import { MesaRoot } from '@/lib/MesaRoot';
import {
  choose,
  click,
  deferred,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { VaultScreen } from './VaultScreen';

const at = '2026-09-24T12:00:00.000Z';
const item = (path: string, over: Partial<VaultItem>): VaultItem => ({
  path,
  kind: 'markdown',
  category: 'user',
  size: 10,
  modified: at,
  ...over,
});
const ITEMS: VaultItem[] = [
  item('AGENTS.md', { category: 'agents' }),
  item('Garden/Seeds/kale.md', {}),
  item('Garden/beds.base', { kind: 'base' }),
  item('index.md', { category: 'index' }),
  item('log.md', { category: 'log' }),
  item('projects/tide.md', { category: 'projects', project: 'tide' }),
  item('projects/tide/map.canvas', { kind: 'canvas', category: 'projects', project: 'tide' }),
  item('raw/chart.png', { kind: 'attachment', category: 'raw', size: 2048 }),
  item('receipts/2026/09/a.md', { category: 'receipts', project: 'tide' }),
  item('receipts/2026/09/b.md', { category: 'receipts', project: 'lantern-cove' }),
  item('wiki/harbour.md', { category: 'wiki', unavailable: 'outside the vault' }),
];
const INVENTORY: VaultInventory = { vault: '/h/vault', total: ITEMS.length, items: ITEMS };

test('Write Bases views calls the shared command, reports kept files and disables concurrent writes', async () => {
  const pending = deferred();
  const { bridge, calls } = fakeBridge({
    'vault list': () => envelope(INVENTORY),
    'vault bases': () => pending.promise,
  });
  await renderWithMesa(<VaultScreen />, bridge);
  const button = [...document.querySelectorAll('button')].find((node) =>
    node.textContent?.includes('Write Bases views'),
  );
  await click(button);
  expect(calls).toContainEqual(['--json', 'vault', 'bases']);
  expect(button?.disabled).toBe(true);
  await act(async () =>
    pending.resolve(envelope({ written: ['sessions.base'], kept: ['receipts.base'] })),
  );
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Bases: wrote 1, kept 1.');
  expect(button?.disabled).toBe(false);
});

test('Write Bases views shows command failure and can be retried', async () => {
  const { bridge } = fakeBridge({
    'vault list': () => envelope(INVENTORY),
    'vault bases': () => failure('the vault is locked'),
  });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  const button = [...document.querySelectorAll('button')].find((node) =>
    node.textContent?.includes('Write Bases views'),
  );
  await click(button);
  expect(toastTexts(byTestId)).toContain('the vault is locked');
  expect(button?.disabled).toBe(false);
});

test('Bases feedback and pending writes belong to the profile, including an empty replacement vault', async () => {
  const late = deferred();
  let writes = 0;
  const first = fakeBridge({
    'vault list': () => envelope(INVENTORY),
    'vault bases': () =>
      ++writes === 1
        ? envelope({ written: ['receipts.base', 'sessions.base'], kept: [] })
        : late.promise,
  });
  const nextLook = deferred();
  const next = fakeBridge({
    'vault list': () => nextLook.promise,
    'vault bases': () => envelope({ written: [], kept: ['receipts.base', 'sessions.base'] }),
  });
  let use: (bridge: Bridge) => void = () => {};
  function Profiles() {
    const [bridge, setBridge] = useState<Bridge>(() => first.bridge);
    use = (next) => setBridge(() => next);
    return (
      <MesaRoot bridge={bridge} platform={fakePlatform()}>
        <VaultScreen />
      </MesaRoot>
    );
  }
  const byTestId = await renderWithMesa(<Profiles />, first.bridge);
  const button = () =>
    [...document.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('Write Bases views'),
    );
  const feedback = () => document.querySelector('[role="status"]')?.textContent;
  await click(button());
  expect(feedback()).toBe('Bases: wrote 2, kept 0.');
  await click(button());
  expect(button()?.disabled).toBe(true);
  await act(async () => use(next.bridge));
  expect(feedback()).toBeUndefined();
  expect(button()?.disabled).toBe(true);
  // Same vault path in another profile still starts clean; its empty-state action remains usable.
  await act(async () =>
    nextLook.resolve(envelope({ vault: INVENTORY.vault, total: 0, items: [] })),
  );
  expect(button()?.disabled).toBe(false);
  await click(button());
  expect(feedback()).toBe('Bases: wrote 0, kept 2.');
  await act(async () =>
    late.resolve(envelope({ written: ['receipts.base', 'sessions.base'], kept: [] })),
  );
  expect(feedback()).toBe('Bases: wrote 0, kept 2.');
  expect(button()?.disabled).toBe(false);
  expect(next.calls).toContainEqual(['--json', 'vault', 'bases']);
  expect(toastTexts(byTestId)).toEqual([]);
});

const labels = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('vault-folder').map((row) => row.getAttribute('aria-label'));
const files = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('vault-file').map((row) => [row.textContent, row.dataset.kind]);
const folder = (byTestId: (id: string) => HTMLElement[], name: string) =>
  byTestId('vault-folder').find((row) => row.getAttribute('aria-label')?.startsWith(`${name},`));

test('the vault tree shows the top level with counts, and a folder opens on its own', async () => {
  const { bridge, calls } = fakeBridge({ 'vault list': () => envelope(INVENTORY) });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  expect(calls).toContainEqual(['--json', 'vault', 'list']);
  expect(byTestId('vault-panel')[0]?.textContent).toContain('11 items in /h/vault');
  expect(labels(byTestId)).toEqual([
    'Garden, 2 items',
    'projects, 2 items',
    'raw, 1 item',
    'receipts, 2 items',
    'wiki, 1 item',
  ]);
  expect(files(byTestId)).toEqual([
    ['AGENTS.mdmarkdown', 'markdown'],
    ['index.mdmarkdown', 'markdown'],
    ['log.mdmarkdown', 'markdown'],
  ]);

  await click(folder(byTestId, 'receipts'));
  expect(folder(byTestId, 'receipts')?.getAttribute('aria-expanded')).toBe('true');
  expect(labels(byTestId)).toContain('2026, 2 items');
  expect(labels(byTestId)).not.toContain('09, 2 items'); // deeper folders stay closed
  await click(folder(byTestId, '2026'));
  await click(folder(byTestId, '09'));
  expect(files(byTestId).map(([name]) => name)).toContain('a.mdmarkdown');
  await click(folder(byTestId, 'receipts'));
  expect(labels(byTestId)).not.toContain('2026, 2 items');

  await click(folder(byTestId, 'Garden'));
  expect(files(byTestId)).toContainEqual(['beds.basebase', 'base']);
  expect(labels(byTestId)).toContain('Seeds, 1 item');
});

test('project and type filters narrow the tree and its counts', async () => {
  const { bridge } = fakeBridge({ 'vault list': () => envelope(INVENTORY) });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  const projectSelect = document.querySelector<HTMLSelectElement>('#vault-project');
  const typeSelect = document.querySelector<HTMLSelectElement>('#vault-type');
  expect([...(projectSelect?.options ?? [])].map((o) => o.value)).toEqual([
    '',
    'lantern-cove',
    'tide',
  ]);

  await choose(projectSelect ?? undefined, 'tide');
  expect(labels(byTestId)).toEqual(['projects, 2 items', 'receipts, 1 item']);
  expect(files(byTestId)).toEqual([]);
  expect(byTestId('vault-shown')[0]?.textContent).toBe('3 of 11 shown');

  await choose(typeSelect ?? undefined, 'canvas');
  expect(labels(byTestId)).toEqual(['projects, 1 item']);

  await choose(projectSelect ?? undefined, '');
  await choose(typeSelect ?? undefined, 'receipts');
  expect(labels(byTestId)).toEqual(['receipts, 2 items']);
  await choose(typeSelect ?? undefined, 'attachment');
  expect(labels(byTestId)).toEqual(['raw, 1 item']);
  await choose(typeSelect ?? undefined, 'index');
  expect(labels(byTestId)).toEqual([]);
  expect(files(byTestId)).toEqual([['index.mdmarkdown', 'markdown']]);
});

test('selecting an item shows its path and kind; an unavailable one says why', async () => {
  const { bridge, calls } = fakeBridge({
    'vault list': () => envelope(INVENTORY),
    'vault read': () =>
      envelope(readOf(ITEMS[7] as VaultItem, { preview: 'unsupported', reason: 'invented' })),
  });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  expect(byTestId('vault-item')[0]?.textContent).toContain('Select an item');

  await click(folder(byTestId, 'raw'));
  const chart = byTestId('vault-file').find((row) => row.textContent?.startsWith('chart.png'));
  await click(chart);
  expect(chart?.getAttribute('aria-pressed')).toBe('true');
  const fact = (name: string) =>
    byTestId('vault-item')[0]?.querySelector(`[data-fact="${name}"]`)?.textContent;
  expect([fact('Path'), fact('Kind'), fact('Category'), fact('Size')]).toEqual([
    'raw/chart.png',
    'attachment',
    'raw',
    '2,048 bytes',
  ]);
  expect(byTestId('vault-item-unavailable')).toEqual([]);

  await click(folder(byTestId, 'wiki'));
  await click(byTestId('vault-file').find((row) => row.textContent?.startsWith('harbour.md')));
  expect(fact('Path')).toBe('wiki/harbour.md');
  expect(byTestId('vault-item-unavailable')[0]?.textContent).toContain('outside the vault');
  // Only the available item was read: an unavailable one is never asked for.
  expect(calls.filter((args) => args[2] === 'read')).toEqual([
    ['--json', 'vault', 'read', '--', 'raw/chart.png'],
  ]);
  expect(byTestId('vault-reader')).toEqual([]);
});

// The reader's invented vault: a note linking a hub, an attachment, two kales, and nothing.
const BODY =
  '# Currents\n\nThe [[tide|tide hub]] turns; ![[chart.png]] shows it.\n\nSee [[kale]] and [[eddies]], not `[[code]]`.\n';
const linkAt = (text: string, rest: Partial<VaultLink>) => {
  const start = BODY.indexOf(text);
  return {
    text,
    start,
    end: start + text.length,
    syntax: 'wikilink',
    embed: false,
    ...rest,
  } as VaultLink;
};
const LINKS: VaultLink[] = [
  linkAt('[[tide|tide hub]]', {
    target: 'tide',
    alias: 'tide hub',
    status: 'resolved',
    path: 'projects/tide.md',
  }),
  linkAt('![[chart.png]]', {
    embed: true,
    target: 'chart.png',
    status: 'resolved',
    path: 'raw/chart.png',
  }),
  linkAt('[[kale]]', {
    target: 'kale',
    status: 'ambiguous',
    candidates: ['Garden/Seeds/kale.md', 'Garden/kale.md'],
  }),
  linkAt('[[eddies]]', { target: 'eddies', status: 'broken' }),
];
const NOTES: VaultItem[] = [
  item('Garden/Seeds/kale.md', {}),
  item('Garden/beds.base', { kind: 'base' }),
  item('Garden/kale.md', {}),
  item('projects/tide.md', { category: 'projects', project: 'tide' }),
  item('projects/tide/map.canvas', { kind: 'canvas', category: 'projects', project: 'tide' }),
  item('raw/chart.png', { kind: 'attachment', category: 'raw' }),
  item('raw/tides.json', { kind: 'other', category: 'raw' }),
  item('wiki/currents.md', { category: 'wiki', project: 'tide' }),
];
const readOf = (listed: VaultItem, preview: VaultPreview, backlinks: string[] = []): VaultRead => ({
  ...listed,
  uri: `obsidian://open?vault=vault&file=${encodeURIComponent(listed.path)}`,
  backlinks,
  ...preview,
});
const note = (body: string, links: VaultLink[] = [], frontmatter = {}): VaultPreview => ({
  preview: 'markdown',
  frontmatter,
  body,
  links,
});
const READS: Record<string, VaultPreview> = {
  'wiki/currents.md': note(BODY, LINKS, {
    project: 'tide',
    tags: ['ebb', 'flood'],
    depth: { m: 4 },
  }),
  'projects/tide/map.canvas': {
    preview: 'canvas',
    canvas: null,
    nodes: 3,
    edges: 1,
    texts: ['Neap tides', 'Spring tides'],
  },
  'Garden/beds.base': { preview: 'base', yaml: 'views:\n  - type: table\n' },
  'raw/chart.png': {
    preview: 'unsupported',
    reason: 'Mesa does not preview images, audio, video, or PDFs',
  },
  'raw/tides.json': {
    preview: 'unsupported',
    reason: 'Mesa previews only Markdown, canvases, and bases',
  },
};
const BACKLINKS: Record<string, string[]> = {
  'projects/tide.md': ['wiki/currents.md'],
  'wiki/currents.md': ['projects/tide.md'],
};
const readerBridge = (answers: Record<string, (args: string[]) => unknown> = {}) =>
  fakeBridge({
    'vault list': () => envelope({ vault: '/h/vault', total: NOTES.length, items: NOTES }),
    'vault read': (args) => {
      const path = args[4] ?? '';
      const listed = NOTES.find((n) => n.path === path) as VaultItem;
      return envelope(readOf(listed, READS[path] ?? note(`# ${path}\n`), BACKLINKS[path]));
    },
    'vault open': (args) =>
      envelope({ opened: true, method: 'uri', target: `obsidian://open?file=${args[4]}` }),
    ...answers,
  });

/** Selects `path` in the tree as a person does: each closed folder on the way, then the file. */
async function select(byTestId: (id: string) => HTMLElement[], path: string) {
  for (const name of path.split('/').slice(0, -1)) {
    const row = folder(byTestId, name);
    if (row?.getAttribute('aria-expanded') !== 'true') await click(row);
  }
  await click(byTestId('vault-file').find((row) => row.title === path));
}
const reader = (byTestId: (id: string) => HTMLElement[]) => byTestId('vault-reader')[0];
const selectedPath = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('vault-item')[0]?.querySelector('[data-fact="Path"]')?.textContent;

test('the shared Base preview shows markerless names while keeping raw YAML and exact Obsidian navigation', async () => {
  const yaml = 'views:\n  - name: Meaningful\n  - name: By kind\n  - name: Legacy (all receipts)\n';
  const { bridge, calls } = readerBridge({
    'vault read': () =>
      envelope(
        readOf(NOTES[1] as VaultItem, {
          preview: 'base',
          yaml,
          views: ['Meaningful', 'By kind', 'Legacy (all receipts)'],
        }),
      ),
  });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  await select(byTestId, 'Garden/beds.base');
  expect(byTestId('vault-base-views')[0]?.textContent).toContain(
    'Meaningful, By kind, Legacy (all receipts)',
  );
  expect(reader(byTestId)?.textContent).toContain(yaml);
  const open = [...(reader(byTestId)?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.includes('Open in Obsidian'),
  );
  await click(open);
  expect(calls).toContainEqual(['--json', 'vault', 'open', '--', 'Garden/beds.base']);
});

test('a note shows its properties as a table, its Markdown, and links that select their item', async () => {
  const { bridge, calls } = readerBridge();
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  await select(byTestId, 'wiki/currents.md');
  expect(calls).toContainEqual(['--json', 'vault', 'read', '--', 'wiki/currents.md']);
  const rows = [...(byTestId('vault-properties')[0]?.querySelectorAll('tr') ?? [])];
  expect(rows.map((row) => [...row.children].map((cell) => cell.textContent))).toEqual([
    ['project', 'tide'],
    ['tags', 'ebb, flood'],
    ['depth', '{"m":4}'],
  ]);
  const markdown = byTestId('vault-markdown')[0];
  expect(markdown?.querySelector('h1')?.textContent).toBe('Currents');
  expect(markdown?.querySelector('code')?.textContent).toBe('[[code]]');
  expect(byTestId('vault-link').map((link) => [link.textContent, link.dataset.status])).toEqual([
    ['tide hub', 'resolved'],
    ['chart.png', 'resolved'],
    ['kale', 'ambiguous'],
    ['eddies', 'broken'],
  ]);

  await click(byTestId('vault-link')[0]);
  expect(calls).toContainEqual(['--json', 'vault', 'read', '--', 'projects/tide.md']);
  expect(selectedPath(byTestId)).toBe('projects/tide.md');
  // The tree opens to the linked item and marks it selected.
  const tide = byTestId('vault-file').find((row) => row.title === 'projects/tide.md');
  expect(tide?.getAttribute('aria-pressed')).toBe('true');
  expect(byTestId('vault-properties')).toEqual([]);
  expect(reader(byTestId)?.textContent).toContain('No properties.');

  // Its backlinks list the note that links here, and one selects it again.
  const backlinks = byTestId('vault-backlinks')[0];
  expect([...(backlinks?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
    'wiki/currents.md',
  ]);
  await click(backlinks?.querySelector('button') ?? undefined);
  expect(selectedPath(byTestId)).toBe('wiki/currents.md');

  await click(byTestId('vault-link')[1]);
  expect(selectedPath(byTestId)).toBe('raw/chart.png');
});

test('broken and ambiguous links are marked, explained, and an ambiguous one offers its candidates', async () => {
  const { bridge } = readerBridge();
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  await select(byTestId, 'wiki/currents.md');
  const [, , kale, eddies] = byTestId('vault-link');
  expect(kale?.title).toBe('ambiguous: 2 items match kale, and Mesa does not guess which one');
  expect(eddies?.title).toBe('broken: no item in the vault matches eddies');
  expect(kale?.querySelector('[aria-label="ambiguous"]')).not.toBeNull();
  expect(eddies?.querySelector('[aria-label="broken"]')).not.toBeNull();
  const problems = [...(byTestId('vault-link-problems')[0]?.querySelectorAll('li') ?? [])];
  expect(problems.map((li) => li.textContent)).toEqual([
    '[[kale]]is ambiguous: 2 items match kale, and Mesa does not guess which one.Garden/Seeds/kale.mdGarden/kale.md',
    '[[eddies]]is broken: no item in the vault matches eddies.',
  ]);
  const candidate = [...(problems[0]?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent === 'Garden/kale.md',
  );
  await click(candidate);
  expect(selectedPath(byTestId)).toBe('Garden/kale.md');
  expect(byTestId('vault-link-problems')).toEqual([]);
  expect(reader(byTestId)?.textContent).toContain('No note links here.');
});

test('a canvas, a base, an attachment, and another file say Preview not available and open in Obsidian', async () => {
  const { bridge, calls } = readerBridge();
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  const cases: [string, string][] = [
    ['projects/tide/map.canvas', "Mesa shows a canvas's text, not its layout."],
    ['Garden/beds.base', "Mesa shows a base's YAML, not its views."],
    ['raw/chart.png', 'Mesa does not preview images, audio, video, or PDFs.'],
    ['raw/tides.json', 'Mesa previews only Markdown, canvases, and bases.'],
  ];
  for (const [path, why] of cases) {
    await select(byTestId, path);
    const message = byTestId('vault-no-preview')[0];
    expect(message?.textContent).toContain('Preview not available');
    expect(message?.textContent).toContain(why);
    await click(
      [...(message?.querySelectorAll('button') ?? [])].find((b) =>
        b.textContent?.includes('Open in Obsidian'),
      ),
    );
    expect(calls.at(-1)).toEqual(['--json', 'vault', 'open', '--', path]);
    expect(byTestId('vault-markdown')).toEqual([]);
  }
  await select(byTestId, 'projects/tide/map.canvas');
  expect(byTestId('vault-canvas')[0]?.textContent).toBe('3 nodes, 1 edge');
  expect(reader(byTestId)?.textContent).toContain('Neap tides');
  expect(reader(byTestId)?.textContent).toContain('Spring tides');
  await select(byTestId, 'Garden/beds.base');
  expect(reader(byTestId)?.querySelector('pre')?.textContent).toBe('views:\n  - type: table\n');
});

// The search's invented answer: a note with two snippets and a canvas by its path alone.
const FOUND: VaultSearch = {
  total: 2,
  truncated: false,
  items: [
    {
      path: 'wiki/currents.md',
      kind: 'markdown',
      project: 'tide',
      title: 'currents',
      matches: [
        { line: 3, text: 'The [[tide|tide hub]] turns; ![[chart.png]] shows it.' },
        { line: 5, text: 'See [[kale]] and [[eddies]], not `[[code]]`.' },
      ],
    },
    {
      path: 'projects/tide/map.canvas',
      kind: 'canvas',
      project: 'tide',
      title: 'map.canvas',
      matches: [],
    },
  ],
};

/** Types `text` in the Vault screen's search box and presses Enter, as a person does. */
async function search(text: string) {
  const input = document.querySelector<HTMLInputElement>('#vault-search') as HTMLInputElement;
  await act(async () => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => input.form?.requestSubmit());
}
const results = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('vault-result').map((row) => row.title);

test('the search box shows results with snippets under the filters, and one opens in the reader', async () => {
  const { bridge, calls } = readerBridge({ 'vault search': () => envelope(FOUND) });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  await search('  tide ');
  expect(calls).toContainEqual(['--json', 'vault', 'search', '--', 'tide']);
  expect(byTestId('vault-results-said')[0]?.textContent).toBe('2 items match "tide".');
  expect(results(byTestId)).toEqual(['wiki/currents.md', 'projects/tide/map.canvas']);
  expect(byTestId('vault-result')[0]?.textContent).toContain('currents');
  expect(byTestId('vault-snippet').map((line) => line.textContent)).toEqual([
    '3The [[tide|tide hub]] turns; ![[chart.png]] shows it.',
    '5See [[kale]] and [[eddies]], not `[[code]]`.',
  ]);
  expect(byTestId('vault-folder')).toEqual([]); // the results stand in for the tree

  await choose(document.querySelector('#vault-project') ?? undefined, 'tide');
  await choose(document.querySelector('#vault-type') ?? undefined, 'canvas');
  expect(calls.at(-1)).toEqual([
    '--json',
    'vault',
    'search',
    '--project',
    'tide',
    '--type',
    'canvas',
    '--',
    'tide',
  ]);
  expect(byTestId('vault-results-said')[0]?.textContent).toBe(
    '2 items match "tide" under these filters.',
  );

  await click(byTestId('vault-result')[0]);
  expect(calls).toContainEqual(['--json', 'vault', 'read', '--', 'wiki/currents.md']);
  expect(selectedPath(byTestId)).toBe('wiki/currents.md');
  expect(byTestId('vault-result')[0]?.getAttribute('aria-pressed')).toBe('true');
  expect(byTestId('vault-markdown')[0]?.querySelector('h1')?.textContent).toBe('Currents');

  // Emptied, the box gives the tree back.
  await search('');
  expect(byTestId('vault-results')).toEqual([]);
  expect(byTestId('vault-folder').length).toBeGreaterThan(0);
});

test('a search with no results says so, and one that stops short says how many it shows', async () => {
  const { bridge } = readerBridge({
    'vault search': (args) =>
      envelope(
        args.at(-1) === 'kelp'
          ? { total: 0, truncated: false, items: [] }
          : { ...FOUND, total: 70, truncated: true },
      ),
  });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  await search('kelp');
  expect(byTestId('vault-results-said')[0]?.textContent).toBe('No items match "kelp".');
  expect(byTestId('vault-result')).toEqual([]);
  await search('tide');
  expect(byTestId('vault-results-said')[0]?.textContent).toBe(
    '70 items match "tide". Showing the first 2.',
  );
});

test('a query given to the screen, as Search Mesa gives it, searches at once', async () => {
  const { bridge, calls } = readerBridge({ 'vault search': () => envelope(FOUND) });
  const byTestId = await renderWithMesa(<VaultScreen query="tide" />, bridge);
  expect(document.querySelector<HTMLInputElement>('#vault-search')?.value).toBe('tide');
  expect(calls).toContainEqual(['--json', 'vault', 'search', '--', 'tide']);
  expect(results(byTestId)).toHaveLength(2);
});

test('opened at a path, the screen selects that item and opens the tree to it', async () => {
  const { bridge, calls } = readerBridge();
  const byTestId = await renderWithMesa(<VaultScreen path="wiki/currents.md" />, bridge);
  expect(selectedPath(byTestId)).toBe('wiki/currents.md');
  expect(calls).toContainEqual(['--json', 'vault', 'read', '--', 'wiki/currents.md']);
  const row = byTestId('vault-file').find((file) => file.title === 'wiki/currents.md');
  expect(row?.getAttribute('aria-pressed')).toBe('true');
});

test('navigation to another vault path selects and reads the new item', async () => {
  let navigate!: (path: string) => void;
  function Host() {
    const [path, setPath] = useState('wiki/currents.md');
    navigate = setPath;
    return <VaultScreen path={path} />;
  }
  const { bridge } = readerBridge();
  const byTestId = await renderWithMesa(<Host />, bridge);
  expect(selectedPath(byTestId)).toBe('wiki/currents.md');
  await act(async () => navigate('projects/tide.md'));
  expect(selectedPath(byTestId)).toBe('projects/tide.md');
  expect(reader(byTestId)?.textContent).toContain('projects/tide.md');
});

/** The window gaining focus, as when a person comes back from another app. */
const focus = () => act(async () => window.dispatchEvent(new Event('focus')));
const later = (seconds: number) => act(async () => vi.advanceTimersByTime(seconds * 1000));
const shownFact = (byTestId: (id: string) => HTMLElement[], name: string) =>
  byTestId('vault-item')[0]?.querySelector(`[data-fact="${name}"]`)?.textContent;

test('an outside edit refreshes the current search on focus and on the next look', async () => {
  vi.useFakeTimers();
  try {
    let found = FOUND;
    const { bridge } = readerBridge({ 'vault search': () => envelope(found) });
    const byTestId = await renderWithMesa(<VaultScreen query="tide" />, bridge);
    expect(results(byTestId)).toHaveLength(2);
    found = { total: 0, truncated: false, items: [] };
    await focus();
    expect(results(byTestId)).toEqual([]);
    expect(byTestId('vault-results-said')[0]?.textContent).toContain('No items match');
    found = FOUND;
    await later(5);
    expect(results(byTestId)).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
});

test('a selected note that stops reading explains the failure without retaining its old preview', async () => {
  let missing = false;
  const quick = readerBridge();
  const { bridge } = readerBridge({
    'vault read': (args) =>
      missing ? failure('The note no longer reads', 'internal') : quick.bridge(args),
  });
  const byTestId = await renderWithMesa(<VaultScreen path="wiki/currents.md" />, bridge);
  expect(byTestId('vault-markdown')).toHaveLength(1);
  missing = true;
  await focus();
  expect(byTestId('vault-markdown')).toEqual([]);
  expect(byTestId('vault-item')[0]?.textContent).toContain('The note no longer reads');
  expect(toastTexts(byTestId)).toContain('The note no longer reads');
  missing = false;
  await focus();
  expect(byTestId('vault-markdown')).toHaveLength(1);
});

test('the screen looks again every five seconds and on focus: an outside edit shows in place, and a deleted item says so', async () => {
  vi.useFakeTimers();
  try {
    let body = '# Currents\n\nThe first tide.\n';
    let modified = at;
    let listed = NOTES;
    const current = () =>
      listed.map((n) => (n.path === 'wiki/currents.md' ? { ...n, modified } : n));
    const { bridge, calls } = readerBridge({
      'vault list': () => envelope({ vault: '/h/vault', total: listed.length, items: current() }),
      'vault read': (args) =>
        envelope(readOf(current().find((n) => n.path === args[4]) as VaultItem, note(body))),
    });
    const byTestId = await renderWithMesa(<VaultScreen />, bridge);
    await select(byTestId, 'wiki/currents.md');
    const tree = document.querySelector<HTMLElement>('[aria-label="Vault tree"]') as HTMLElement;
    tree.scrollTop = 40;
    const markdown = () => byTestId('vault-markdown')[0]?.textContent;
    expect(markdown()).toContain('The first tide.');

    // Saved in another editor: the look five seconds on shows it, the selection and tree kept.
    body = '# Currents\n\nThe second tide.\n';
    modified = '2026-09-24T12:00:04.000Z';
    await later(4);
    expect(markdown()).toContain('The first tide.');
    await later(1);
    expect(markdown()).toContain('The second tide.');
    expect(shownFact(byTestId, 'Modified')).toBe('2026-09-24T12:00:04.000Z');
    expect(selectedPath(byTestId)).toBe('wiki/currents.md');
    expect(document.querySelector('[aria-label="Vault tree"]')).toBe(tree);
    expect(tree.scrollTop).toBe(40);

    // Coming back to the window looks at once.
    body = '# Currents\n\nThe third tide.\n';
    await focus();
    expect(markdown()).toContain('The third tide.');
    expect(calls.filter((c) => c[2] === 'read')).toHaveLength(3);

    // Deleted outside Mesa: the list drops it and the details say so, with no toast.
    listed = NOTES.filter((n) => n.path !== 'wiki/currents.md');
    await later(5);
    expect(byTestId('vault-item')[0]?.textContent).toBe(
      'This item no longer exists: wiki/currents.md.',
    );
    expect(byTestId('vault-file').map((row) => row.title)).not.toContain('wiki/currents.md');
    expect(byTestId('vault-panel')[0]?.textContent).toContain('7 items in /h/vault');
    expect(calls.filter((c) => c[2] === 'read')).toHaveLength(3);
    expect(toastTexts(byTestId)).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('a look or a read still running is not asked again, and the looks stop with the screen', async () => {
  vi.useFakeTimers();
  try {
    let slowList: ReturnType<typeof deferred> | undefined;
    let slowRead: ReturnType<typeof deferred> | undefined;
    const quick = readerBridge();
    const { bridge, calls } = fakeBridge({
      'vault list': (args) => slowList?.promise ?? quick.bridge(args),
      'vault read': (args) => slowRead?.promise ?? quick.bridge(args),
    });
    const byTestId = await renderWithMesa(<VaultScreen />, bridge);
    const lists = () => calls.filter((c) => c[2] === 'list').length;
    const reads = () => calls.filter((c) => c[2] === 'read').length;
    expect(lists()).toBe(1);

    slowList = deferred();
    await later(5);
    expect(lists()).toBe(2);
    await later(10);
    await focus();
    expect(lists()).toBe(2);
    const landing = slowList;
    slowList = undefined;
    await act(async () => landing.resolve(await quick.bridge(['--json', 'vault', 'list'])));
    await later(5);
    expect(lists()).toBe(3);

    await select(byTestId, 'wiki/currents.md');
    expect(reads()).toBe(1);
    slowRead = deferred();
    await later(5);
    expect(reads()).toBe(2);
    await later(5);
    expect([lists(), reads()]).toEqual([5, 2]);
    slowRead = undefined;

    // Another screen: no more looks on a tick or a focus.
    await renderWithMesa(<p>Elsewhere</p>, bridge);
    await later(15);
    await focus();
    expect(lists()).toBe(5);
  } finally {
    vi.useRealTimers();
  }
});

const status = (missing: string[]) => () =>
  envelope({ path: '/h/vault', ok: missing.length === 0, missing });
const ALL = ['log.md', 'AGENTS.md', 'index.md', 'raw', 'wiki', 'projects', 'receipts', 'daily'];

test('a missing folder, a vault that does not open, an empty one, and one not laid out each explain the fix in place, never in a toast', async () => {
  const state = (byTestId: (id: string) => HTMLElement[]) =>
    byTestId('vault-state').map((alert) => [alert.dataset.state, alert.textContent]);

  let missing = true;
  const { bridge } = fakeBridge({
    'vault list': () =>
      missing ? failure('vault /h/vault does not exist; run mesa vault init') : envelope(INVENTORY),
    'vault status': status(ALL),
  });
  let byTestId = await renderWithMesa(<VaultScreen />, bridge);
  expect(state(byTestId)).toEqual([
    [
      'missing',
      'Choose a home for your knowledgeThe vault folder at /h/vault could not be found.Create it here, or choose another folder in vault settings. Set up vault',
    ],
  ]);
  expect(byTestId('vault-folder')).toEqual([]);
  expect(byTestId('vault-panel')[0]?.textContent).not.toContain('No items.');
  expect(toastTexts(byTestId)).toEqual([]);
  // Once the folder is there, the next look (here, a focus) shows its items.
  missing = false;
  await focus();
  expect(state(byTestId).map(([name]) => name)).toEqual(['not-laid-out']);
  expect(byTestId('vault-folder').length).toBeGreaterThan(0);

  byTestId = await renderWithMesa(
    <VaultScreen />,
    fakeBridge({
      'vault list': () => ({
        ok: false,
        error: { code: 'invalid_config', message: 'vault /h/vault is not a folder' },
      }),
      'vault status': status(ALL),
    }).bridge,
  );
  expect(state(byTestId)).toEqual([
    [
      'unlisted',
      'The vault did not openvault /h/vault is not a folderChoose a vault folder in Settings, under General > Vault.',
    ],
  ]);
  expect(toastTexts(byTestId)).toEqual([]);

  byTestId = await renderWithMesa(
    <VaultScreen />,
    fakeBridge({
      'vault list': () => envelope({ vault: '/h/vault', total: 0, items: [] }),
      'vault status': status(ALL),
    }).bridge,
  );
  expect(state(byTestId)).toEqual([
    [
      'empty',
      'Your knowledge starts hereNotes, decisions, and session summaries will collect here as you work./h/vault Set up vault',
    ],
  ]);
  expect(byTestId('vault-search')).toEqual([]);

  byTestId = await renderWithMesa(
    <VaultScreen />,
    fakeBridge({
      'vault list': () => envelope(INVENTORY),
      'vault status': status(['receipts', 'daily']),
    }).bridge,
  );
  expect(state(byTestId)).toEqual([
    [
      'not-laid-out',
      "Set up your vaultAdd Mesa's missing folders and notes: receipts, daily. Your existing files are kept. Set up vault",
    ],
  ]);
  // What is there stays browsable.
  expect(labels(byTestId)).toContain('Garden, 2 items');
});

// Another profile's invented vault: nothing in it shares a word with the first one's.
const OTHER: VaultInventory = {
  vault: '/h/other-vault',
  total: 2,
  items: [item('lighthouse.md', {}), item('wiki/lamp.md', { category: 'wiki' })],
};
/** Every word the first profile's items would show, for a check that none renders. */
const firstWords = ['currents', 'tide', 'kale', 'beds', 'chart', 'Garden', '/h/vault'];
const showsFirst = () => {
  const text = document.body.textContent ?? '';
  return firstWords.filter((word) => text.includes(word));
};

test('switching the profile clears the list, the selection, and the search at once, and the last profile never renders again', async () => {
  // A profile is the bridge the screen reaches mesa through: the app runs one per window (its
  // MESA_PROFILE), so a switch reaches the screen as another bridge under it.
  const firstLook = deferred();
  const firstRead = deferred();
  let looks = 0;
  const first = readerBridge({
    'vault list': (args) => (++looks === 1 ? readerBridge().bridge(args) : firstLook.promise),
    'vault read': () => firstRead.promise,
    'vault search': () => envelope(FOUND),
  });
  const otherLook = deferred();
  const other = fakeBridge({ 'vault list': () => otherLook.promise });
  let use: (bridge: Bridge) => void = () => {};
  function Profiles() {
    const [bridge, setBridge] = useState<Bridge>(() => first.bridge);
    use = (next) => setBridge(() => next);
    return (
      <MesaRoot bridge={bridge} platform={fakePlatform()}>
        <VaultScreen />
      </MesaRoot>
    );
  }
  const byTestId = await renderWithMesa(<Profiles />, first.bridge);
  await select(byTestId, 'wiki/currents.md');
  await search('tide');
  expect(results(byTestId)).toHaveLength(2);
  expect(byTestId('vault-item')[0]?.textContent).toContain('Reading wiki/currents.md...');
  await focus(); // the first profile's next look, still running at the switch

  await act(async () => use(other.bridge));
  expect(showsFirst()).toEqual([]);
  expect(byTestId('vault-panel')[0]?.textContent).toContain('Reading the vault...');
  expect([byTestId('vault-result'), byTestId('vault-item'), byTestId('vault-file')]).toEqual([
    [],
    [],
    [],
  ]);

  await act(async () => otherLook.resolve(envelope(OTHER)));
  expect(byTestId('vault-file').map((row) => row.title)).toEqual(['lighthouse.md']);
  // The first profile's slower replies land last, and change nothing.
  await act(async () => {
    firstLook.resolve(envelope(INVENTORY));
    firstRead.resolve(envelope(readOf(NOTES[7] as VaultItem, note(BODY, LINKS))));
  });
  expect(showsFirst()).toEqual([]);
  expect(byTestId('vault-panel')[0]?.textContent).toContain('2 items in /h/other-vault');
  expect(toastTexts(byTestId)).toEqual([]);
});

test("the profile's vault moved: its filters, search, and selection start over on the new one", async () => {
  let listed: VaultInventory = { vault: '/h/vault', total: NOTES.length, items: NOTES };
  const { bridge } = readerBridge({
    'vault list': () => envelope(listed),
    'vault search': () => envelope(FOUND),
  });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  await select(byTestId, 'wiki/currents.md');
  await choose(document.querySelector('#vault-project') ?? undefined, 'tide');
  await search('tide');
  expect(results(byTestId)).toHaveLength(2);

  listed = OTHER; // `mesa config set vault` pointed the profile elsewhere
  await focus();
  expect(showsFirst()).toEqual([]);
  expect(document.querySelector<HTMLInputElement>('#vault-search')?.value).toBe('');
  expect(document.querySelector<HTMLSelectElement>('#vault-project')?.value).toBe('');
  expect(byTestId('vault-item')[0]?.textContent).toContain('Select an item');
  expect(labels(byTestId)).toEqual(['wiki, 1 item']);
});

test('empty vault setup uses vault init, prevents concurrent writes and refreshes the inventory', async () => {
  let initialised = false;
  const pending = deferred();
  const { bridge, calls } = fakeBridge({
    'vault list': () =>
      envelope(initialised ? INVENTORY : { vault: '/h/vault', total: 0, items: [] }),
    'vault status': () =>
      envelope({ path: '/h/vault', ok: initialised, missing: initialised ? [] : ['wiki'] }),
    'vault init': () => pending.promise,
  });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  const setup = [...document.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Set up vault'),
  );
  await click(setup);
  expect(setup?.disabled).toBe(true);
  expect(calls.filter((args) => args[1] === 'vault' && args[2] === 'init')).toHaveLength(1);
  initialised = true;
  await act(async () =>
    pending.resolve(envelope({ path: '/h/vault', created: ['wiki'], receipt: null })),
  );
  expect(byTestId('vault-state')).toEqual([]);
  expect(byTestId('vault-file').length).toBeGreaterThan(0);
  expect(toastTexts(byTestId)).toEqual([]);
});
