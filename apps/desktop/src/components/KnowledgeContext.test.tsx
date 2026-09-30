// @vitest-environment happy-dom

import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { KnowledgeContext } from './KnowledgeContext';

// Entries as `mesa vault save decision` and `mesa vault save note` write them (session-writes.ts).
const decision = {
  path: 'receipts/2026/09/20260924T120000Z-decision-01TEST00000000000000000001.md',
  summary:
    'Saved decision Fixed clock in tide tests for lantern-cove in [[wiki/decisions/2026-09-24-fixed-clock-in-tide-tests]]',
  receipt: {
    id: '01TEST00000000000000000001',
    kind: 'decision',
    type: 'decision',
    status: 'ok',
    started: '2026-09-24T12:00',
    session: 'a1b2c3d4',
    actor: 'a1b2c3d4',
    inputs: {
      title: 'Fixed clock in tide tests',
      rationale: 'The flake was the wall clock at midnight',
      probabilities: { 'fixed-clock': 0.8, retry: 0.2 },
      confidence: 0.8,
      target: 'wiki/decisions/2026-09-24-fixed-clock-in-tide-tests.md',
    },
    outputs: {
      target: 'wiki/decisions/2026-09-24-fixed-clock-in-tide-tests.md',
      link: '[[wiki/decisions/2026-09-24-fixed-clock-in-tide-tests]]',
    },
    decisions: [],
  },
};
const note = {
  path: 'receipts/2026/09/20260924T120100Z-action-01TEST00000000000000000002.md',
  summary: 'Saved note Tide table sources for lantern-cove in [[wiki/notes/tide-table-sources]]',
  receipt: {
    id: '01TEST00000000000000000002',
    kind: 'vault-change',
    type: 'action',
    status: 'ok',
    started: '2026-09-24T12:01',
    inputs: { title: 'Tide table sources', target: 'wiki/notes/tide-table-sources.md' },
    outputs: {
      target: 'wiki/notes/tide-table-sources.md',
      link: '[[wiki/notes/tide-table-sources]]',
    },
    decisions: [],
  },
};

const bridgeOf = () =>
  fakeBridge({
    receipts: (args) =>
      envelope(
        args.includes('decision') ? [decision] : args.includes('vault-change') ? [note] : [],
      ),
    'vault open': () => envelope({ opened: true, method: 'uri', target: 'obsidian://open' }),
  });

test('a saved decision and a saved note show with their rationale and open their own notes', async () => {
  const { bridge, calls } = bridgeOf();
  const byTestId = await renderWithMesa(<KnowledgeContext project="lantern-cove" />, bridge);
  expect(calls).toContainEqual([
    '--json',
    'receipts',
    '--kind',
    'decision',
    '--project',
    'lantern-cove',
  ]);
  const panel = byTestId('knowledge-context')[0];
  const text = panel?.textContent ?? '';
  expect(text).toContain('The flake was the wall clock at midnight');
  expect(text).toContain('by a1b2c3d4');
  // Newest first: the note, then the decision, each with the note it names as its target.
  expect(text.indexOf('Saved note Tide table sources')).toBeLessThan(
    text.indexOf('Saved decision Fixed clock'),
  );
  const decisionNote = 'wiki/decisions/2026-09-24-fixed-clock-in-tide-tests.md';
  expect(text).toContain(decisionNote);
  expect(text).not.toContain(decision.path);
  await click(
    panel?.querySelector<HTMLButtonElement>(`[aria-label="Open ${decisionNote} in Obsidian"]`) ??
      undefined,
  );
  await click(
    panel?.querySelector<HTMLButtonElement>(
      '[aria-label="Open wiki/notes/tide-table-sources.md in Obsidian"]',
    ) ?? undefined,
  );
  expect(calls).toContainEqual(['--json', 'vault', 'open', '--', decisionNote]);
  expect(calls).toContainEqual([
    '--json',
    'vault',
    'open',
    '--',
    'wiki/notes/tide-table-sources.md',
  ]);
});

test('a session panel asks for that session only', async () => {
  const { bridge, calls } = bridgeOf();
  await renderWithMesa(<KnowledgeContext session="a1b2c3d4" />, bridge);
  expect(calls).toContainEqual([
    '--json',
    'receipts',
    '--kind',
    'decision',
    '--session',
    'a1b2c3d4',
  ]);
  expect(calls).toContainEqual([
    '--json',
    'receipts',
    '--kind',
    'vault-change',
    '--session',
    'a1b2c3d4',
  ]);
});
