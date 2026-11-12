import { expect, test } from 'vitest';
import { aboutRows } from './aboutRows';

const FACTS = {
  version: '0.1.0',
  build: '7',
  runtimeVersion: '3f2a9c41d0e7b55a',
  channel: 'production',
  updateId: '9b1e4c2a-7f3d-4e8a-9c0b-1d2e3f4a5b6c',
  embedded: false,
};

test('the rows name the build, its runtime and the update running now', () => {
  expect(aboutRows(FACTS)).toEqual([
    { label: 'Version', value: '0.1.0' },
    { label: 'Build', value: '7' },
    { label: 'Runtime', value: '3f2a9c41' },
    { label: 'Channel', value: 'production' },
    { label: 'Update', value: '9b1e4c2a' },
  ]);
});

test('a build running its own bundle, or a dev run with nothing known, says so', () => {
  expect(aboutRows({ ...FACTS, embedded: true }).at(-1)).toEqual({
    label: 'Update',
    value: 'Shipped with this build',
  });
  expect(
    aboutRows({
      version: null,
      build: null,
      runtimeVersion: null,
      channel: null,
      updateId: null,
      embedded: true,
    }).map((row) => row.value),
  ).toEqual(['Unknown', 'Unknown', 'Unknown', 'None', 'Shipped with this build']);
  expect(aboutRows({ ...FACTS, channel: '' })[3]).toEqual({ label: 'Channel', value: 'None' });
});
