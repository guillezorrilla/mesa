import {
  chmodSync,
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { createMesa } from '../mesa.js';
import { writeReceipt } from '../receipts/store.js';
import { fixedClock, sequentialIds, steppingClock, tempDir, testDeps } from '../testing/index.js';

let vault: string;
let mesa: ReturnType<typeof createMesa>;
const clock = fixedClock('2026-09-24T12:00:00Z');
beforeEach(async () => {
  const home = tempDir();
  vault = join(home, 'vault');
  mesa = createMesa('default', testDeps(home, { clock }));
  await mesa.init({ vault });
  await mesa.vault.init();
});

test('daily builds every meaningful receipt once, with exact receipt/target links and no history', async () => {
  const deps = { vault, clock, newId: sequentialIds() };
  let first = '';
  for (let n = 0; n < 25; n++) {
    const saved = writeReceipt(deps, {
      profile: 'default',
      type: 'decision',
      kind: 'decision',
      status: 'ok',
      command: 'mesa decide',
      summary: `Invented decision ${n}`,
      outputs: n === 0 ? { target: 'wiki/tide.md' } : {},
    });
    if (n === 0) first = saved.path;
  }
  copyFileSync(join(vault, first), join(vault, first.replace('decision-', 'action-')));
  const log = readFileSync(join(vault, 'log.md'));
  const result = await mesa.daily.build('2026-09-24');
  expect(result).toEqual({
    path: 'daily/2026-09-24.md',
    date: '2026-09-24',
    changed: true,
    decisions: 25,
    changes: 0,
    log: 0,
  });
  const written = readFileSync(join(vault, result.path));
  expect(written.toString()).toContain('[target](<../wiki/tide.md>)');
  expect(written.toString()).toContain(`${first.replace(/\.md$/, '')}|receipt]]`);
  const mtime = statSync(join(vault, result.path)).mtimeMs;
  expect(await mesa.daily.build('2026-09-24')).toEqual({ ...result, changed: false });
  expect(readFileSync(join(vault, result.path))).toEqual(written);
  expect(statSync(join(vault, result.path)).mtimeMs).toBe(mtime);
  expect(readFileSync(join(vault, 'log.md'))).toEqual(log);
  expect(mesa.receipts.list({ limit: 100 })).toHaveLength(26);
});

test('raw frontmatter, CRLFs and arbitrary user bytes survive, and legacy outside logs are not repeated', async () => {
  const path = join(vault, 'daily/2026-09-24.md');
  const prefix = Buffer.concat([
    Buffer.from(
      '---\r\n# my comment\r\ncustom: "do not normalize"\r\n---\r\nMine\r\n- 2026-09-24T11:00:00.000Z old event\r\n',
    ),
    Buffer.from([0xff, 0x00]),
  ]);
  writeFileSync(path, prefix);
  writeFileSync(
    join(vault, 'log.md'),
    '- 2026-09-24T11:00:00.000Z old event\n- 2026-09-24T12:00:00.000Z user [[wiki/tide]]\n',
  );
  expect(await mesa.daily.build('2026-09-24')).toMatchObject({ log: 1 });
  const first = readFileSync(path);
  expect(first.subarray(0, prefix.length)).toEqual(prefix);
  const suffix = Buffer.from('\r\nAFTER\r\n');
  writeFileSync(path, Buffer.concat([first, suffix]));
  const before = readFileSync(path);
  expect(await mesa.daily.build('2026-09-24')).toMatchObject({ changed: false });
  expect(readFileSync(path)).toEqual(before);
});

test.each([
  '<!-- mesa:daily:start -->',
  '<!-- mesa:daily:end -->',
  '<!-- mesa:daily:end --><!-- mesa:daily:start -->',
  '<!-- mesa:daily:start --><!-- mesa:daily:start --><!-- mesa:daily:end -->',
  '<!-- mesa:daily:start --><!-- mesa:daily:end --><!-- mesa:daily:end -->',
  '---\r\nlocked: true\r\n---\r\nuser bytes',
  '---\nlocked: [\n---\n',
  '---\nlocked: true\n',
])(
  'daily/log preflight refuses markers or frontmatter without either write: %s',
  async (content) => {
    const path = join(vault, 'daily/2026-09-24.md');
    writeFileSync(path, content);
    const log = readFileSync(join(vault, 'log.md'));
    await expect(mesa.log('never persisted')).rejects.toHaveProperty(
      'code',
      content.includes('locked: true\r') ? 'locked' : 'invalid_config',
    );
    expect(readFileSync(path).toString()).toBe(content);
    expect(readFileSync(join(vault, 'log.md'))).toEqual(log);
    await expect(mesa.daily.build('2026-09-24')).rejects.toHaveProperty('code');
  },
);

test('legacy automatic lines match the receipt owner exactly; new explicit text is always retained', async () => {
  const { path } = writeReceipt(
    { vault, clock, newId: sequentialIds() },
    { profile: 'default', type: 'action', status: 'ok', command: 'mesa old', summary: 'Routine' },
  );
  const linked = `${path.replace(/\.md$/, '')}|receipt]]`;
  await mesa.log(`Routine [[${linked}`);
  await mesa.log(`User note [[${linked}`);
  const result = await mesa.daily.build('2026-09-24');
  expect(result).toMatchObject({ decisions: 0, changes: 0, log: 2, changed: false });
  expect(readFileSync(join(vault, 'log.md'), 'utf8')).toContain('<!-- mesa:log -->');
});

test('meaningful targetless/invalid-target guardrails stay; failed/routine and daily bookkeeping do not', async () => {
  const deps = { vault, clock, newId: sequentialIds() };
  for (const input of [
    {
      kind: 'guardrail' as const,
      status: 'blocked' as const,
      outputs: { error: { code: 'guardrail_blocked' } },
    },
    {
      kind: 'guardrail' as const,
      status: 'ok' as const,
      outputs: { override: 'yes', target: '../escape.md' },
    },
    { kind: 'decision' as const, status: 'ok' as const, outputs: { target: 42 } },
    { kind: 'vault-change' as const, status: 'ok' as const, outputs: { target: 'wiki/tide.md' } },
    { kind: 'decision' as const, status: 'failed' as const, outputs: {} },
    {
      kind: 'vault-change' as const,
      status: 'ok' as const,
      outputs: { target: 'daily/2026-09-24.md' },
    },
    { kind: 'guardrail' as const, status: 'ok' as const, outputs: {} },
  ])
    writeReceipt(deps, {
      profile: 'default',
      type: 'action',
      command: 'mesa invented',
      summary: 'Invented event',
      ...input,
    });
  expect(await mesa.daily.build('2026-09-24')).toMatchObject({ decisions: 3, changes: 1, log: 0 });
  expect(readFileSync(join(vault, 'daily/2026-09-24.md'), 'utf8')).not.toContain('[[../escape');
});

test('scope/locked log preflight writes neither file', async () => {
  const logFile = join(vault, 'log.md');
  for (const [content, code] of [
    ['---\r\nlocked: true\r\n---\r\n', 'locked'],
    ['---\nlocked: [\n---\n', 'invalid_config'],
    ['---\nlocked: true\n', 'invalid_config'],
  ] satisfies [string, string][]) {
    writeFileSync(logFile, content);
    await expect(mesa.log('refuse')).rejects.toHaveProperty('code', code);
    await expect(mesa.daily.build()).rejects.toHaveProperty('code', code);
    expect(readFileSync(logFile, 'utf8')).toBe(content);
    expect(existsSync(join(vault, 'daily/2026-09-24.md'))).toBe(false);
  }
  const outside = join(tempDir(), 'outside.md');
  writeFileSync(outside, 'untouched');
  unlinkSync(logFile);
  symlinkSync(outside, logFile);
  await expect(mesa.log('refuse')).rejects.toHaveProperty('code', 'usage');
  expect(readFileSync(outside, 'utf8')).toBe('untouched');
});

test('a later filesystem failure reports persisted log and rebuild recovers without logging again', async () => {
  const dir = join(vault, 'daily');
  chmodSync(dir, 0o555);
  try {
    await expect(mesa.log('persisted once')).rejects.toMatchObject({
      code: 'internal',
      details: { persisted: ['log.md'], daily: 'daily/2026-09-24.md' },
    });
  } finally {
    chmodSync(dir, 0o755);
  }
  expect(await mesa.daily.build('2026-09-24')).toMatchObject({ log: 1 });
  expect(readFileSync(join(vault, 'log.md'), 'utf8').match(/persisted once/g)).toHaveLength(1);
});

test('local dates and started values cross non-UTC midnight and month boundaries without filename/mtime selection', async () => {
  vi.stubEnv('TZ', 'America/Vancouver');
  try {
    const deps = { vault, clock, newId: sequentialIds() };
    for (const started of ['2026-10-01T06:59:00Z', '2026-10-01T00:01', '2026-10-01T07:01:00Z']) {
      writeReceipt(deps, {
        profile: 'default',
        type: 'decision',
        kind: 'decision',
        status: 'ok',
        command: 'mesa invented',
        summary: started,
        started,
      });
    }
    expect(await mesa.daily.build('2026-09-30')).toMatchObject({ decisions: 1 });
    expect(await mesa.daily.build('2026-10-01')).toMatchObject({ decisions: 2 });
    expect(readFileSync(join(vault, 'daily/2026-09-30.md'), 'utf8')).toContain(
      '- 23:59 2026-10-01T06:59:00Z',
    );
    expect(await mesa.daily.build()).toMatchObject({ date: '2026-09-24' });
    for (const date of [
      '2026-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-04-31',
      '2026-9-24',
      '../wiki/tide',
    ]) {
      await expect(mesa.daily.build(date)).rejects.toHaveProperty('code', 'usage');
    }
    expect(await mesa.daily.build('2024-02-29')).toMatchObject({ decisions: 0 });
  } finally {
    vi.unstubAllEnvs();
  }
});

test('a daily folder alias outside scope refuses before log append', async () => {
  rmSync(join(vault, 'daily'), { recursive: true });
  const outside = tempDir();
  symlinkSync(outside, join(vault, 'daily'));
  const before = readFileSync(join(vault, 'log.md'));
  await expect(mesa.log('not written')).rejects.toHaveProperty('code', 'usage');
  await expect(mesa.daily.build()).rejects.toHaveProperty('code', 'usage');
  expect(readFileSync(join(vault, 'log.md'))).toEqual(before);
  expect(existsSync(join(outside, '2026-09-24.md'))).toBe(false);
});

test('concurrent logs and rebuilds share the same lock without duplicates or lost events', async () => {
  const home = vault.slice(0, -'/vault'.length);
  const concurrent = createMesa(
    'default',
    testDeps(home, { clock, sleep: (ms) => new Promise((done) => setTimeout(done, ms)) }),
  );
  await Promise.all([
    concurrent.log('first explicit'),
    concurrent.daily.build(),
    concurrent.log('second explicit'),
    concurrent.daily.build(),
  ]);
  expect(await concurrent.daily.build()).toMatchObject({ log: 2, changed: false });
  const raw = readFileSync(join(vault, 'daily/2026-09-24.md'), 'utf8');
  expect(raw.match(/first explicit/g)).toHaveLength(1);
  expect(raw.match(/second explicit/g)).toHaveLength(1);
});

test('one locked log instant keeps its entry and Daily together across local midnight', async () => {
  vi.stubEnv('TZ', 'America/Vancouver');
  try {
    let calls = 0;
    // The vault lock stamps its holder with the first tick; the log reads the second.
    const tick = steppingClock('2026-10-01T06:59:59.800Z', 100);
    const subject = createMesa(
      'default',
      testDeps(vault.slice(0, -'/vault'.length), {
        clock: () => {
          calls += 1;
          return tick();
        },
      }),
    );
    const result = await subject.log('invented midnight gull');
    expect(result).toEqual({
      entry: '- 2026-10-01T06:59:59.900Z invented midnight gull <!-- mesa:log -->',
      daily: 'daily/2026-09-30.md',
    });
    expect(calls).toBe(2);
    expect(
      readFileSync(join(vault, result.daily), 'utf8').match(/invented midnight gull/g),
    ).toHaveLength(1);
    expect(
      readFileSync(join(vault, 'log.md'), 'utf8').match(/invented midnight gull/g),
    ).toHaveLength(1);
    expect(await subject.daily.build('2026-09-30')).toMatchObject({ changed: false, log: 1 });
    expect(existsSync(join(vault, 'daily/2026-10-01.md'))).toBe(false);
  } finally {
    vi.unstubAllEnvs();
  }
});

test('targets with link punctuation keep their exact scoped file identity', async () => {
  const target = 'wiki/tide #2|chart (draft).md';
  writeFileSync(join(vault, target), 'Invented target');
  writeReceipt(
    { vault, clock, newId: sequentialIds() },
    {
      profile: 'default',
      type: 'decision',
      kind: 'decision',
      status: 'ok',
      command: 'mesa invented',
      summary: 'Keep exact target',
      outputs: { target },
    },
  );
  await mesa.daily.build('2026-09-24');
  const read = mesa.vault.read('daily/2026-09-24.md');
  if (read.preview !== 'markdown') throw new Error('expected Daily Markdown');
  expect(read.body).toContain('[target](<../wiki/tide%20%232%7Cchart%20%28draft%29.md>)');
  expect(read.links).toContainEqual(expect.objectContaining({ status: 'resolved', path: target }));
});

test('unterminated prior-day log keeps new explicit and receipt entries separate', async () => {
  const prior = '- 2026-09-23T12:00:00.000Z Prior invented event';
  const log = join(vault, 'log.md');
  writeFileSync(log, prior);
  const { entry, daily } = await mesa.log('Fresh invented event');
  expect(readFileSync(log, 'utf8')).toBe(`${prior}\n${entry}\n`);
  expect(await mesa.daily.build('2026-09-24')).toMatchObject({ changed: false, log: 1 });
  expect(readFileSync(join(vault, daily), 'utf8').match(/Fresh invented event/g)).toHaveLength(1);
  writeFileSync(log, prior);
  const saved = writeReceipt(
    { vault, clock, newId: sequentialIds() },
    {
      profile: 'default',
      type: 'action',
      status: 'ok',
      command: 'mesa invented',
      summary: 'Fresh receipt',
    },
  );
  expect(saved.warning).toBeUndefined();
  expect(readFileSync(log, 'utf8')).toMatch(/^.*Prior invented event\n- .*Fresh receipt/);
});
