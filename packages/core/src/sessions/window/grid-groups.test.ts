import { expect, test } from 'vitest';
import { projectProfile, scriptedRunner, thrown } from '../../testing/index.js';

test('named grid groups save, update and remove in profile config', () => {
  const { mesa } = projectProfile(scriptedRunner().run);
  expect(mesa.grid.list()).toEqual([]);
  const first = mesa.grid.save({
    name: ' Review ',
    project: 'lantern-cove',
    sessions: ['aaaaaaaa', 'aaaaaaaa'],
  });
  expect(first.result.groups).toEqual([
    { name: 'Review', project: 'lantern-cove', sessions: ['aaaaaaaa'] },
  ]);
  expect(mesa.config.get().grid.groups).toEqual(first.result.groups);
  expect(mesa.grid.save({ name: 'review', sessions: ['bbbbbbbb'] }).result.groups).toEqual([
    { name: 'review', sessions: ['bbbbbbbb'] },
  ]);
  expect(thrown(() => mesa.grid.save({ name: ' ', sessions: ['aaaaaaaa'] })).code).toBe('usage');
  expect(thrown(() => mesa.grid.save({ name: 'bad', sessions: ['ext-1234'] })).code).toBe(
    'invalid_config',
  );
  expect(mesa.grid.list()).toHaveLength(1);
  expect(mesa.grid.remove('review').result.groups).toEqual([]);
  expect(thrown(() => mesa.grid.remove('review')).code).toBe('not_found');
});
