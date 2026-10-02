import { expect, test } from 'vitest';
import { byFolder, gitSections, listOrder } from './gitChanges';

const changes = [
  { path: 'src/b.ts', index: 'M', workingTree: 'M' },
  { path: 'README.md', index: ' ', workingTree: 'M' },
  { path: '.codex/agents/a.toml', index: '?', workingTree: '?' },
  { path: 'src/a.ts', index: 'A', workingTree: ' ' },
];

test('a change staged and edited again is listed in both sections; untracked only in Changes', () => {
  const [staged, unstaged] = gitSections(changes, '');
  expect(staged?.entries.map((entry) => [entry.change.path, entry.code])).toEqual([
    ['src/b.ts', 'M'],
    ['src/a.ts', 'A'],
  ]);
  expect(unstaged?.entries.map((entry) => [entry.change.path, entry.code])).toEqual([
    ['src/b.ts', 'M'],
    ['README.md', 'M'],
    ['.codex/agents/a.toml', '?'],
  ]);
});

test('folders group sorted with root files first, and the filter drops empty sections', () => {
  const [, unstaged] = gitSections(changes, '');
  expect(byFolder(unstaged?.entries ?? []).map(([folder]) => folder)).toEqual([
    '',
    '.codex/agents/',
    'src/',
  ]);
  const filtered = gitSections(changes, 'README');
  expect(filtered.map((section) => section.title)).toEqual(['Changes']);
  expect(listOrder(gitSections(changes, '')).map((entry) => entry.change.path)).toEqual([
    'src/a.ts',
    'src/b.ts',
    'README.md',
    '.codex/agents/a.toml',
    'src/b.ts',
  ]);
});
