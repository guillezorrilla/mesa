import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import type { Decision } from '../decisions/types.js';
import { ulidSource } from '../lib/ids.js';
import { MesaError } from '../lib/result.js';
import { createMesa } from '../mesa.js';
import { setConfigValue } from '../profile/config.js';
import {
  fixedClock,
  lockDeps,
  profilePaths,
  sequentialIds,
  steppingClock,
  tempDir,
  testDeps,
  thrown,
} from '../testing/index.js';
import { initVault } from '../vault/vault.js';
import { redactCommand } from './command.js';
import { EXAMPLES } from './receipts.examples.js';
import { actionRecorder } from './recorder.js';
import { listReceipts, showReceipt, writeReceipt } from './store.js';

let vault: string;
// One id source per test: two receipts drawing the same id in one second would be one file.
let ids: ReturnType<typeof sequentialIds>;
beforeEach(() => {
  vault = join(tempDir(), 'vault');
  mkdirSync(vault);
  ids = sequentialIds();
});

const golden = (type: string) => new URL(`golden/receipt-${type}.md`, import.meta.url);
const deps = () => ({
  vault,
  clock: fixedClock('2026-09-24T12:00:00.000Z'),
  newId: ids,
});

test.each(Object.keys(EXAMPLES))('the %s receipt matches its golden file', async (type) => {
  const example = EXAMPLES[type as keyof typeof EXAMPLES];
  const { path } = writeReceipt(deps(), example);
  const written = readFileSync(join(vault, path), 'utf8');
  // `vitest -u` rewrites the golden file.
  await expect(written).toMatchFileSnapshot(`golden/receipt-${type}.md`);
  expect(path).toMatch(
    new RegExp(`^receipts/2026/09/2026092\\dT\\d{6}Z-${type}-01TEST0{19}1\\.md$`),
  );
});

test('docs/receipts.md shows every golden file', () => {
  const docs = readFileSync(new URL('../../../../docs/receipts.md', import.meta.url), 'utf8');
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

test('the list keeps only the receipts of one type or one session, newest first, limited', () => {
  const home = tempDir();
  // One id source, so no two receipts share an id; the clock runs on from mesa init's.
  const newId = sequentialIds();
  const argv = ['init', '--vault', 'vault'];
  const mesa = createMesa('default', testDeps(home, { newId, argv }));
  mesa.init({ vault: 'vault' });
  const d = {
    vault: join(home, 'vault'),
    clock: steppingClock('2026-09-24T12:01:00.000Z', 60_000),
    newId,
  };
  const session = (id: string) => ({ ...EXAMPLES.session, session: id, started: undefined });
  const [a1, skill, a2, b1] = [
    session('a1b2c3'),
    { ...EXAMPLES.skill, session: 'a1b2c3' },
    { ...EXAMPLES.decision, session: 'a1b2c3' },
    session('d4e5f6'),
  ].map((r) => writeReceipt(d, r).receipt.id);
  const ids = (filter: Parameters<typeof mesa.receipts.list>[0]) =>
    mesa.receipts.list(filter).map((e) => e.receipt.id);

  expect(ids({ session: 'a1b2c3' })).toEqual([a2, skill, a1]);
  expect(ids({ type: 'session' })).toEqual([b1, a1]);
  expect(ids({ type: 'session', session: 'a1b2c3' })).toEqual([a1]);
  expect(ids({ session: 'a1b2c3', limit: 2 })).toEqual([a2, skill]);
  expect(mesa.receipts.list({ type: 'action' })).toEqual([]);
  expect(ids({ session: 'nope' })).toEqual([]);
  expect(thrown(() => mesa.receipts.list({ type: 'job' }))).toMatchObject({
    code: 'usage',
    message: "a receipt's type is one of session, skill, decision, action, not job",
  });
  expect(thrown(() => mesa.receipts.list({ limit: 0 })).code).toBe('usage');
});

test('an invalid receipt is refused before anything is written', () => {
  const bad = { ...EXAMPLES.action, status: 'maybe' as 'ok' };
  expect(thrown(() => writeReceipt(deps(), bad)).code).toBe('invalid_config');
  expect(listReceipts(vault)).toEqual([]);
});

test("a decision keeps Faro's answer and who decided it, a rules fallback too", () => {
  const decided = (backend: string) => ({
    ...EXAMPLES.decision,
    decisions: [{ ...EXAMPLES.decision.decisions?.[0], backend }],
  });
  const { receipt } = writeReceipt(deps(), decided('rules-fallback') as typeof EXAMPLES.decision);
  expect(receipt.decisions[0]?.backend).toBe('rules-fallback');
  // Receipts from before ADR-0020 name its removed adapter: they still read.
  const older = writeReceipt(deps(), decided('adapter') as typeof EXAMPLES.decision).receipt;
  expect(older.decisions[0]?.backend).toBe('adapter');
  // A Score is a position from 0 to 1, as Faro gives it.
  const score = {
    question: 'How urgent?',
    kind: 'Score',
    answer: 1.5,
    probabilities: { low: 1 },
    confidence: 1,
    backend: 'rules',
  };
  const bad = { ...EXAMPLES.decision, decisions: [score] } as unknown as typeof EXAMPLES.decision;
  expect(thrown(() => writeReceipt(deps(), bad)).code).toBe('invalid_config');
  expect(thrown(() => writeReceipt(deps(), decided('gpt') as typeof EXAMPLES.decision)).code).toBe(
    'invalid_config',
  );
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

test('the recorder keeps meaningful success and blocked decisions, and never fails the action', () => {
  const record = actionRecorder({
    profile: 'default',
    vault: () => vault,
    clock: fixedClock(),
    newId: sequentialIds(),
    command: () => 'mesa x',
    redact: (text) => text,
  });
  const ok = record(
    { kind: 'decision', summary: (n: number) => `did ${n}`, failure: 'no', inputs: {} },
    () => 7,
  );
  expect(ok).toMatchObject({ result: 7, receipt: { id: expect.stringMatching(/^01TEST/) } });

  const boom = () =>
    record(
      { kind: 'guardrail', summary: () => 'x', failure: 'Could not do it', inputs: { a: 1 } },
      () => {
        throw new MesaError('guardrail_blocked', 'blocked');
      },
    );
  expect(boom).toThrow('blocked');
  const [failed] = listReceipts(vault).filter((e) => e.receipt.status === 'blocked');
  expect(failed?.summary).toBe('Could not do it');
  expect(failed?.receipt.outputs).toEqual({
    error: { code: 'guardrail_blocked', message: 'blocked' },
  });

  const none = record(
    { kind: 'vault-change', summary: () => 'x', failure: 'x', inputs: {}, changed: () => false },
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
    redact: (text) => text,
  });
  const warned = elsewhere(
    { kind: 'decision', summary: () => 'x', failure: 'x', inputs: {} },
    () => 'done',
  );
  expect(warned).toEqual({
    result: 'done',
    receipt: null,
    warning: `no receipt: ${repo} is not a vault; run mesa vault init`,
  });
  expect(() => readFileSync(join(repo, 'receipts'))).toThrow();
});

test('routine actions leave no knowledge entry; deliberate decisions and guardrail overrides do', () => {
  initVault({ path: vault, clock: fixedClock() });
  const record = actionRecorder({
    profile: 'default',
    vault: () => vault,
    clock: fixedClock(),
    newId: sequentialIds(),
    command: () => 'mesa x',
    redact: (text) => text,
  });
  const routine = record({ summary: () => 'opened', failure: 'not opened', inputs: {} }, () => 1);
  expect(routine).toEqual({ result: 1, receipt: null });
  expect(listReceipts(vault)).toEqual([]);

  const decision = record(
    {
      kind: 'decision',
      type: 'decision',
      summary: () => 'decided',
      failure: 'not decided',
      inputs: {},
    },
    () => 2,
  );
  expect(decision.receipt?.path).toContain('decision');

  const allowed = record(
    {
      kind: 'guardrail',
      summary: () => 'sent',
      failure: 'not sent',
      inputs: {},
      outputs: () => ({}),
    },
    () => 3,
  );
  expect(allowed.receipt).toBeNull();
  const override = record(
    {
      kind: 'guardrail',
      summary: () => 'sent after override',
      failure: 'not sent',
      inputs: {},
      outputs: () => ({ override: 'yes' }),
    },
    () => 4,
  );
  expect(override.receipt?.path).toContain('action');
  expect(listReceipts(vault).map((entry) => entry.receipt.kind)).toEqual(['guardrail', 'decision']);
});

test('every decision made during an action lands in its receipt, a failed or blocked one too, to 6 decimals', () => {
  const record = actionRecorder({
    profile: 'default',
    vault: () => vault,
    clock: fixedClock(),
    newId: sequentialIds(),
    command: () => 'mesa x',
    redact: (text) => text,
  });
  const decision: Decision = {
    questions: [
      { kind: 'Choice', id: 'verdict', options: ['allow', 'block'] },
      { kind: 'Noul', id: 'harmful', statement: 'It harms' },
    ],
    // As normalising weights leaves them: float noise.
    answers: [
      {
        id: 'verdict',
        kind: 'Choice',
        answer: 'block',
        probabilities: { allow: 0.09999999999999998, block: 0.9000000000000001 },
        confidence: 0.9000000000000001,
      },
      { id: 'harmful', kind: 'Noul', answer: true, probabilities: 0.9000000000000001 },
    ],
    backend: 'rules',
    at: '2026-09-24T12:00:00.000Z',
    latencyMs: 0,
  };
  const entries = [
    {
      question: 'verdict',
      kind: 'Choice',
      answer: 'block',
      probabilities: { allow: 0.1, block: 0.9 },
      confidence: 0.9,
      backend: 'rules',
    },
    { question: 'harmful', kind: 'Noul', answer: true, probabilities: 0.9, backend: 'rules' },
  ];
  const spec = {
    kind: 'guardrail' as const,
    summary: () => 'did it',
    failure: 'Could not',
    inputs: {},
  };
  record({ ...spec, kind: 'decision' }, (decisions) => decisions.record(decision));
  expect(() =>
    record(spec, (decisions) => {
      decisions.record(decision);
      throw new MesaError('guardrail_blocked', 'blocked: it harms', { verdict: 'block' });
    }),
  ).toThrow('blocked: it harms');
  expect(() =>
    record(spec, (decisions) => {
      decisions.record(decision);
      throw new Error('boom');
    }),
  ).toThrow('boom');
  const byStatus = Object.fromEntries(listReceipts(vault).map((e) => [e.receipt.status, e]));
  expect(byStatus.ok?.receipt.decisions).toEqual(entries);
  expect(byStatus.failed).toBeUndefined();
  // Blocked, with the code and message only: the details are the decision, kept above.
  expect(byStatus.blocked?.receipt).toMatchObject({
    decisions: entries,
    outputs: { error: { code: 'guardrail_blocked', message: 'blocked: it harms' } },
  });
  expect(byStatus.blocked?.receipt.outputs.error).not.toHaveProperty('details');
  // The Decision itself stays exact.
  expect(decision.answers[1]?.probabilities).toBe(0.9000000000000001);
});

test('standalone decision receipts redact labels without losing colliding probability entries', async () => {
  const home = tempDir();
  const mesa = createMesa('default', testDeps(home));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mesa.config.set('decisions.backend', 'rules');
  mesa.config.set('keys.first', 'tide-key-0042');
  mesa.config.set('keys.second', 'tide-key-0043');
  const options = ['tide-key-0042', 'tide-key-0043', '***', 'token-choice'];
  const result = await mesa.decide({ 'tide-key-0042': home }, [
    { kind: 'Choice', id: `${home}/tide-key-0042`, options },
    { kind: 'Score', id: 'levels', levels: options },
  ]);
  const entry = showReceipt(join(home, 'vault'), result.receipt?.id ?? '');
  const text = readFileSync(join(home, 'vault', entry.path), 'utf8');
  expect(text).not.toContain('tide-key-0042');
  expect(text).not.toContain('tide-key-0043');
  expect(text).not.toContain(home);
  for (const decision of entry.receipt.decisions) {
    if (decision.kind === 'Noul') throw new Error('expected a distribution');
    expect(Object.keys(decision.probabilities)).toHaveLength(4);
    expect(Object.values(decision.probabilities)).toEqual([0.25, 0.25, 0.25, 0.25]);
    if (decision.kind === 'Choice') expect(decision.probabilities[decision.answer]).toBe(0.25);
  }
  expect(result.result.answers[0]?.answer).toBe('tide-key-0042');
});

test('an env: key value is redacted in a retained decision command', async () => {
  const home = tempDir();
  const argv = ['init', '--vault', 'vault'];
  const mesa = createMesa('default', testDeps(home, { argv, env: { JEV: 'sk-from-env' } }));
  mesa.init({ vault: 'vault' });
  setConfigValue(profilePaths(home, 'default').config, 'keys.jev', 'env:JEV', lockDeps());
  const again = createMesa(
    'default',
    testDeps(home, { argv: ['log', 'token sk-from-env'], env: { JEV: 'sk-from-env' } }),
  );
  const { receipt } = await again.decide({ text: 'sk-from-env' }, [
    { kind: 'Noul', id: 'safe', statement: 'safe' },
  ]);
  expect(receipt).not.toBeNull();
  const [entry] = again.receipts.list({ limit: 1 });
  expect(entry?.receipt.command).toBe('mesa log "token ***"');
});

test('each receipt adds a log.md line linking to it; without log.md the receipt stands, with a warning', () => {
  const bare = writeReceipt(deps(), EXAMPLES.action);
  expect(bare.warning).toMatch(/^no log line: .*log\.md not found; run mesa vault init$/);
  expect(listReceipts(vault)).toHaveLength(1);

  initVault({ path: vault, clock: fixedClock() });
  const linked = writeReceipt(
    { vault, clock: fixedClock('2026-09-24T12:30:00.000Z'), newId: sequentialIds() },
    EXAMPLES.skill,
  );
  expect(linked.warning).toBeUndefined();
  const last = readFileSync(join(vault, 'log.md'), 'utf8').trimEnd().split('\n').at(-1);
  expect(last).toBe(
    `- 2026-09-24T12:30:00.000Z Skill tidy-readme failed on lantern-cove [[${linked.path.replace(/\.md$/, '')}|receipt]]`,
  );
  const bracketed = writeReceipt(deps(), {
    ...EXAMPLES.action,
    summary: 'Touched [[wiki/x]] and ]] more',
  });
  const tail = readFileSync(join(vault, 'log.md'), 'utf8').trimEnd().split('\n').at(-1);
  expect(tail).toBe(
    `- 2026-09-24T12:00:00.000Z Touched wiki/x and  more [[${bracketed.path.replace(/\.md$/, '')}|receipt]]`,
  );
});

test('a vault holding receipts in both time forms lists newest first', () => {
  const legacy = writeReceipt(
    { vault, clock: fixedClock('2026-09-24T08:00:00.000Z'), newId: sequentialIds() },
    { ...EXAMPLES.action, started: '2026-09-24T08:00:00.000Z' },
  );
  const current = writeReceipt(
    {
      vault,
      clock: fixedClock('2026-09-24T09:00:00.000Z'),
      newId: () => '01TEST00000000000000000009',
    },
    EXAMPLES.skill,
  );
  expect(current.receipt.started).toBe('2026-09-24T09:00');
  expect(legacy.receipt.started).toBe('2026-09-24T08:00:00.000Z');
  expect(listReceipts(vault).map((e) => e.receipt.id)).toEqual([
    current.receipt.id,
    legacy.receipt.id,
  ]);
});
