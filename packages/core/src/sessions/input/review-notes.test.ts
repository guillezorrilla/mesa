import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  agentWorld,
  gitRepo,
  profilePaths,
  projectProfile,
  testGit,
  withRealGit,
} from '../../testing/index.js';
import { reviewNotesFile } from './review-notes.js';

const TIDE = 'const tide = 1;\nconst moon = 2;\nconst reef = 3;\nconst gull = 4;\n';

/** A session on its own branch that has committed a change to tide.ts. */
async function setUp({ strict = false } = {}) {
  const { run, tmux } = agentWorld();
  const { home, dir, mesa } = projectProfile(
    withRealGit(run),
    strict ? { mesaYaml: 'name: lantern-cove\nguardrail: strict\n' } : {},
  );
  writeFileSync(join(dir, 'tide.ts'), 'const tide = 0;\n');
  gitRepo(dir);
  const session = (await mesa.sessions.open('lantern-cove', { branch: 'tides' })).result;
  const tree = session.worktree?.path as string;
  writeFileSync(join(tree, 'tide.ts'), TIDE);
  testGit(tree, 'commit', '-qam', 'tides');
  writeFileSync(join(tree, 'gull.ts'), 'const gull = 1;\n');
  testGit(tree, 'add', 'gull.ts');
  testGit(tree, 'commit', '-qm', 'gulls');
  const typed = () => tmux.windows.find((w) => w.window.endsWith(session.id))?.typed ?? [];
  return { home, mesa, tree, typed, id: session.id };
}

test('a note on a committed line quotes it and keeps the blob it was written on', async () => {
  const { mesa, tree, id } = await setUp();
  const note = await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 2, text: 'rename' });
  expect(note).toMatchObject({ line: 2, end: 2, scope: 'branch', quoted: 'const moon = 2;' });
  expect(note.blob).toBe(testGit(tree, 'rev-parse', 'HEAD:tide.ts'));
  expect(await mesa.sessions.notes.list(id)).toEqual([{ ...note, stale: false }]);
});

test('a range quotes its lines; line 0 is a note on the whole file', async () => {
  const { mesa, id } = await setUp();
  const range = await mesa.sessions.notes.add(id, {
    path: 'tide.ts',
    line: 2,
    end: 3,
    text: 'one const',
  });
  expect(range.quoted).toBe('const moon = 2;\nconst reef = 3;');
  const file = await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 0, text: 'split' });
  expect(file).toMatchObject({ line: 0, end: 0, quoted: '' });
  await expect(
    mesa.sessions.notes.add(id, { path: 'tide.ts', line: 4, end: 9, text: 'x' }),
  ).rejects.toMatchObject({ code: 'usage' });
  await expect(
    mesa.sessions.notes.add(id, { path: 'gone.ts', line: 1, text: 'x' }),
  ).rejects.toMatchObject({ code: 'usage' });
});

test('a note goes stale when its lines change, and follows them when they only move', async () => {
  const { mesa, tree, id } = await setUp();
  const moon = await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 2, text: 'rename' });
  const reef = await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 3, text: 'drop' });
  writeFileSync(join(tree, 'tide.ts'), `// tides\n${TIDE.replace('reef = 3', 'reef = 30')}`);
  const listed = await mesa.sessions.notes.list(id);
  expect(listed.find((n) => n.id === moon.id)).toMatchObject({ line: 3, end: 3, stale: false });
  expect(listed.find((n) => n.id === reef.id)).toMatchObject({ line: 3, stale: true });
});

test('working and staged notes read uncommitted work', async () => {
  const { mesa, tree, id } = await setUp();
  writeFileSync(join(tree, 'tide.ts'), `${TIDE}const kelp = 5;\n`);
  testGit(tree, 'add', 'tide.ts');
  writeFileSync(join(tree, 'tide.ts'), `${TIDE}const kelp = 6;\n`);
  const add = (scope: 'working' | 'staged') =>
    mesa.sessions.notes.add(id, { path: 'tide.ts', line: 5, scope, text: 'why' });
  expect((await add('staged')).quoted).toBe('const kelp = 5;');
  expect((await add('working')).quoted).toBe('const kelp = 6;');
});

test('edit changes the text and clears sentAt; remove drops it; rm takes the file', async () => {
  const { home, mesa, id } = await setUp();
  const note = await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 1, text: 'first' });
  const file = reviewNotesFile(profilePaths(home, 'default').reviewNotes, id);
  // A sent note, as the send will leave it.
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  saved.notes[0].sentAt = '2026-11-10T12:00:00.000Z';
  writeFileSync(file, JSON.stringify(saved));
  expect(mesa.sessions.notes.edit(id, note.id, 'second')).toMatchObject({ text: 'second' });
  expect((await mesa.sessions.notes.list(id))[0]?.sentAt).toBeUndefined();
  expect(() => mesa.sessions.notes.edit(id, note.id, ' ')).toThrow(
    expect.objectContaining({ code: 'usage' }),
  );
  expect(() => mesa.sessions.notes.remove(id, 'zzzzzzzz')).toThrow(
    expect.objectContaining({ code: 'not_found' }),
  );
  mesa.sessions.notes.remove(id, note.id);
  expect(await mesa.sessions.notes.list(id)).toEqual([]);
  await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 1, text: 'again' });
  await mesa.sessions.remove(id, { force: true });
  expect(existsSync(file)).toBe(false);
});

test('send sends every unsent note as one prompt, once, and leaves a stale one out', async () => {
  const { mesa, tree, typed, id } = await setUp();
  const add = (path: string, line: number, text: string, end?: number) =>
    mesa.sessions.notes.add(id, { path, line, text, ...(end ? { end } : {}) });
  const moon = await add('tide.ts', 2, 'rename', 3);
  const file = await add('tide.ts', 0, 'split this file');
  const gull = await add('gull.ts', 1, 'why a const?');
  const gone = await add('tide.ts', 4, 'drop');
  writeFileSync(join(tree, 'tide.ts'), TIDE.replace('gull = 4', 'gull = 40'));
  const sent = await mesa.sessions.notes.send(id, undefined, { noFrom: true });
  expect(sent).toMatchObject({ sent: [moon.id, file.id, gull.id], stale: [gone.id] });
  expect(sent.delivery?.status).toBe('delivered');
  expect(typed()).toEqual([
    [
      "These are the person's review notes on this session's diff (3).",
      'File: tide.ts\nLines: 2-3\n```\nconst moon = 2;\nconst reef = 3;\n```\nNote: rename',
      'File: tide.ts\nScope: file\nNote: split this file',
      'File: gull.ts\nLines: 1-1\n```\nconst gull = 1;\n```\nNote: why a const?',
    ].join('\n\n'),
  ]);
  const listed = await mesa.sessions.notes.list(id);
  expect(listed.filter((n) => n.sentAt).map((n) => n.id)).toEqual([moon.id, file.id, gull.id]);
  expect(await mesa.sessions.notes.send(id, undefined, { noFrom: true })).toEqual({
    sent: [],
    stale: [gone.id],
  });
  expect(typed()).toHaveLength(1);
  const [event] = (await mesa.sessions.show(id)).events.filter((e) => e.type === 'review');
  expect(event).toMatchObject({ kind: 'notes', notes: [moon.id, file.id, gull.id] });
});

test("send --path sends only that file's notes", async () => {
  const { mesa, typed, id } = await setUp();
  await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 1, text: 'tide' });
  const gull = await mesa.sessions.notes.add(id, { path: 'gull.ts', line: 1, text: 'gull' });
  const sent = await mesa.sessions.notes.send(id, 'gull.ts', { noFrom: true });
  expect(sent.sent).toEqual([gull.id]);
  expect(typed()[0]).toContain('File: gull.ts');
  expect(typed()[0]).not.toContain('tide.ts');
});

test('a guardrail ask sends nothing and leaves every note unsent; --yes sends, with the ids in its receipt', async () => {
  const { home, mesa, typed, id } = await setUp({ strict: true });
  const note = await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 1, text: 'tide' });
  await expect(mesa.sessions.notes.send(id, undefined, { noFrom: true })).rejects.toMatchObject({
    code: 'guardrail_blocked',
  });
  expect(typed()).toEqual([]);
  expect((await mesa.sessions.notes.list(id))[0]?.sentAt).toBeUndefined();
  const sent = await mesa.sessions.notes.send(id, undefined, { noFrom: true, yes: true });
  expect(sent.sent).toEqual([note.id]);
  const receipt = sent.delivery?.receipt;
  expect(receipt).toBeTruthy();
  expect(readFileSync(join(home, 'vault', receipt?.path as string), 'utf8')).toContain(note.id);
});

test('clear removes the sent notes whose lines stayed, keeping a changed one', async () => {
  const { mesa, tree, id } = await setUp();
  const kept = await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 1, text: 'tide' });
  const changed = await mesa.sessions.notes.add(id, { path: 'tide.ts', line: 2, text: 'moon' });
  const draft = await mesa.sessions.notes.add(id, { path: 'gull.ts', line: 1, text: 'gull' });
  await mesa.sessions.notes.send(id, 'tide.ts', { noFrom: true });
  writeFileSync(join(tree, 'tide.ts'), TIDE.replace('moon = 2', 'moon = 20'));
  const listed = await mesa.sessions.notes.list(id);
  expect(listed.find((n) => n.id === changed.id)).toMatchObject({
    stale: true,
    sentAt: expect.any(String),
  });
  expect(await mesa.sessions.notes.clearSent(id)).toEqual({ removed: [kept.id] });
  expect((await mesa.sessions.notes.list(id)).map((n) => n.id)).toEqual([changed.id, draft.id]);
});
