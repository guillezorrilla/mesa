import { expect, test } from 'vitest';
import { sourceLabel, sourceStateText } from './source-id.js';

test('a source reads as its kind and name, and its state as live or when it printed last', () => {
  const now = Date.parse('2026-05-06T07:10:00Z');
  expect(sourceLabel({ kind: 'file', name: 'tide-api' })).toBe('File · tide-api');
  expect(sourceLabel({ kind: 'docker', name: 'redis' })).toBe('Docker · redis');
  expect(sourceStateText({ state: 'live', lastLine: '2026-05-06T07:09:59Z' }, now)).toBe('live');
  expect(sourceStateText({ state: 'quiet', lastLine: '2026-05-06T07:05:00Z' }, now)).toBe(
    'last line 5m ago',
  );
  expect(sourceStateText({ state: 'stopped', lastLine: '2026-05-06T07:05:00Z' }, now)).toBe(
    'stopped, last line 5m ago',
  );
  expect(sourceStateText({ state: 'quiet', lastLine: null }, now)).toBe('no lines yet');
});
