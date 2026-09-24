import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { setConfigValue } from './config.js';
import { ulidSource } from './ids.js';
import { createMesa } from './mesa.js';
import { EXAMPLES } from './receipts.examples.js';
import {
  actionRecorder,
  listReceipts,
  redactCommand,
  showReceipt,
  writeReceipt,
} from './receipts.js';
import { fixedClock, sequentialIds, steppingClock, tempDir, testDeps, thrown } from './testing.js';

let vault: string;
beforeEach(() => {
  vault = join(tempDir(), 'vault');
  mkdirSync(vault);
});

const golden = (type: string) => new URL(`golden/receipt-${type}.md`, import.meta.url);
const deps = () => ({
  vault,
  clock: fixedClock('2026-09-24T12:00:00.000Z'),
  newId: sequentialIds(),
});

test.each(Object.keys(EXAMPLES))('the %s receipt matches its golden file', (type) => {
  const example = EXAMPLES[type as keyof typeof EXAMPLES];
  const { path } = writeReceipt(deps(), example);
  const written = readFileSync(join(vault, path), 'utf8');
  if (process.env.UPDATE_GOLDEN) writeFileSync(golden(type), written);
  expect(written).toBe(readFileSync(golden(type), 'utf8'));
  expect(path).toMatch(
    new RegExp(`^receipts/2026/09/2026092\\dT\\d{6}Z-${type}-01TEST0{19}1\\.md$`),
  );
});

test('docs/receipts.md shows every golden file', () => {
  const docs = readFileSync(new URL('../../../docs/receipts.md', import.meta.url), 'utf8');
  for (const type of Object.keys(EXAMPLES)) {
    expect(docs).toContain(readFileSync(golden(type), 'utf8').trimEnd());
  }
});

test('write then read returns the same receipt, newest first, limited', () => {
  const d = {
    vault,
    clock: steppingClock('2026-09-24T12:00:00.000Z', 60_000),
    newId: sequentialIds(),
  };
  const written = ['action', 'skill', 'decision'].map((type) =>
    writeReceipt(d, EXAMPLES[type as keyof typeof EXAMPLES]),
  );
  const listed = listReceipts(vault, 20);
  expect(listed.map((e) => e.receipt.type)).toEqual(['decision', 'skill', 'action']);
  expect(listed[2]?.receipt).toEqual(written[0]?.receipt);
  expect(listed[2]?.summary).toBe('Registered project lantern-cove');
  expect(listReceipts(vault, 1)).toHaveLength(1);
  expect(showReceipt(vault, written[1]?.receipt.id ?? '').receipt).toEqual(written[1]?.receipt);
  expect(thrown(() => showReceipt(vault, '01NOPE')).code).toBe('not_found');
});

test('an invalid receipt is refused before anything is written', () => {
  const bad = { ...EXAMPLES.action, status: 'maybe' as 'ok' };
  expect(thrown(() => writeReceipt(deps(), bad)).code).toBe('invalid_config');
  expect(listReceipts(vault)).toEqual([]);
});

test('ULIDs are 26 Crockford characters that sort by time', () => {
  const clock = steppingClock('2026-09-24T12:00:00.000Z', 1);
  const next = ulidSource(clock, (n) => new Uint8Array(n).fill(255));
  const [a, b] = [next(), next()];
  expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(a < (b ?? '')).toBe(true);
  expect(a.slice(10)).toBe('ZZZZZZZZZZZZZZZZ');
});

test('the recorded command line redacts key values', () => {
  expect(redactCommand(['config', 'set', 'keys.jev', 'sk-secret'])).toBe(
    'mesa config set keys.jev ***',
  );
  expect(redactCommand(['config', 'set', 'keys', '{jev: sk}'])).toBe('mesa config set keys ***');
  expect(redactCommand(['send', 'use sk-live-1'], ['sk-live-1'])).toBe('mesa send "use ***"');
  expect(redactCommand(['log', 'abc'], ['ab'])).toBe('mesa log abc');
  expect(redactCommand(['send', 'sk-live-1'], ['sk-live-1'])).toBe('mesa send ***');
  expect(redactCommand(['log', 'two words'])).toBe('mesa log "two words"');
});

test('a decision keeps the shape of its primitive', () => {
  const decision = (d: object) => ({ ...EXAMPLES.decision, decisions: [d] });
  const choice = {
    question: 'q',
    kind: 'Choice',
    answer: 'a',
    probabilities: { a: 1 },
    confidence: 0.9,
    backend: 'rules',
  };
  expect(() => writeReceipt(deps(), decision(choice) as typeof EXAMPLES.decision)).not.toThrow();
  const bad = [
    { ...choice, confidence: undefined },
    { ...choice, probabilities: 0.4 },
    { question: 'q', kind: 'Noul', answer: 'yes', probabilities: 0.5, backend: 'rules' },
  ];
  for (const d of bad) {
    expect(thrown(() => writeReceipt(deps(), decision(d) as typeof EXAMPLES.decision)).code).toBe(
      'invalid_config',
    );
  }
});

test('within one second, receipts sort by time, and stray files are skipped', () => {
  const at = (iso: string) => ({ vault, clock: fixedClock(iso), newId: sequentialIds() });
  // ULIDs from real time, so the id orders by the millisecond as the started stamp does.
  const early = writeReceipt(
    {
      ...at('2026-09-24T12:00:00.100Z'),
      newId: ulidSource(fixedClock('2026-09-24T12:00:00.100Z'), (n) => new Uint8Array(n)),
    },
    { ...EXAMPLES.session, started: '2026-09-24T12:00:00.100Z' },
  );
  const late = writeReceipt(
    {
      ...at('2026-09-24T12:00:00.900Z'),
      newId: ulidSource(fixedClock('2026-09-24T12:00:00.900Z'), (n) => new Uint8Array(n)),
    },
    { ...EXAMPLES.action, started: '2026-09-24T12:00:00.900Z' },
  );
  writeFileSync(join(vault, 'receipts', '2026', '09', 'notes.md'), 'not a receipt\n');
  expect(listReceipts(vault).map((e) => e.receipt.id)).toEqual([late.receipt.id, early.receipt.id]);
});

test('the recorder records success, failure, and nothing-changed, and never fails the action', () => {
  const record = actionRecorder({
    profile: 'default',
    vault: () => vault,
    clock: fixedClock(),
    newId: sequentialIds(),
    command: () => 'mesa x',
  });
  const ok = record({ summary: (n: number) => `did ${n}`, failure: 'no', inputs: {} }, () => 7);
  expect(ok).toMatchObject({ result: 7, receipt: { id: expect.stringMatching(/^01TEST/) } });

  const boom = () =>
    record({ summary: () => 'x', failure: 'Could not do it', inputs: { a: 1 } }, () => {
      throw new Error('boom');
    });
  expect(boom).toThrow('boom');
  const [failed] = listReceipts(vault).filter((e) => e.receipt.status === 'failed');
  expect(failed?.summary).toBe('Could not do it');
  expect(failed?.receipt.outputs).toEqual({ error: { code: 'internal', message: 'boom' } });

  const none = record(
    { summary: () => 'x', failure: 'x', inputs: {}, changed: () => false },
    () => 1,
  );
  expect(none).toEqual({ result: 1, receipt: null });

  // Not a vault: the action still runs and succeeds; the receipt becomes a warning.
  writeFileSync(join(vault, 'README.md'), 'a repo\n');
  const repo = join(vault, 'repo');
  mkdirSync(repo);
  writeFileSync(join(repo, 'README.md'), 'a repo\n');
  const elsewhere = actionRecorder({
    profile: 'default',
    vault: () => repo,
    clock: fixedClock(),
    newId: sequentialIds(),
    command: () => 'mesa x',
  });
  const warned = elsewhere({ summary: () => 'x', failure: 'x', inputs: {} }, () => 'done');
  expect(warned).toEqual({
    result: 'done',
    receipt: null,
    warning: `no receipt: ${repo} is not a vault; run mesa vault init`,
  });
  expect(() => readFileSync(join(repo, 'receipts'))).toThrow();
});

test('an env: key value is redacted in the recorded command', () => {
  const home = tempDir();
  const argv = ['init', '--vault', 'vault'];
  const mesa = createMesa('default', testDeps(home, { argv, env: { JEV: 'sk-from-env' } }));
  mesa.init({ vault: 'vault' });
  setConfigValue(join(home, '.mesa/default/config.yaml'), 'keys.jev', 'env:JEV');
  const again = createMesa(
    'default',
    testDeps(home, { argv: ['log', 'token sk-from-env'], env: { JEV: 'sk-from-env' } }),
  );
  mkdirSync(join(home, 'tide'));
  const { receipt } = again.projects.register('tide', true);
  expect(receipt).not.toBeNull();
  const [entry] = again.receipts.list(1);
  expect(entry?.receipt.command).toBe('mesa log "token ***"');
});
