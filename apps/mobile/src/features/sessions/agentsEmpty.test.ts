import { expect, test } from 'vitest';
import { agentsEmpty } from './agentsEmpty';

test('the Agents tab says why it is empty: nothing listed, or nothing matching the search or chips', () => {
  expect(agentsEmpty(0, '', false).title).toBe('No sessions yet');
  expect(agentsEmpty(0, 'tide', true).line).toContain('your Macs');
  expect(agentsEmpty(3, ' tide ', false)).toEqual({
    title: 'No session matches "tide"',
    line: 'Search reads titles, projects and what a session asks.',
  });
  expect(agentsEmpty(3, '', false).line).toBe('Clear a chip to see more.');
});
