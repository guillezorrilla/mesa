import { expect, test } from 'vitest';
import type { UpdateStatus } from '@/lib/platform';
import { describeUpdate } from './useUpdate';

const status = (change: Partial<UpdateStatus>): UpdateStatus => ({
  phase: 'idle',
  version: null,
  channel: 'beta',
  message: null,
  page: 'https://github.com/guillezorrilla/mesa/releases',
  revoked: null,
  dismissed: false,
  ...change,
});

test('describeUpdate has a line for every phase the updater reports', () => {
  const lines: [Partial<UpdateStatus> | undefined, string][] = [
    [undefined, 'Mesa checks for updates at launch and every 4 hours.'],
    [{ phase: 'idle' }, 'Mesa checks for updates at launch and every 4 hours.'],
    [{ phase: 'checking' }, 'Checking for updates...'],
    [{ phase: 'downloading', version: '0.1.0-beta.5' }, 'Downloading v0.1.0-beta.5...'],
    [{ phase: 'ready', version: '0.1.0-beta.5' }, 'v0.1.0-beta.5 is ready to install.'],
    [{ phase: 'up-to-date' }, 'Mesa is up to date.'],
    [
      { phase: 'unsupported', version: '0.1.0-beta.5', message: 'This is a development build.' },
      'v0.1.0-beta.5 is available. This is a development build.',
    ],
    [{ phase: 'failed', message: 'HTTP 503' }, 'HTTP 503'],
    [{ phase: 'failed' }, 'The update check failed.'],
  ];
  for (const [change, line] of lines) expect(describeUpdate(change && status(change))).toBe(line);
});

test('a revoked version is never called up to date', () => {
  const revoked = { version: '0.1.0-beta.4', reason: 'It loses session logs.' };
  expect(describeUpdate(status({ phase: 'up-to-date', revoked }))).toBe(
    'No newer version is published yet.',
  );
});
