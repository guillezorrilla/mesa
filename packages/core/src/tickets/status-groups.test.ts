import { expect, test } from 'vitest';
import { groupByStatus } from './status-groups.js';

test('tickets group by status name: in progress first, done last, a nameless one under its category', () => {
  const t = (key: string, status: string, category: string) => ({ key, status, category });
  const groups = groupByStatus([
    t('A', 'Merged', 'done'),
    t('B', 'Ready', 'indeterminate'),
    t('C', 'To Do', 'new'),
    t('D', 'In Progress', 'indeterminate'),
    t('E', 'ready', 'indeterminate'),
    t('F', '', 'new'),
    t('G', 'Odd', 'later'),
  ]);
  expect(groups.map((g) => [g.status, g.rows.map((r) => r.key).join('')])).toEqual([
    ['In Progress', 'D'],
    ['Ready', 'BE'],
    ['To Do', 'CF'],
    ['Merged', 'A'],
    ['Odd', 'G'],
  ]);
});
