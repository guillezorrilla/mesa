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
    { kind: 'change', left: '-- old comment', right: '-- new comment' },
    { kind: 'context', left: 'select 1;', right: 'select 1;' },
    { kind: 'change', left: '--', right: '++' },
  ]);
});
