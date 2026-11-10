import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  agentWorld,
  claudeAnswer,
  type FakeWindow,
  finishesRun,
  gitRepo,
  projectProfile,
  testGit,
  withRealGit,
} from '../testing/index.js';
import { splitTitle } from './message.js';
import { cutPatch, dataFence, fillRecipe } from './recipes.js';

/** lantern-cove as a git repository on main, and a claude whose git-text run answers `answer`. */
function setUp(answer = 'Add the harbour tide table') {
  const inputs: string[] = [];
  const world = agentWorld({
    onOpen: (w: FakeWindow) => {
      const stdin = / <'([^']+)' >/.exec(w.launch)?.[1];
      if (stdin) inputs.push(readFileSync(stdin, 'utf8'));
      finishesRun({ output: claudeAnswer(answer) })(w);
    },
  });
  const profile = projectProfile(withRealGit(world.run), { mesaYaml: 'name: lantern-cove\n' });
  gitRepo(profile.dir);
  return { ...profile, world, inputs };
}

test('fillRecipe fills the names it is given and leaves an unknown one as written', () => {
  expect(
    fillRecipe('{branch}: {stagedFiles} {unknown} {branch}', {
      branch: 'main',
      stagedFiles: 'A\tx',
    }),
  ).toBe('main: A\tx {unknown} main');
});

test('the fence outgrows any backticks in the patch, and a long patch is cut at a line with a note', () => {
  expect(dataFence('diff', '+a ```` b')).toBe('`````diff\n+a ```` b\n`````');
  const patch = `${'+line\n'.repeat(10)}`;
  expect(cutPatch(patch, 1000)).toBe(patch);
  expect(cutPatch(patch, 15)).toBe(
    '+line\n+line\n[Mesa cut the patch here: 48 more bytes of it are not shown]\n',
  );
});

test('a commit message comes from a git-text run given the filled recipe on stdin, and nothing is committed', async () => {
  const { dir, mesa, world, inputs } = setUp();
  mesa.config.set('run.allowedTools', '["Bash(git log:*)"]');
  writeFileSync(join(dir, 'tides.md'), 'High water at 06:12\n');
  testGit(dir, 'add', 'tides.md');
  const head = testGit(dir, 'rev-parse', 'HEAD');

  const written = await mesa.git.message('lantern-cove');
  expect(written).toEqual({
    message: 'Add the harbour tide table',
    run: { session: expect.any(String), durationMs: 19113, costUsd: 0.2621986 },
  });
  const launch = world.tmux.opened[0]?.launch ?? '';
  expect(launch).toContain("claude -p '/git-text'");
  // Text only: nothing the profile allows, and no tool that writes a file or runs a command.
  expect(launch).toContain("--permission-mode 'default'");
  expect(launch).toMatch(
    /--disallowedTools .*'Bash' 'Edit' 'MultiEdit' 'Write' 'NotebookEdit' --allowedTools/,
  );
  expect(launch).not.toContain('Bash(git log:*)');
  const [input] = inputs;
  expect(input).toContain(
    'Branch: ```text\nmain\n```\n\nRecent commits:\n```text\ninit\n```\n\nStaged files:\n```text\nA\ttides.md\n```\n',
  );
  expect(input).toMatch(
    /Staged patch:\n```diff\ndiff --git a\/tides.md b\/tides.md\n[\s\S]*\+High water at 06:12\n```$/,
  );
  expect(testGit(dir, 'rev-parse', 'HEAD')).toBe(head);
  expect(testGit(dir, 'diff', '--cached', '--name-only')).toBe('tides.md');
});

test("the project's recipe overrides the profile's, and an empty index is refused before any run", async () => {
  const { dir, mesa, world, inputs } = setUp('Tide table');
  await expect(mesa.git.message('lantern-cove')).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('nothing is staged'),
  });
  expect(world.tmux.opened).toEqual([]);

  // As a person types it at a shell: prose, kept exactly, not read as YAML.
  const recipe = 'One imperative line #tides about: {stagedFiles}\nKeep {ticket}.';
  mesa.projects.override('lantern-cove', 'git.commitMessageRecipe', recipe);
  writeFileSync(join(dir, 'tides.md'), 'Low water\n');
  testGit(dir, 'add', 'tides.md');
  expect((await mesa.git.message('lantern-cove')).message).toBe('Tide table');
  expect(inputs).toEqual([
    'One imperative line #tides about: ```text\nA\ttides.md\n```\nKeep {ticket}.',
  ]);
  // The app sends it as a JSON string.
  const sent = mesa.projects.override(
    'lantern-cove',
    'git.commitMessageRecipe',
    JSON.stringify('A: {branch}'),
  );
  expect(sent.result.value).toBe('A: {branch}');
});

test('a staged patch over 200 KB reaches the run cut, with the line saying so', async () => {
  const { dir, mesa, inputs } = setUp();
  writeFileSync(join(dir, 'soundings.csv'), 'depth,12.5\n'.repeat(30_000));
  testGit(dir, 'add', 'soundings.csv');
  await mesa.git.message('lantern-cove');
  const [input = ''] = inputs;
  expect(input).toContain('[Mesa cut the patch here: ');
  expect(Buffer.byteLength(input)).toBeLessThan(201_000);
});

test('a failed run is an error naming the run and its reason', async () => {
  const world = agentWorld({ onOpen: finishesRun({ output: '', status: 1 }) });
  const { dir, mesa } = projectProfile(withRealGit(world.run), {
    mesaYaml: 'name: lantern-cove\n',
  });
  gitRepo(dir);
  writeFileSync(join(dir, 'tides.md'), 'x\n');
  testGit(dir, 'add', 'tides.md');
  await expect(mesa.git.message('lantern-cove')).rejects.toMatchObject({
    code: 'internal',
    message: expect.stringMatching(/^the git-text run \w{8} wrote no text: /),
  });
});

test('with --agent codex, the run is in Codex read-only sandbox', async () => {
  const { dir, mesa, world } = setUp();
  writeFileSync(join(dir, 'tides.md'), 'x\n');
  testGit(dir, 'add', 'tides.md');
  await mesa.git.message('lantern-cove', { agent: 'codex' }).catch(() => undefined);
  const launch = world.tmux.opened[0]?.launch ?? '';
  expect(launch).toContain('codex exec');
  expect(launch).toContain('-c sandbox_mode=read-only');
});

test('the answer splits into a title, without a leading # or Title:, and the body after it', () => {
  expect(splitTitle('# Add the tide table\n\nIt lists high and low water.\n')).toEqual({
    title: 'Add the tide table',
    body: 'It lists high and low water.',
  });
  expect(splitTitle('Title: Add soundings')).toEqual({ title: 'Add soundings', body: '' });
});

test('pull request text comes from the branch since its merge-base, its commits and base filled in', async () => {
  const { dir, mesa, inputs } = setUp('## Add the harbour tables\n\n- Tide table\n- Soundings');
  await expect(mesa.git.prText('lantern-cove')).rejects.toMatchObject({
    code: 'usage',
    message: 'main has no commits past main and no changes to describe',
  });
  testGit(dir, 'switch', '-q', '-c', 'harbour-tables');
  for (const [file, subject] of [
    ['tides.md', 'Add the tide table'],
    ['soundings.md', 'Add the soundings'],
  ] as const) {
    writeFileSync(join(dir, file), `${subject}\n`);
    testGit(dir, 'add', file);
    testGit(dir, 'commit', '-q', '-m', subject, '-m', `Why: ${file}`);
  }
  const written = await mesa.git.prText('lantern-cove', { base: 'main' });
  expect(written).toEqual({
    title: 'Add the harbour tables',
    body: '- Tide table\n- Soundings',
    run: { session: expect.any(String), durationMs: 19113, costUsd: 0.2621986 },
  });
  const [input = ''] = inputs;
  expect(input).toContain('Branch: ```text\nharbour-tables\n```, into ```text\nmain\n```');
  expect(input).toContain(
    'Commits:\n```text\nAdd the tide table\n\nWhy: tides.md\n\nAdd the soundings\n\nWhy: soundings.md\n```',
  );
  expect(input).toMatch(/Patch:\n```diff\n[\s\S]*\+Add the soundings\n[\s\S]*```$/);

  mesa.projects.override('lantern-cove', 'git.pullRequestRecipe', 'A title for {branch}');
  await mesa.git.prText('lantern-cove', { base: 'main' });
  expect(inputs[1]).toBe('A title for ```text\nharbour-tables\n```');
});
