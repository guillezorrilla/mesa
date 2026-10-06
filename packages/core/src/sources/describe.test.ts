import { expect, test } from 'vitest';
import { describeSource, siteNames } from './describe.js';
import type { SourceRow } from './service.js';

const row = (extra: Partial<SourceRow>): SourceRow => ({
  id: 'atlassian',
  label: 'Atlassian',
  connected: true,
  status: 'connected',
  ...extra,
});
const sites = [
  { id: 'a', name: 'Lantern Cove', url: 'https://lantern.example' },
  { id: 'b', name: 'Tide Pool', url: 'https://tide.example' },
];

test('a source names its sites, and says what its connection is', () => {
  expect(siteNames(row({ sites }))).toBe('Lantern Cove, Tide Pool');
  expect(siteNames(row({}))).toBeUndefined();
  expect(describeSource(row({ status: 'disconnected', connected: false }))).toBe('Not connected');
  expect(describeSource(row({ status: 'needs-reconnect', sites }))).toBe(
    'Access was revoked or expired: reconnect to use it again. Sites: Lantern Cove, Tide Pool',
  );
  expect(describeSource(row({ account: { id: 'r', name: 'Rowan Tide' }, sites: [] }))).toBe(
    'Signed in as Rowan Tide. No sites',
  );
});
