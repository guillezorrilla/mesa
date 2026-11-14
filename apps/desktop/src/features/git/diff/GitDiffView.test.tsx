// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { GitDiffView } from './GitDiffView';

const checkout = { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true };
const context = (line: number) => ({
  kind: 'context',
  left: `line ${line}`,
  right: `line ${line}`,
  oldLine: line,
  newLine: line,
});
// Changes at lines 2 and 18 of 20, ten unchanged lines apart: two hunks, as Git splits them.
const rows = [
  context(1),
  { kind: 'change', left: 'line 2', right: 'high water', oldLine: 2, newLine: 2 },
  ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(context),
  { kind: 'change', left: 'line 18', right: 'low water', oldLine: 18, newLine: 18 },
  context(19),
  context(20),
];
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? undefined;

test.each([
  [false, 'Stage hunk 2', 'stage'],
  [true, 'Unstage hunk 2', 'unstage'],
])('staged %s: %s sends that hunk with the range it showed', async (staged, label, verb) => {
  let changed = 0;
  const { bridge, calls } = fakeBridge({
    'git diff': () => envelope({ checkout, staged, path: 'tide.md', patch: '', rows }),
    [`git ${verb}`]: () => envelope({ checkout, path: 'tide.md', action: verb, hunk: 1 }),
  });
  await renderWithMesa(
    <GitDiffView
      project="lantern-cove"
      path="tide.md"
      staged={staged}
      untracked={false}
      layout="side-by-side"
      fontSize={13}
      onChanged={() => changed++}
    />,
    bridge,
  );
  expect(document.body.textContent).toContain('@@ -1,5 +1,5 @@');
  expect(document.body.textContent).toContain('@@ -15,6 +15,6 @@');
  await click(button(label));
  expect(calls).toContainEqual([
    '--json',
    'git',
    verb,
    '--hunk',
    '1',
    '--expect=-15,6 +15,6',
    '--',
    'lantern-cove',
    'tide.md',
  ]);
  expect(changed).toBe(1);
});
