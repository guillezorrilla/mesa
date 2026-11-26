import { expect, test } from 'vitest';
import { askCloudLogs, askInput, codeProject } from './ask.js';
import type { CloudLogEntry } from './gcp.js';
import type { RangeFacts } from './range-summary.js';

const entry = (id: string, message: string): CloudLogEntry => ({
  project: 'tide-tables-123',
  id,
  time: '2026-05-06T07:00:00Z',
  severity: 'ERROR',
  service: 'tide-api',
  message,
  trace: null,
  fields: {},
});

const RANGE: RangeFacts = {
  since: '1h',
  errors: { groups: [] },
  volume: { failed: 'no token' },
  deploys: { deploys: [], notes: [] },
};

test("the run's stdin puts the range summary first, then samples, then the page of entries, all within one byte budget", () => {
  const entries = Array.from({ length: 400 }, (_, i) => entry(`e${i}`, 'x'.repeat(400)));
  const input = askInput('what fails?', { filter: 'severity>=ERROR', entries, range: RANGE });
  const summary = input.indexOf('The range, summarised over its whole span:');
  const samples = input.indexOf('A few samples of each error group');
  const page = input.indexOf('The entries, newest first');
  expect(summary).toBeGreaterThan(0);
  expect(samples).toBeGreaterThan(summary);
  expect(page).toBeGreaterThan(samples);
  // Only as many entries as 60 KB holds, the newest first, said as n of m.
  expect(input).toMatch(/The entries, newest first, one JSON object a line \((\d+) of 400\)/);
  const shown = Number(/\((\d+) of 400\)/.exec(input)?.[1]);
  expect(shown).toBeGreaterThan(50);
  expect(shown).toBeLessThan(400);
  expect(Buffer.byteLength(input)).toBeLessThan(62_000);
  expect(input).toContain('"id":"e0"');
});

test('an oversized range summary is cut, so the page of entries keeps its share of the budget', () => {
  const groups = Array.from({ length: 20 }, (_, i) => ({
    project: 'tide-tables-123',
    id: `g${i}`,
    message: 'DockFailed',
    sample: 'DockFailed',
    count: 1,
    firstSeen: '',
    lastSeen: '',
    services: Array.from({ length: 300 }, (_, s) => `tide-worker-${s}`),
    badge: null,
    source: 'logs' as const,
  }));
  const entries = Array.from({ length: 50 }, (_, i) => entry(`e${i}`, 'x'.repeat(200)));
  const input = askInput('why?', {
    filter: '',
    entries,
    range: { ...RANGE, errors: { groups } },
  });
  expect(input).toContain('... (the summary was cut here)');
  expect(input).toMatch(/The entries, newest first, one JSON object a line \((\d+) of 50\)/);
  expect(Number(/\((\d+) of 50\)/.exec(input)?.[1])).toBeGreaterThan(20);
  expect(Buffer.byteLength(input)).toBeLessThan(62_000);
});

test('the run is told which folder holds the code it may read', () => {
  const input = askInput('why?', {
    filter: '',
    entries: [],
    code: { name: 'lantern-cove', path: '/src/lantern-cove' },
  });
  expect(input).toContain(
    'The code of lantern-cove, the project behind these services, is in /src/lantern-cove',
  );
  expect(askInput('why?', { filter: '', entries: [] })).not.toContain('The code of');
});

test('an entry the model reads keeps its root cause: its stack is folded, never cut at the tail', () => {
  const frames = Array.from(
    { length: 200 },
    (_, i) => `\tat org.springframework.F${i}.run(F.java:1)`,
  );
  const message = [
    'DockFailed',
    ...frames,
    'Caused by: BerthMissing: berth 7',
    '\tat com.harbour.Dock.moor(Dock.java:4)',
  ].join('\n');
  const input = askInput('why?', { filter: '', entries: [entry('a1', message)] });
  expect(input).toContain('Caused by: BerthMissing: berth 7');
  expect(input).toContain('Dock.java:4');
  expect(input).not.toContain('F12.run');
});

test('the code an Ask reads is the project most of the services map to, never General', () => {
  const map = {
    'tide-tables-123/tide-api': 'lantern-cove',
    'tide-tables-123/tide-worker': 'tide-pool',
    'harbour-web-456/harbour-web': '__mesa_general__',
  };
  expect(codeProject(map, ['tide-tables-123/tide-api'])).toBe('lantern-cove');
  expect(
    codeProject(map, [
      'tide-tables-123/tide-worker',
      'tide-tables-123/tide-worker',
      'tide-tables-123/tide-api',
    ]),
  ).toBe('tide-pool');
  expect(codeProject(map, ['harbour-web-456/harbour-web', 'harbour-web-456/-'])).toBeUndefined();
  expect(codeProject(map, ['constructor', '__proto__'])).toBeUndefined();
  // One named wins, general for none.
  expect(codeProject(map, ['tide-tables-123/tide-api'], 'tide-pool')).toBe('tide-pool');
  expect(codeProject(map, ['tide-tables-123/tide-api'], 'general')).toBeUndefined();
});

test('Ask runs cloud-logs in General with the code folder it reads, the model the profile names, and says its run once started', async () => {
  const calls: unknown[] = [];
  const started: string[] = [];
  const code = { name: 'lantern-cove', path: '/src/lantern-cove' };
  const done = await askCloudLogs(
    async (skill, opts) => {
      calls.push({ skill, project: opts.project, code: opts.code, model: opts.model });
      opts.onStart?.('run7');
      return {
        result: {
          session: 'run7',
          ok: true,
          output: 'Berth 7 [a1].',
          durationMs: 4200,
          costUsd: 0.31,
        },
      };
    },
    'why?',
    { filter: '', entries: [entry('a1', 'DockFailed')], code },
    [],
    { model: 'claude-opus-5-5', onStart: (session) => started.push(session) },
  );
  expect(calls).toEqual([
    { skill: 'cloud-logs', project: '__mesa_general__', code, model: 'claude-opus-5-5' },
  ]);
  expect(started).toEqual(['run7']);
  expect(done.run).toEqual({
    session: 'run7',
    durationMs: 4200,
    costUsd: 0.31,
    model: 'claude-opus-5-5',
  });
});
