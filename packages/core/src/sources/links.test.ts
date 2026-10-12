import { expect, test } from 'vitest';
import { resolveLink } from './links.js';

// Invented sites: one Atlassian site, a Linear workspace, and two ClickUp Workspaces.
const ATLASSIAN = [
  { id: 'cloud-1', name: 'lantern-cove', url: 'https://lantern-cove.atlassian.net' },
];
const LINEAR = [{ id: 'org-1', name: 'Lantern Cove', url: 'https://linear.app/lantern-cove' }];
const DOCKS = { id: '9001', name: 'Docks', url: 'https://app.clickup.com/9001' };
const PIERS = { id: '9002', name: 'Piers', url: 'https://app.clickup.com/9002' };

test('a bare key is Jira while Atlassian is connected, else the one of Linear and ClickUp that is', () => {
  expect(resolveLink('HAR-12', { atlassian: ATLASSIAN, linear: LINEAR })).toMatchObject({
    source: 'jira',
    id: 'HAR-12',
  });
  expect(resolveLink('HAR-12', { linear: LINEAR })).toMatchObject({
    source: 'linear',
    id: 'HAR-12',
    url: 'https://linear.app/lantern-cove/issue/HAR-12',
  });
  expect(resolveLink('DOCK-112', { clickup: [DOCKS] })).toMatchObject({
    source: 'clickup',
    id: 'DOCK-112',
    url: 'https://app.clickup.com/t/9001/DOCK-112',
  });
  expect(() => resolveLink('HAR-12', { linear: LINEAR, clickup: [DOCKS] })).toThrow(
    'HAR-12 could be a Linear or a ClickUp key: pass linear:HAR-12, clickup:HAR-12 or its link',
  );
  expect(() => resolveLink('HAR-12', {})).toThrow(
    'Atlassian is not connected: run mesa sources connect atlassian',
  );
});

test('a ticket id names its tracker, whatever else is connected', () => {
  const all = { atlassian: ATLASSIAN, linear: LINEAR, clickup: [DOCKS] };
  expect(resolveLink('linear:HAR-12', all)).toMatchObject({ source: 'linear', id: 'HAR-12' });
  expect(resolveLink('clickup:DOCK-112', all)).toMatchObject({ source: 'clickup', id: 'DOCK-112' });
  expect(resolveLink('clickup:86abc123', all)).toMatchObject({
    source: 'clickup',
    url: 'https://app.clickup.com/t/86abc123',
  });
  expect(resolveLink('jira:LC-12', all)).toMatchObject({ source: 'jira', id: 'LC-12' });
  expect(resolveLink('github:harbor-co/harbor-api#421', { github: [] })).toMatchObject({
    source: 'github',
    id: 'harbor-co/harbor-api/421',
  });
  expect(resolveLink(' linear: HAR-12 ', all)).toMatchObject({ source: 'linear', id: 'HAR-12' });
  expect(resolveLink('https://example.test/tides', all)).toMatchObject({ source: 'web' });
  expect(() => resolveLink('jira:', all)).toThrow('jira: names no ticket key');
  expect(() => resolveLink('linear:HAR-12/../project/x', all)).toThrow(
    'HAR-12/../project/x is not a Linear issue identifier',
  );
  // Only a tracker's name before a colon makes a ticket id.
  expect(() => resolveLink('linearX', all)).toThrow('linearX is not a link or a ticket key');
  expect(() => resolveLink('jira:LC-12', { linear: LINEAR })).toThrow(
    'Atlassian is not connected: run mesa sources connect atlassian',
  );
  expect(() => resolveLink('linear:HAR-12', { atlassian: ATLASSIAN })).toThrow(
    'Linear is not connected: run mesa sources connect linear',
  );
  // A custom id is read within one Workspace, so two connected ones need the link.
  expect(() => resolveLink('clickup:DOCK-112', { clickup: [DOCKS, PIERS] })).toThrow(
    "DOCK-112 could be in any of Docks, Piers: paste the task's link instead",
  );
});
