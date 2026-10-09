// @vitest-environment happy-dom
import type { ProjectContext } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { VaultOverview } from './VaultOverview';

const CONTEXT: ProjectContext = {
  project: 'tide',
  hub: {
    path: 'projects/tide.md',
    headings: ['# Tide', '## Purpose'],
    excerpt: '# Tide\n\n## Purpose\n\nTide tables for the cove.',
  },
  index: ['- [[wiki/currents]]: how the currents run'],
  notes: [
    { path: 'wiki/currents.md', title: 'Currents', modified: '2026-09-24T12:00:00.000Z' },
    { path: 'wiki/eddies.md', title: 'Eddies', modified: '2026-09-23T12:00:00.000Z' },
  ],
  decisions: [],
  goals: [
    {
      id: 'bbbbbbbb',
      agent: 'codex',
      started: '2026-09-25T12:00:00.000Z',
      goal: 'Chart the neaps\nthen the springs',
      summary: 'wiki/sessions/bbbbbbbb.md',
    },
    { id: 'aaaaaaaa', agent: 'claude', started: '2026-09-20T12:00:00.000Z' },
  ],
  more: 'Nothing left out.',
};

const titles = (rows: HTMLElement[]) => rows.map((row) => row.querySelector('span')?.textContent);
const HUB_BODY = '# Tide\n\n## Imported\n\n- [[wiki/currents]]: Currents of the cove\n';
const READ = {
  path: 'projects/tide.md',
  uri: 'obsidian://open?vault=vault&file=projects%2Ftide.md',
  backlinks: [],
  preview: 'markdown',
  frontmatter: {},
  body: HUB_BODY,
  links: [
    {
      text: '[[wiki/currents]]',
      start: HUB_BODY.indexOf('[['),
      end: HUB_BODY.indexOf(']]') + 2,
      syntax: 'wikilink',
      embed: false,
      target: 'wiki/currents',
      status: 'resolved',
      path: 'wiki/currents.md',
    },
  ],
};

test('the hub, read with its links, beside related notes and recent sessions that open in the Vault', async () => {
  const { bridge, calls } = fakeBridge({
    'vault context': () => envelope(CONTEXT),
    'vault read': () => envelope(READ),
    'vault open': () => envelope({ opened: true, method: 'uri', target: 'obsidian://open' }),
  });
  const opened: string[] = [];
  const byTestId = await renderWithMesa(
    <VaultOverview project="tide" onItem={(path) => opened.push(path)} />,
    bridge,
  );
  expect(calls).toContainEqual(['--json', 'vault', 'context', '--', 'tide']);
  expect(calls).toContainEqual(['--json', 'vault', 'read', '--', 'projects/tide.md']);
  const hub = byTestId('vault-overview-hub')[0];
  expect(hub?.querySelector('h2')?.textContent).toBe('Imported');
  // A bare link followed by its title shows the title alone, and opens its note.
  const link = byTestId('vault-link')[0];
  expect(link?.textContent).toBe('Currents of the cove');
  expect(hub?.textContent).not.toContain('[[');
  await click(link);
  await click(
    [...(hub?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.includes('Open in Obsidian'),
    ),
  );
  expect(calls.at(-1)).toEqual(['--json', 'vault', 'open', '--', 'projects/tide.md']);

  expect(titles(byTestId('vault-overview-note'))).toEqual(['Currents', 'Eddies']);
  await click(byTestId('vault-overview-note')[1]);
  const goals = byTestId('vault-overview-goal');
  expect(titles(goals)).toEqual(['Chart the neaps', 'No goal set']);
  expect(goals[0]?.textContent).toContain('codex');
  await click(
    [...(goals[0]?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Summary'),
  );
  expect(opened).toEqual(['wiki/currents.md', 'wiki/eddies.md', 'wiki/sessions/bbbbbbbb.md']);
});

test('a long list of related notes shows eight, with Show all', async () => {
  const notes = Array.from({ length: 12 }, (_, at) => ({
    path: `wiki/tide-${at}.md`,
    title: `Tide ${at}`,
    modified: '2026-09-24T12:00:00.000Z',
  }));
  const { bridge } = fakeBridge({ 'vault context': () => envelope({ ...CONTEXT, notes }) });
  const byTestId = await renderWithMesa(<VaultOverview project="tide" onItem={() => {}} />, bridge);
  expect(byTestId('vault-overview-note')).toHaveLength(8);
  await click(
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Show all 12 notes'),
  );
  expect(byTestId('vault-overview-note')).toHaveLength(12);
});

test('a project with no knowledge shows an empty state and opens Import', async () => {
  const { bridge } = fakeBridge();
  let imports = 0;
  const byTestId = await renderWithMesa(
    <VaultOverview
      project="tide"
      onItem={() => {}}
      onImport={() => {
        imports++;
      }}
    />,
    bridge,
  );
  expect(byTestId('vault-overview')[0]?.textContent).toContain('A home for your project knowledge');
  await click(
    [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Import context'),
    ),
  );
  expect(imports).toBe(1);
  expect(byTestId('vault-overview-hub')).toEqual([]);
  expect(byTestId('toast')).toEqual([]);
});
