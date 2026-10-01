import { expect, test } from 'vitest';
import { diffRows } from './diff.js';

test('a removed SQL comment or YAML fence inside a hunk is a change, not a file header', () => {
  const patch = [
    'diff --git a/q.sql b/q.sql',
    '--- a/q.sql',
    '+++ b/q.sql',
    '@@ -1,2 +1,2 @@',
    '--- old comment',
    '+-- new comment',
    ' select 1;',
    '---',
    '+++',
  ].join('\n');
  expect(diffRows(patch)).toEqual([
    { kind: 'meta', left: 'diff --git a/q.sql b/q.sql', right: 'diff --git a/q.sql b/q.sql' },
    { kind: 'meta', left: '--- a/q.sql', right: '--- a/q.sql' },
    { kind: 'meta', left: '+++ b/q.sql', right: '+++ b/q.sql' },
    { kind: 'meta', left: '@@ -1,2 +1,2 @@', right: '@@ -1,2 +1,2 @@' },
    { kind: 'change', left: '-- old comment', right: '-- new comment', oldLine: 1, newLine: 1 },
    { kind: 'context', left: 'select 1;', right: 'select 1;', oldLine: 2, newLine: 2 },
    { kind: 'change', left: '--', right: '++', oldLine: 3, newLine: 3 },
  ]);
});

test('rows carry the file line of each side, and a one-sided change numbers only its own side', () => {
  const patch = ['@@ -7,3 +7,3 @@', ' keep', '-gone', ' also', '+added'].join('\n');
  expect(diffRows(patch).slice(1)).toEqual([
    { kind: 'context', left: 'keep', right: 'keep', oldLine: 7, newLine: 7 },
    { kind: 'change', left: 'gone', right: '', oldLine: 8 },
    { kind: 'context', left: 'also', right: 'also', oldLine: 9, newLine: 8 },
    { kind: 'change', left: '', right: 'added', newLine: 9 },
  ]);
});
