// @vitest-environment happy-dom
import type { VaultInventory, VaultItem, VaultLink, VaultPreview, VaultRead } from '@mesa/core';
import { expect, test } from 'vitest';
import { choose, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
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
const readerBridge = () =>
  fakeBridge({
    'vault list': () => envelope({ vault: '/h/vault', total: NOTES.length, items: NOTES }),
    'vault read': (args) => {
      const path = args[4] ?? '';
      const listed = NOTES.find((n) => n.path === path) as VaultItem;
      return envelope(readOf(listed, READS[path] ?? note(`# ${path}\n`), BACKLINKS[path]));
    },
    'vault open': (args) =>
      envelope({ opened: true, method: 'uri', target: `obsidian://open?file=${args[4]}` }),
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
