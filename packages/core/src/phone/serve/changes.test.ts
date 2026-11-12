import { expect, test } from 'vitest';
import { DIFF_START, type DiffLine, diffLines } from '../protocol/diff-lines.js';
import { callResults } from '../protocol/rpc.js';
import { answerChanges, type ChangesDeps } from './changes.js';
import { DIFF_KEPT_MS, keptDiffs } from './kept-diffs.js';

const PATCH = [
  'diff --git a/src/tide.ts b/src/tide.ts',
  'index 1111111..2222222 100644',
  '--- a/src/tide.ts',
  '+++ b/src/tide.ts',
  '@@ -1,2 +1,3 @@',
  ' export const tide = 1;',
  '-export const ebb = 2;',
  '+export const ebb = 3;',
  '+export const flood = 4;',
  'diff --git a/old.md b/old.md',
  'deleted file mode 100644',
  '--- a/old.md',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-gone',
  'diff --git a/logo.png b/logo.png',
  'new file mode 100644',
  'Binary files /dev/null and b/logo.png differ',
  '',
].join('\n');

const REPLY = 'Done.\n\n```ts\nexport const ebb = 3;\n```\nShall I push?';

/** Fake core functions over invented content, keeping what each was asked. */
function fakeDeps(patch = PATCH) {
  const asked: unknown[][] = [];
  const keep =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      asked.push([name, ...args]);
      return value;
    };
  const deps: ChangesDeps = {
    diff: async () => ({ base: 'main', branch: 'tide', omitted: 0, patch }),
    where: () => ({ project: 'lantern-cove', checkout: '/work/lantern-cove' }),
    note: keep('note', { delivery: { status: 'delivered' } }),
    replies: () => ({
      rows: [{ profile: 'default', source: 'src1', revision: 'rev1', text: REPLY }],
    }),
    quote: keep('quote', { status: 'failed', reason: 'the guardrail asks first' }),
    git: {
      status: async () => ({
        branch: 'tide',
        changes: [{ path: 'src/tide.ts', index: 'M', workingTree: ' ', conflicted: undefined }],
      }),
      stage: keep('stage', {}),
      unstage: keep('unstage', {}),
      message: keep('message', { message: 'Raise the ebb' }),
      commit: keep('commit', { result: { oid: 'abc1234' } }),
      push: keep('push', { result: { remote: 'origin', upstream: 'tide' } }),
      pull: keep('pull', { result: { remote: 'origin', upstream: 'tide' } }),
      branches: async () => ({
        branches: [
          { name: 'main', current: false, checkedOutAt: '/work/lantern-cove-main' },
          { name: 'tide', current: true, checkedOutAt: '/work/lantern-cove' },
          { name: 'spare', current: false },
        ],
      }),
      branchCheckout: keep('switch', {}),
    },
    files: {
      tree: async () => ({
        entries: [
          { path: 'src', kind: 'directory' },
          { path: 'src/tide.ts', kind: 'file' },
        ],
        truncated: false,
      }),
      search: keep('search', { hits: [{ path: 'src/tide.ts', line: 1, preview: 'tide' }] }),
      read: async () => ({ text: 'export const tide = 1;\n' }),
      image: async (_project, path) => ({
        mime: 'image/png',
        bytes: Buffer.alloc(path === 'big.png' ? 500 * 1024 : 4, 1),
      }),
    },
  };
  return { deps, asked };
}

const answer = (deps: ChangesDeps, call: Parameters<typeof answerChanges>[1]) =>
  answerChanges(deps, call).then((result) => callResults[call.method].parse(result));

test('changes lists each file with its counts: an edit, a deletion and a binary file', async () => {
  const { deps } = fakeDeps();
  const result = await answer(deps, { method: 'changes', id: 's1' });
  expect(result).toMatchObject({
    base: 'main',
    branch: 'tide',
    files: [
      { path: 'src/tide.ts', added: 2, removed: 1 },
      { path: 'old.md', added: 0, removed: 1 },
      { path: 'logo.png', added: 0, removed: 0 },
    ],
  });
});

test('a 1 MB file diff comes in pages that each fit one call and number on as the whole', async () => {
  const added = Array.from({ length: 20_000 }, (_, n) => `+const line${n} = '${'x'.repeat(40)}';`);
  const patch = [
    'diff --git a/big.ts b/big.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/big.ts',
    `@@ -0,0 +1,${added.length} @@`,
    ...added,
  ].join('\n');
  expect(patch.length).toBeGreaterThan(1_000_000);
  const { deps } = fakeDeps(patch);
  const rows: DiffLine[] = [];
  let from = 0;
  let total = 1;
  while (from < total) {
    const page = await answer(deps, { method: 'diff', id: 's1', path: 'big.ts', from });
    expect(JSON.stringify(page).length).toBeLessThan(64 * 1024);
    rows.push(...diffLines(page.lines, page.at).rows);
    from += page.lines.length;
    total = page.total;
  }
  expect(rows).toEqual(diffLines(patch.split('\n'), DIFF_START).rows);
  expect(rows.at(-1)).toMatchObject({ kind: 'add', new: 20_000 });
});

test('a diff page for a file with no changes now is not found', async () => {
  const { deps } = fakeDeps();
  await expect(
    answer(deps, { method: 'diff', id: 's1', path: 'gone.ts', from: 0 }),
  ).rejects.toThrow('gone.ts has no changes now');
});

test('a note keeps its lines and goes to the agent; a quote finds its passage in the reply', async () => {
  const { deps, asked } = fakeDeps();
  const note = { path: 'src/tide.ts', line: 2, end: 3, text: 'why 3?' };
  expect(await answer(deps, { method: 'note', id: 's1', ...note })).toEqual({
    status: 'delivered',
  });
  const passage = 'export const ebb = 3;';
  expect(
    await answer(deps, { method: 'quote', id: 's1', revision: 'rev1', passage, comment: 'why?' }),
  ).toEqual({ status: 'failed', reason: 'the guardrail asks first' });
  const start = REPLY.indexOf(passage);
  expect(asked).toEqual([
    ['note', 's1', note],
    [
      'quote',
      's1',
      {
        profile: 'default',
        source: 'src1',
        revision: 'rev1',
        start,
        end: start + 21,
        comment: 'why?',
      },
    ],
  ]);
  await expect(
    answer(deps, { method: 'quote', id: 's1', revision: 'old', passage, comment: 'why?' }),
  ).rejects.toThrow('that reply changed');
});

test('source control goes to the session checkout: stage, unstage, commit, push and switch', async () => {
  const { deps, asked } = fakeDeps();
  const at = ['lantern-cove'];
  const where = '/work/lantern-cove';
  expect(await answer(deps, { method: 'status', id: 's1' })).toEqual({
    branch: 'tide',
    files: [{ path: 'src/tide.ts', index: 'M', workingTree: ' ' }],
  });
  await answer(deps, { method: 'stage', id: 's1', path: 'a.ts', staged: true });
  await answer(deps, { method: 'stage', id: 's1', path: 'a.ts', staged: false });
  expect(await answer(deps, { method: 'message', id: 's1' })).toEqual({ message: 'Raise the ebb' });
  expect(await answer(deps, { method: 'commit', id: 's1', message: 'Raise' })).toEqual({
    oid: 'abc1234',
  });
  expect(await answer(deps, { method: 'sync', id: 's1', action: 'push' })).toEqual({
    remote: 'origin',
    upstream: 'tide',
  });
  expect(await answer(deps, { method: 'branches', id: 's1' })).toEqual({
    current: 'tide',
    names: ['tide', 'spare'],
  });
  await answer(deps, { method: 'switch', id: 's1', name: 'spare' });
  expect(asked).toEqual([
    ['stage', ...at, 'a.ts', where],
    ['unstage', ...at, 'a.ts', where],
    ['message', ...at, { checkout: where }],
    ['commit', ...at, 'Raise', where],
    ['push', ...at, where],
    ['switch', ...at, 'spare', where],
  ]);
});

test('files: the tree, a search, a text file, and an image unless it is over 400 KB', async () => {
  const { deps } = fakeDeps();
  expect(await answer(deps, { method: 'files', id: 's1' })).toEqual({
    entries: [
      { path: 'src', dir: true },
      { path: 'src/tide.ts', dir: false },
    ],
    truncated: false,
  });
  expect(
    await answer(deps, { method: 'search', id: 's1', query: 'tide', mode: 'content' }),
  ).toEqual({ hits: [{ path: 'src/tide.ts', line: 1, preview: 'tide' }] });
  expect(await answer(deps, { method: 'file', id: 's1', path: 'src/tide.ts' })).toEqual({
    kind: 'text',
    text: 'export const tide = 1;\n',
  });
  expect(await answer(deps, { method: 'file', id: 's1', path: 'logo.PNG' })).toEqual({
    kind: 'image',
    mime: 'image/png',
    data: 'AQEBAQ==',
  });
  await expect(answer(deps, { method: 'file', id: 's1', path: 'big.png' })).rejects.toThrow(
    'over 400 KB',
  );
});

test("a diff page reuses the session's last read for a minute; the file list reads anew", async () => {
  let reads = 0;
  let now = 0;
  const diff = keptDiffs(
    async (id: string) => `${id} read ${++reads}`,
    () => now,
  );
  expect(await diff('s1')).toBe('s1 read 1');
  expect(await diff('s1', true)).toBe('s1 read 1');
  expect(await diff('s2', true)).toBe('s2 read 2');
  now = DIFF_KEPT_MS;
  expect(await diff('s1', true)).toBe('s1 read 3');
  expect(await diff('s1')).toBe('s1 read 4');
});
