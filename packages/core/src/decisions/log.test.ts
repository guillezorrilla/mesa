import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { movableClock, sequentialIds, tempDir } from '../testing/index.js';
import { decisionLog, type NewDecision } from './log.js';

const entry = (over: Partial<NewDecision> = {}): NewDecision => ({
  site: 'supervision',
  session: 's1',
  project: 'lantern-cove',
  question: 'What state is this session in?',
  rules: 'idle',
  answer: 'waiting-question',
  by: 'clef',
  status: 'accepted',
  changed: true,
  ...over,
});

test('appends one private line per entry in its month and reads them back newest first', () => {
  const dir = join(tempDir(), 'decision-log');
  const time = movableClock('2026-09-30T23:00:00.000Z');
  const log = decisionLog({ dir, clock: time.clock, newId: sequentialIds() });
  log.append(entry({ session: 's1' }));
  time.set('2026-10-02T09:00:00.000Z');
  log.append(entry({ session: 's2', project: 'harbor', site: 'guardrail', by: 'rules' }));

  expect(readFileSync(join(dir, '2026-09.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
  expect(statSync(join(dir, '2026-10.jsonl')).mode & 0o777).toBe(0o600);
  const all = log.read();
  expect(all.map((e) => [e.session, e.at])).toEqual([
    ['s2', '2026-10-02T09:00:00.000Z'],
    ['s1', '2026-09-30T23:00:00.000Z'],
  ]);
  expect(all[1]).toMatchObject({ id: expect.any(String), rules: 'idle', changed: true });
});

test('reads by since, session and project, and skips a line that does not parse', () => {
  const dir = join(tempDir(), 'decision-log');
  const time = movableClock('2026-10-01T08:00:00.000Z');
  const log = decisionLog({ dir, clock: time.clock, newId: sequentialIds() });
  log.append(entry({ session: 'old' }));
  time.set('2026-10-05T08:00:00.000Z');
  log.append(entry({ session: 'a', project: 'harbor' }));
  log.append(entry({ session: 'b', project: 'lantern-cove' }));
  appendFileSync(join(dir, '2026-10.jsonl'), 'not json\n{"id":"x"}\n');
  writeFileSync(join(dir, 'notes.txt'), 'ignored');

  const since = new Date('2026-10-03T00:00:00.000Z');
  expect(log.read({ since }).map((e) => e.session)).toEqual(['b', 'a']);
  expect(log.read({ session: 'a' }).map((e) => e.project)).toEqual(['harbor']);
  expect(log.read({ project: 'lantern-cove' }).map((e) => e.session)).toEqual(['b', 'old']);
});

test('an append that cannot be written never throws', () => {
  const file = join(tempDir(), 'a-file');
  writeFileSync(file, '');
  const log = decisionLog({ dir: file, clock: () => new Date(), newId: sequentialIds() });
  expect(() => log.append(entry())).not.toThrow();
  const none = decisionLog({
    dir: join(tempDir(), 'none'),
    clock: () => new Date(),
    newId: sequentialIds(),
  });
  expect(none.read()).toEqual([]);
});
