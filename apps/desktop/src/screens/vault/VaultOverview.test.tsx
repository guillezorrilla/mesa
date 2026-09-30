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

const texts = (rows: HTMLElement[]) => rows.map((row) => row.textContent);

test('the hub excerpt with Open in Obsidian, related notes and summaries that open in the Vault, and recent goals', async () => {
  const { bridge, calls } = fakeBridge({
    'vault context': () => envelope(CONTEXT),
    'vault open': () => envelope({ opened: true, method: 'uri', target: 'obsidian://open' }),
  });
  const opened: string[] = [];
  const byTestId = await renderWithMesa(
    <VaultOverview project="tide" onItem={(path) => opened.push(path)} />,
    bridge,
  );
  expect(calls).toContainEqual(['--json', 'vault', 'context', '--', 'tide']);
  const hub = byTestId('vault-overview-hub')[0];
  expect(hub?.querySelector('h2')?.textContent).toBe('Purpose');
  expect(hub?.textContent).toContain('Tide tables for the cove.');
  await click(
    [...(hub?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.includes('Open in Obsidian'),
    ),
  );
  expect(calls.at(-1)).toEqual(['--json', 'vault', 'open', '--', 'projects/tide.md']);

  expect(texts(byTestId('vault-overview-note'))).toEqual([
    'Currents2026-09-24',
    'Eddies2026-09-23',
  ]);
  await click(byTestId('vault-overview-note')[1]);
  expect(texts(byTestId('vault-overview-goal'))).toEqual([
    'Chart the neapscodex · 2026-09-25Summary',
    'No goalclaude · 2026-09-20',
  ]);
  await click(byTestId('vault-overview-goal')[0]?.querySelector('button') ?? undefined);
  expect(opened).toEqual(['wiki/eddies.md', 'wiki/sessions/bbbbbbbb.md']);
});

test('a project with nothing in the vault gets one quiet line', async () => {
  const { bridge } = fakeBridge();
  const byTestId = await renderWithMesa(<VaultOverview project="tide" onItem={() => {}} />, bridge);
  expect(byTestId('vault-overview')[0]?.querySelector('p')?.textContent).toBe(
    'Nothing in the vault for this project yet.',
  );
  expect(byTestId('vault-overview-hub')).toEqual([]);
  expect(byTestId('toast')).toEqual([]);
});
