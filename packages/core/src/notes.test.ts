import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import type { Frontmatter } from './frontmatter.js';
import { appendLog, localDay, logLine, readNote, updateNote, writeNote } from './notes.js';
import { fixedClock, steppingClock, tempDir, thrown } from './testing.js';
import { initVault } from './vault.js';
import { vaultLockPath, withVaultLock } from './vault-lock.js';

let vault: string;
beforeEach(() => {
  vault = join(tempDir(), 'vault');
  initVault({ path: vault, clock: fixedClock() });
});

test('writeNote stamps created, updated, and source, keeps created on rewrite, and leaves no temp file', () => {
  const deps = { vault, clock: steppingClock('2026-09-24T12:00:00.000Z', 60_000) };
  writeNote(deps, {
    path: 'wiki/tide.md',
    frontmatter: { tags: ['sea'], source: 'ignored' },
    body: '# Tide\n',
  });
  const first = readNote(deps, 'wiki/tide.md');
  expect(first.frontmatter).toEqual({
    created: '2026-09-24T12:00:00.000Z',
    updated: '2026-09-24T12:00:00.000Z',
    source: 'mesa',
    tags: ['sea'],
  });
  expect(readFileSync(join(vault, 'wiki/tide.md'), 'utf8')).toMatch(/^---\ncreated: /);

  writeNote(deps, { path: 'wiki/tide.md', frontmatter: { tags: [] }, body: 'v2\n' });
  expect(readNote(deps, 'wiki/tide.md')).toEqual({
    frontmatter: {
      created: '2026-09-24T12:00:00.000Z',
      updated: '2026-09-24T12:01:00.000Z',
      source: 'mesa',
      tags: [],
    },
    body: 'v2\n',
  });
  expect(readdirSync(join(vault, 'wiki')).filter((n) => n.endsWith('.tmp'))).toEqual([]);
});

test('a note with locked: true is never replaced', () => {
  const deps = { vault, clock: fixedClock() };
  writeNote(deps, { path: 'wiki/keep.md', frontmatter: { locked: true }, body: 'mine\n' });
  expect(
    thrown(() => writeNote(deps, { path: 'wiki/keep.md', frontmatter: {}, body: 'x' })).code,
  ).toBe('locked');
  expect(readNote(deps, 'wiki/keep.md').body).toBe('mine\n');
});

test('appendLog appends "- <ISO> <line>" to log.md; it needs an initialised vault', () => {
  appendLog({ vault, clock: fixedClock('2026-09-24T13:00:00.000Z') }, 'hello');
  expect(readFileSync(join(vault, 'log.md'), 'utf8').split('\n').slice(-2)).toEqual([
    '- 2026-09-24T13:00:00.000Z hello',
    '',
  ]);
  expect(
    thrown(() => appendLog({ vault: join(vault, 'nope'), clock: fixedClock() }, 'x')).code,
  ).toBe('not_found');
});

// A seeded generator (mulberry32), so the 50 cases are the same on every run.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('property: write then read returns the same frontmatter and body for 50 random notes', () => {
  const next = random(54);
  const pick = <T>(items: T[]) => items[Math.floor(next() * items.length)] as T;
  const text = () =>
    Array.from({ length: 1 + Math.floor(next() * 12) }, () =>
      pick([
        'a',
        'Z',
        '7',
        ' ',
        ':',
        '#',
        '-',
        "'",
        '"',
        '\n',
        'yes',
        'null',
        '---',
        'é',
        '[',
        '{',
      ]),
    ).join('');
  const value = (depth: number): unknown =>
    pick([
      () => text(),
      () => Math.round(next() * 1e6) / 100,
      () => next() > 0.5,
      () => Array.from({ length: Math.floor(next() * 4) }, () => text()),
      () => (depth > 1 ? text() : Object.fromEntries([[`k${depth}`, value(depth + 1)]])),
    ])();
  const deps = { vault, clock: fixedClock() };
  for (let i = 0; i < 50; i++) {
    const frontmatter: Frontmatter = Object.fromEntries(
      Array.from({ length: 1 + Math.floor(next() * 5) }, (_, j) => [
        `field${j}_${text().replace(/\W/g, '')}`,
        value(0),
      ]),
    );
    const body = `${text()}\n---\n${text()}`;
    writeNote(deps, { path: `wiki/p${i}.md`, frontmatter, body });
    const read = readNote(deps, `wiki/p${i}.md`);
    expect(read.body).toBe(body);
    expect(read.frontmatter).toEqual({
      created: expect.any(String),
      updated: expect.any(String),
      source: 'mesa',
      ...frontmatter,
    });
  }
});

test('mesa log writes log.md and creates, then appends to, the daily note', async () => {
  const clock = fixedClock('2026-09-24T12:00:00.000Z');
  const { entry, daily } = await logLine({ vault, clock }, 'hello');
  expect(entry).toBe('- 2026-09-24T12:00:00.000Z hello');
  expect(daily).toBe(`daily/${localDay(clock())}.md`);
  await logLine({ vault, clock }, 'again');
  const note = readNote({ vault, clock }, daily);
  expect(note.frontmatter).toMatchObject({
    type: 'daily',
    date: localDay(clock()),
    source: 'mesa',
  });
  expect(note.body).toBe(
    `# ${localDay(clock())}\n\n- 2026-09-24T12:00:00.000Z hello\n- 2026-09-24T12:00:00.000Z again\n`,
  );
  expect(readFileSync(join(vault, 'log.md'), 'utf8')).toContain(
    'hello\n- 2026-09-24T12:00:00.000Z again\n',
  );
});

test('20 concurrent read-modify-write updates of index.md lose nothing', async () => {
  const deps = { vault, clock: fixedClock() };
  const pause = () => new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      updateNote(deps, 'index.md', async (note) => {
        await pause(); // widen the read-to-write window: without the lock, updates would be lost
        return { frontmatter: note?.frontmatter ?? {}, body: `${note?.body ?? ''}- entry ${i}\n` };
      }),
    ),
  );
  const lines = readNote(deps, 'index.md')
    .body.split('\n')
    .filter((l) => l.startsWith('- entry'));
  expect(lines.sort()).toEqual(Array.from({ length: 20 }, (_, i) => `- entry ${i}`).sort());
});

test('a held lock times out as locked, and its holder keeps it', async () => {
  mkdirSync(join(vault, '.mesa'), { recursive: true });
  writeFileSync(vaultLockPath(vault), 'another holder');
  const error = await withVaultLock(vault, async () => 'never').catch((e) => e);
  expect(error).toMatchObject({ code: 'locked', details: { reason: 'vault' } });
  expect(readFileSync(vaultLockPath(vault), 'utf8')).toBe('another holder');
  // A busy lock writes nothing: no half-done mesa log.
  const before = readFileSync(join(vault, 'log.md'), 'utf8');
  await expect(logLine({ vault, clock: fixedClock() }, 'x')).rejects.toMatchObject({
    code: 'locked',
  });
  expect(readFileSync(join(vault, 'log.md'), 'utf8')).toBe(before);
}, 15_000);

test('a lock is released after the work, even when it throws', async () => {
  await expect(withVaultLock(vault, async () => Promise.reject(new Error('boom')))).rejects.toThrow(
    'boom',
  );
  expect(await withVaultLock(vault, async () => 'ran')).toBe('ran');
});

test('log text stays one line and cannot be empty; note paths stay inside the vault', () => {
  const deps = { vault, clock: fixedClock() };
  expect(appendLog(deps, 'real\n- 2020-01-01T00:00:00.000Z forged')).toBe(
    '- 2026-09-24T12:00:00.000Z real - 2020-01-01T00:00:00.000Z forged',
  );
  expect(thrown(() => appendLog(deps, ' \n ')).code).toBe('usage');
  expect(
    thrown(() => writeNote(deps, { path: '../escape.md', frontmatter: {}, body: '' })).code,
  ).toBe('usage');
  expect(thrown(() => readNote(deps, '/etc/hosts')).code).toBe('usage');
});
