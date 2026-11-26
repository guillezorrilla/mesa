import { expect, test } from 'vitest';
import { deployBefore, revisionLabel, startedAfter } from './deploy-marks.js';
import type { CloudDeploy } from './deploys.js';

const deploy = (service: string, revision: string, at: string): CloudDeploy => ({
  project: 'tide-tables-123',
  service,
  revision,
  at,
  source: 'cloud-run',
});
const DEPLOYS = [
  deploy('api-2', 'api-2-00212-kel', '2026-05-06T07:00:00Z'),
  deploy('api-2', 'api-2-00213-xoz', '2026-05-06T07:40:00Z'),
  deploy('tide-worker', 'b2b2c3', '2026-05-06T07:41:00Z'),
];
const group = (services: string[], firstSeen: string) => ({
  project: 'tide-tables-123',
  services,
  firstSeen,
});

test('a Cloud Run revision reads as its number, any other revision whole', () => {
  expect(revisionLabel(deploy('api-2', 'api-2-00213-xoz', ''))).toBe('00213');
  expect(revisionLabel(deploy('tide-worker', 'b2b2c3', ''))).toBe('b2b2c3');
  expect(revisionLabel(deploy('api-2', '20260506t071500', ''))).toBe('20260506t071500');
});

test('an error group that started within 15 minutes after a deploy of its service says so, the latest deploy first', () => {
  expect(startedAfter(group(['api-2'], '2026-05-06T07:42:10Z'), DEPLOYS)).toBe(
    'started 2 min after api-2 rev 00213',
  );
  expect(startedAfter(group(['api-2'], '2026-05-06T07:40:20Z'), DEPLOYS)).toBe(
    'started under a minute after api-2 rev 00213',
  );
  // Past the window, before the deploy, another service, or another project: nothing.
  expect(deployBefore(group(['api-2'], '2026-05-06T07:56:00Z'), DEPLOYS)).toBeUndefined();
  expect(deployBefore(group(['api-2'], '2026-05-06T06:59:00Z'), DEPLOYS)).toBeUndefined();
  expect(deployBefore(group(['harbour-web'], '2026-05-06T07:42:00Z'), DEPLOYS)).toBeUndefined();
  expect(
    deployBefore(
      { ...group(['api-2'], '2026-05-06T07:42:00Z'), project: 'harbour-web-456' },
      DEPLOYS,
    ),
  ).toBeUndefined();
});
