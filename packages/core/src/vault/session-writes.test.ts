import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts/store.js';
import {
  newSession,
  projectProfile,
  scriptedRunner,
  sequentialIds,
  tempDir,
  testDeps,
  testStore,
} from '../testing/index.js';
import { readNote } from './notes.js';
import type { DecisionInput } from './session-writes.js';

/**
 * A profile with its vault laid out, lantern-cove registered, and one session on it; `at` moves
 * the clock, and `mesa(env)` is Mesa as a command in that environment (a Mesa window's) sees it.
 */
function world() {
  let now = '2026-09-24T12:00:00.000Z';
  const newId = sequentialIds();
  const { home } = projectProfile(scriptedRunner().run, { newId, clock: () => new Date(now) });
  const session = testStore(home, 'default', newId).create(() => newSession()).id;
  const vault = join(home, 'vault');
  const mesa = (env: Record<string, string> = {}) =>
    createMesa('default', testDeps(home, { newId, env, clock: () => new Date(now) }));
  return {
    home,
    vault,
    session,
    mesa,
    at: (iso: string) => {
      now = iso;
    },
    read: (path: string) => readFileSync(join(vault, path), 'utf8'),
    put: (path: string, text: string) => {
      mkdirSync(join(vault, path, '..'), { recursive: true });
      writeFileSync(join(vault, path), text);
    },
    receipts: () => listReceipts(vault, Number.POSITIVE_INFINITY),
    log: () => readFileSync(join(vault, 'log.md'), 'utf8'),
  };
}

const rejected = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; message: string; details?: unknown };
  }
  throw new Error('expected a rejection');
};

const tide = {
  project: 'lantern-cove',
  title: 'Fixed clock in tide tests',
  decision: 'Tests take the clock as a parameter',
  rationale: 'The flake was the wall clock at midnight',
  probabilities: { 'fixed-clock': 0.8, retry: 0.2 },
  confidence: 0.8,
};

test('a decision lands in wiki/decisions/ with one decision receipt; the same save again adds nothing', async () => {
  const w = world();
  const saved = await w.mesa().vault.saveDecision({ ...tide, session: w.session });
  const path = 'wiki/decisions/2026-09-24-fixed-clock-in-tide-tests.md';
  expect(saved.result).toEqual({ path, changed: true });
  expect(readNote(w.vault, path)).toEqual({
    frontmatter: {
      created: '2026-09-24T12:00',
      updated: '2026-09-24T12:00',
      source: 'mesa',
      type: 'decision',
      project: 'lantern-cove',
      session: w.session,
      probabilities: { 'fixed-clock': 0.8, retry: 0.2 },
      confidence: 0.8,
    },
    body: '# Fixed clock in tide tests\n\nTests take the clock as a parameter\n\n## Rationale\n\nThe flake was the wall clock at midnight\n\nProject: [[projects/lantern-cove]]\n',
  });
  const [entry, ...others] = w.receipts();
  expect(others).toEqual([]);
  expect(saved.receipt).toEqual({ id: entry?.receipt.id, path: entry?.path });
  expect(entry?.receipt).toMatchObject({
    type: 'decision',
    kind: 'decision',
    project: 'lantern-cove',
    session: w.session,
    agent: 'claude',
    inputs: {
      title: tide.title,
      decision: tide.decision,
      rationale: tide.rationale,
      probabilities: tide.probabilities,
      confidence: 0.8,
      target: path,
    },
    outputs: { target: path, link: '[[wiki/decisions/2026-09-24-fixed-clock-in-tide-tests]]' },
  });
  const line = `Saved decision Fixed clock in tide tests for lantern-cove in wiki/decisions/2026-09-24-fixed-clock-in-tide-tests [[${entry?.path.replace(/\.md$/, '')}|receipt]]`;
  expect(w.log().trimEnd().split('\n').at(-1)).toBe(`- 2026-09-24T12:00:00.000Z ${line}`);
  expect(w.read('index.md')).toContain(
    '- [[wiki/decisions/2026-09-24-fixed-clock-in-tide-tests]]: Fixed clock in tide tests\n',
  );

  const [note, log, index] = [w.read(path), w.log(), w.read('index.md')];
  const again = await w.mesa().vault.saveDecision({ ...tide, session: w.session });
  expect(again).toEqual({ result: { path, changed: false }, receipt: null });
  expect([w.read(path), w.log(), w.read('index.md')]).toEqual([note, log, index]);
  expect(w.receipts()).toHaveLength(1);
});

test('timestamp-only differences are not changes; a changed decision is one more entry', async () => {
  const w = world();
  await w.mesa().vault.saveDecision(tide);
  const path = 'wiki/decisions/2026-09-24-fixed-clock-in-tide-tests.md';
  // Obsidian, or a person, restamps it; later the same day the same save comes again.
  w.put(path, w.read(path).replace('updated: 2026-09-24T12:00', 'updated: 2026-09-24T13:30'));
  w.at('2026-09-24T15:00:00.000Z');
  const before = w.read(path);
  expect((await w.mesa().vault.saveDecision(tide)).result.changed).toBe(false);
  expect(w.read(path)).toBe(before);
  expect(w.receipts()).toHaveLength(1);

  const changed = await w.mesa().vault.saveDecision({ ...tide, confidence: 0.9 });
  expect(changed.result).toEqual({ path, changed: true });
  expect(readNote(w.vault, path).frontmatter).toMatchObject({
    created: '2026-09-24T12:00',
    updated: '2026-09-24T15:00',
    confidence: 0.9,
  });
  expect(w.receipts()).toHaveLength(2);
  expect(w.read('index.md').match(/fixed-clock-in-tide-tests/g)).toHaveLength(1);
});

test("a save inside a Mesa window is the Caller's when on its project, and the Caller acts", async () => {
  const w = world();
  const inWindow = w.mesa({ MESA_SESSION_ID: w.session, MESA_PROFILE: 'default' });
  await inWindow.vault.saveDecision(tide);
  expect(w.receipts()[0]?.receipt).toMatchObject({ session: w.session, actor: w.session });
  const note = await inWindow.vault.saveNote({ title: 'Loose end', body: 'Check the tide API.' });
  // With no project, a note is the person's own: the Caller only acts.
  expect(w.receipts()[0]?.receipt).toMatchObject({ actor: w.session });
  expect(w.receipts()[0]?.receipt.session).toBeUndefined();
  expect(note.result.path).toBe('wiki/notes/loose-end.md');
  expect((await rejected(w.mesa().vault.saveDecision({ ...tide, project: 'nowhere' }))).code).toBe(
    'not_found',
  );
});

test('a decision needs its title, decision, and rationale, and probabilities from 0 to 1', async () => {
  const w = world();
  const code = async (input: Partial<DecisionInput>) =>
    (await rejected(w.mesa().vault.saveDecision({ ...tide, ...input }))).code;
  expect(await code({ rationale: '  ' })).toBe('usage');
  expect(await code({ title: '!!!' })).toBe('usage');
  expect(await code({ probabilities: { ship: 1.2 } })).toBe('usage');
  expect(await code({ confidence: -0.1 })).toBe('usage');
  expect(w.receipts()).toEqual([]);
});

test('a summary lands through the session-summary landing: same text nothing, changed text one more entry', async () => {
  const w = world();
  const path = `wiki/sessions/${w.session}.md`;
  const first = await w.mesa().vault.saveSummary({ session: w.session, summary: 'Goal: tides\n' });
  expect(first.result).toEqual({ path, changed: true });
  expect(readNote(w.vault, path)).toMatchObject({
    frontmatter: { type: 'session-summary', session: w.session, project: 'lantern-cove' },
    body: 'Goal: tides\n',
  });
  expect(w.receipts()[0]?.receipt).toMatchObject({
    kind: 'vault-change',
    session: w.session,
    project: 'lantern-cove',
    inputs: { target: path },
    outputs: { target: path },
  });
  expect(w.log()).toContain(`Summarised session ${w.session} on lantern-cove in wiki/sessions/`);

  w.at('2026-09-24T12:30:00.000Z');
  const same = await w.mesa().vault.saveSummary({ session: w.session, summary: 'Goal: tides' });
  expect(same).toEqual({ result: { path, changed: false }, receipt: null });
  expect(w.receipts()).toHaveLength(1);

  const file = join(tempDir(), 'summary.md');
  writeFileSync(file, 'Goal: tides\nDone: the clock\n');
  const changed = await w.mesa().vault.saveSummary({ session: w.session, file });
  expect(changed.result.changed).toBe(true);
  expect(readNote(w.vault, path).body).toBe('Goal: tides\nDone: the clock\n');
  expect(w.receipts()).toHaveLength(2);
  expect(
    (await rejected(w.mesa().vault.saveSummary({ session: w.session, summary: 'x', file }))).code,
  ).toBe('usage');
  expect(
    (await rejected(w.mesa().vault.saveSummary({ session: 'nope0000', summary: 'x' }))).code,
  ).toBe('not_found');
});

test('a note lands in wiki/notes/ or a given path under wiki/ or projects/<project>/, other folders refused', async () => {
  const w = world();
  const { vault } = w.mesa();
  const tides = await vault.saveNote({
    project: 'lantern-cove',
    title: 'Tide table sources',
    body: 'The harbour office publishes them.',
  });
  expect(tides.result).toEqual({ path: 'wiki/notes/tide-table-sources.md', changed: true });
  expect(readNote(w.vault, 'wiki/notes/tide-table-sources.md')).toMatchObject({
    frontmatter: { type: 'note', project: 'lantern-cove' },
    body: '# Tide table sources\n\nThe harbour office publishes them.\n',
  });
  expect(w.read('index.md')).toContain('- [[wiki/notes/tide-table-sources]]: Tide table sources\n');
  const hub = await vault.saveNote({
    title: 'Moorings',
    body: '# Moorings\n\nThree buoys.',
    path: 'projects/lantern-cove/moorings',
  });
  expect(hub.result.path).toBe('projects/lantern-cove/moorings.md');
  // Its folder names its project; its own heading stands.
  expect(readNote(w.vault, hub.result.path)).toMatchObject({
    frontmatter: { project: 'lantern-cove' },
    body: '# Moorings\n\nThree buoys.\n',
  });
  expect(w.receipts()[0]?.receipt).toMatchObject({ kind: 'vault-change', project: 'lantern-cove' });
  expect(
    (await vault.saveNote({ title: 'Deep', body: 'x', path: 'wiki/a/b/deep.md' })).result.path,
  ).toBe('wiki/a/b/deep.md');

  const before = { receipts: w.receipts().length, log: w.log() };
  for (const path of [
    'raw/clip.md',
    'receipts/2026/09/x.md',
    'daily/2026-09-24.md',
    'index.md',
    'loose.md',
    'projects/lantern-cove.md',
    '.obsidian/app.md',
    'wiki/.mesa/lock.md',
    '../outside.md',
  ]) {
    const refused = await rejected(vault.saveNote({ title: 'X', body: 'x', path }));
    expect(refused.code, path).toBe('usage');
  }
  mkdirSync(join(w.home, 'elsewhere'));
  symlinkSync(join(w.home, 'elsewhere'), join(w.vault, 'wiki/escape'));
  expect(
    (await rejected(vault.saveNote({ title: 'X', body: 'x', path: 'wiki/escape/x.md' }))).message,
  ).toContain('outside the vault');
  expect(
    (
      await rejected(
        vault.saveNote({
          project: 'lantern-cove',
          title: 'X',
          body: 'x',
          path: 'projects/harbor/x.md',
        }),
      )
    ).code,
  ).toBe('usage');
  expect({ receipts: w.receipts().length, log: w.log() }).toEqual(before);
});

test('a note Mesa did not write, or a locked one, is refused with a reason and no history', async () => {
  const w = world();
  w.put('wiki/notes/mine.md', '# Mine\n\nWritten by hand.\n');
  w.put('wiki/notes/kept.md', '---\nsource: mesa\nlocked: true\n---\n# Kept\n');
  const before = { receipts: w.receipts().length, log: w.log(), index: w.read('index.md') };
  const { vault } = w.mesa();
  const hand = await rejected(vault.saveNote({ title: 'Mine', body: 'Replaced' }));
  expect(hand).toMatchObject({ code: 'locked', details: { reason: 'not-mesa' } });
  expect(hand.message).toContain('not a note Mesa wrote');
  const locked = await rejected(vault.saveNote({ title: 'Kept', body: 'Replaced' }));
  expect(locked).toMatchObject({ code: 'locked', details: { reason: 'note' } });
  // Even the text it already holds: a locked note is the person's.
  expect((await rejected(vault.saveNote({ title: 'Kept', body: '# Kept' }))).code).toBe('locked');
  expect(w.read('wiki/notes/mine.md')).toBe('# Mine\n\nWritten by hand.\n');
  expect({ receipts: w.receipts().length, log: w.log(), index: w.read('index.md') }).toEqual(
    before,
  );
  expect(w.receipts().filter((e) => e.receipt.kind === 'vault-change')).toEqual([]);

  // A locked summary is refused the same way when its text would change.
  w.put(`wiki/sessions/${w.session}.md`, '---\nlocked: true\n---\nMine\n');
  expect((await rejected(vault.saveSummary({ session: w.session, summary: 'New' }))).code).toBe(
    'locked',
  );
  expect(w.receipts()).toHaveLength(before.receipts);
});

test('an update keeps the keep blocks; a retry after a lost log line restores it once', async () => {
  const w = world();
  const { vault } = w.mesa();
  const saved = await vault.saveNote({ title: 'Currents', body: 'Strong at noon.' });
  const path = saved.result.path;
  w.put(path, `${w.read(path)}\n<!-- keep -->\nMy own lines.\n<!-- keep -->\n`);
  await vault.saveNote({ title: 'Currents', body: 'Strong at dusk.' });
  expect(readNote(w.vault, path).body).toBe(
    '# Currents\n\nStrong at dusk.\n\n<!-- keep -->\nMy own lines.\n<!-- keep -->\n',
  );
  expect(w.receipts()).toHaveLength(2);

  // The receipt stands, but the process died before its log line.
  const tail = (line: string) => line.replace(/^- \S+ /, '');
  const lines = w.log().trimEnd().split('\n');
  const lost = tail(lines.at(-1) ?? '');
  expect(lost).toMatch(/^Saved note Currents in wiki\/notes\/currents \[\[receipts\//);
  w.put('log.md', `${lines.slice(0, -1).join('\n')}\n`);
  const count = () =>
    w
      .log()
      .split('\n')
      .filter((line) => tail(line) === lost).length;
  const retry = await vault.saveNote({ title: 'Currents', body: 'Strong at dusk.' });
  expect(retry).toEqual({ result: { path, changed: false }, receipt: null });
  expect(count()).toBe(1);
  await vault.saveNote({ title: 'Currents', body: 'Strong at dusk.' });
  expect(count()).toBe(1);
  expect(w.receipts()).toHaveLength(2);
});

test('a save needs a laid-out vault', async () => {
  const home = tempDir();
  const mesa = createMesa('default', testDeps(home));
  mesa.init({ vault: 'vault' });
  // init lays the vault out; an emptied one is not laid out.
  rmSync(join(home, 'vault'), { recursive: true });
  mkdirSync(join(home, 'vault'), { recursive: true });
  expect((await rejected(mesa.vault.saveNote({ title: 'X', body: 'x' }))).code).toBe('not_found');
});

test('a summary save never replaces a session note Mesa did not write', async () => {
  const w = world();
  const path = `wiki/sessions/${w.session}.md`;
  w.put(path, '# My own notes on this session\n');
  const refused = await rejected(
    w.mesa().vault.saveSummary({ session: w.session, summary: 'New' }),
  );
  expect(refused).toMatchObject({ code: 'locked', details: { reason: 'not-mesa' } });
  expect(w.read(path)).toBe('# My own notes on this session\n');
  expect(w.receipts()).toEqual([]);
});

test('a retry after an interrupted save records its missing entry and index line once', async () => {
  const w = world();
  const index = join(w.vault, 'index.md');
  chmodSync(index, 0o444); // the index line fails after the note is written
  try {
    await rejected(w.mesa().vault.saveNote({ title: 'Currents', body: 'Strong at noon.' }));
  } finally {
    chmodSync(index, 0o644);
  }
  expect(readNote(w.vault, 'wiki/notes/currents.md').body).toContain('Strong at noon.');
  expect(w.receipts()).toEqual([]);
  const retry = await w.mesa().vault.saveNote({ title: 'Currents', body: 'Strong at noon.' });
  expect(retry.result).toEqual({ path: 'wiki/notes/currents.md', changed: true });
  expect(retry.receipt).not.toBeNull();
  expect(w.receipts()).toHaveLength(1);
  expect(w.read('index.md').match(/\[\[wiki\/notes\/currents\]\]/g)).toHaveLength(1);
  const again = await w.mesa().vault.saveNote({ title: 'Currents', body: 'Strong at noon.' });
  expect(again).toEqual({
    result: { path: 'wiki/notes/currents.md', changed: false },
    receipt: null,
  });
  expect(w.receipts()).toHaveLength(1);
});

test('another decision with the same title on the same day gets its own note, never the first one', async () => {
  const w = world();
  const { vault } = w.mesa();
  const base = 'wiki/decisions/2026-09-24-fixed-clock-in-tide-tests';
  await vault.saveDecision(tide);
  const first = w.read(`${base}.md`);
  const other = { ...tide, decision: 'Tests freeze time with a fake timer' };
  expect((await vault.saveDecision(other)).result).toEqual({ path: `${base}-2.md`, changed: true });
  expect(w.read(`${base}.md`)).toBe(first);
  expect((await vault.saveDecision(other)).result).toEqual({
    path: `${base}-2.md`,
    changed: false,
  });
  const third = { ...tide, rationale: 'Midnight flakes cost a release' };
  expect((await vault.saveDecision(third)).result.path).toBe(`${base}-3.md`);
  expect((await vault.saveDecision(tide)).result).toEqual({ path: `${base}.md`, changed: false });
  expect(w.receipts()).toHaveLength(3);
});

test('session writes enforce the canonical project folder, while own-project aliases work', async () => {
  const w = world();
  const vault = w.mesa({ MESA_SESSION_ID: w.session, MESA_PROFILE: 'default' }).vault;
  mkdirSync(join(w.vault, 'projects/harbor'));
  mkdirSync(join(w.vault, 'projects/lantern-cove'));
  symlinkSync(join(w.vault, 'projects/harbor'), join(w.vault, 'wiki/other'));
  symlinkSync(join(w.vault, 'projects/lantern-cove'), join(w.vault, 'wiki/own'));
  const input = {
    title: 'Alias',
    body: 'Invented note',
    project: 'lantern-cove',
    session: w.session,
  };
  const before = w.log();
  for (const path of ['projects/harbor/direct.md', 'wiki/other/alias.md']) {
    expect((await rejected(vault.saveNote({ ...input, path }))).code).toBe('usage');
  }
  symlinkSync(join(w.vault, 'projects/harbor'), join(w.vault, 'wiki/decisions'));
  symlinkSync(join(w.vault, 'projects/harbor'), join(w.vault, 'wiki/sessions'));
  expect((await rejected(vault.saveDecision(tide))).code).toBe('usage');
  expect(
    (await rejected(vault.saveSummary({ session: w.session, summary: 'Invented' }))).code,
  ).toBe('usage');
  expect(w.log()).toBe(before);
  expect(w.receipts()).toEqual([]);
  expect(existsSync(join(w.vault, 'projects/harbor/alias.md'))).toBe(false);
  const own = await vault.saveNote({ ...input, path: 'wiki/own/alias.md' });
  expect(own.result.changed).toBe(true);
  expect(w.read('projects/lantern-cove/alias.md')).toContain('Invented note');
});

test('a session save refuses a log symlink outside the vault before changing any note', async () => {
  const w = world();
  const outside = join(tempDir(), 'log.md');
  const before = w.log();
  writeFileSync(outside, before);
  rmSync(join(w.vault, 'log.md'));
  symlinkSync(outside, join(w.vault, 'log.md'));
  expect(
    (await rejected(w.mesa().vault.saveNote({ title: 'Escape', body: 'Invented' }))).code,
  ).toBe('usage');
  expect(readFileSync(outside, 'utf8')).toBe(before);
  expect(existsSync(join(w.vault, 'wiki/notes/escape.md'))).toBe(false);
  expect(w.receipts()).toEqual([]);
});

test('a summary whose receipt could not be written gets it on the retry, once', async () => {
  const w = world();
  const receipts = join(w.vault, 'receipts');
  chmodSync(receipts, 0o555);
  let first: Awaited<ReturnType<ReturnType<typeof w.mesa>['vault']['saveSummary']>>;
  try {
    first = await w.mesa().vault.saveSummary({ session: w.session, summary: 'Goal: tides' });
  } finally {
    chmodSync(receipts, 0o755);
  }
  expect(first).toMatchObject({ result: { changed: true }, receipt: null });
  expect(first.warning).toMatch(/^no receipt: /);
  const retry = await w.mesa().vault.saveSummary({ session: w.session, summary: 'Goal: tides' });
  expect(retry.result.changed).toBe(true);
  expect(retry.receipt).not.toBeNull();
  const again = await w.mesa().vault.saveSummary({ session: w.session, summary: 'Goal: tides' });
  expect(again.receipt).toBeNull();
  expect(w.receipts()).toHaveLength(1);
});

test.each(['note', 'summary'] as const)(
  'public saved %s refuses CRLF locked notes without changing note or history bytes',
  async (kind) => {
    const w = world();
    const { vault } = w.mesa();
    const saved =
      kind === 'note'
        ? await vault.saveNote({ title: 'Kept tide', body: 'Original tide.' })
        : await vault.saveSummary({ session: w.session, summary: 'Original tide.' });
    const path = saved.result.path;
    w.put(
      path,
      w
        .read(path)
        .replace('source: mesa\n', 'source: mesa\nlocked: true\n')
        .replaceAll('\n', '\r\n'),
    );
    const receipts = w.receipts().map((entry) => entry.path);
    const files = [path, 'log.md', 'index.md', ...receipts];
    const before = files.map((file) => readFileSync(join(w.vault, file)));
    const attempt =
      kind === 'note'
        ? vault.saveNote({ title: 'Kept tide', body: 'Replaced tide.' })
        : vault.saveSummary({ session: w.session, summary: 'Replaced tide.' });
    expect(await rejected(attempt)).toMatchObject({ code: 'locked', details: { reason: 'note' } });
    expect(w.receipts().map((entry) => entry.path)).toEqual(receipts);
    expect(files.map((file) => readFileSync(join(w.vault, file)))).toEqual(before);
  },
);
