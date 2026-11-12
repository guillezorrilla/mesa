import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../../mesa.js';
import { profilePaths } from '../../profile/paths.js';
import { listReceipts } from '../../receipts/store.js';
import {
  CLAUDE_VERSION,
  fakeTmux,
  projectProfile,
  scriptedRunner,
  sequentialIds,
  testDeps,
} from '../../testing/index.js';

const claudePane = (name: string) =>
  readFileSync(
    new URL(`../../agents/claude/fixtures/prompts/${name}.txt`, import.meta.url),
    'utf8',
  );
const codexPane = (name: string) =>
  readFileSync(new URL(`../../agents/codex/fixtures/panes/${name}.txt`, import.meta.url), 'utf8');

/** A profile with one session of `agent` open in a fake tmux, and a way to log its hook events. */
async function setUp(agent: 'claude' | 'codex' = 'claude') {
  const world = fakeTmux();
  const scripted = scriptedRunner({
    tmux: world.answer,
    claude: CLAUDE_VERSION,
    codex: 'codex-cli 0.160.0',
  });
  const newId = sequentialIds();
  const { home, mesa } = projectProfile(scripted.run, { newId });
  const { result: opened } = await mesa.sessions.open('lantern-cove', { agent });
  const window = world.windows[0];
  if (!window) throw new Error('no window opened');
  const events = profilePaths(home, 'default').events;
  const hook = (at: string, event: string, payload: object) => {
    mkdirSync(events, { recursive: true });
    const line = { at, agent, event, mesaSessionId: opened.id, payload };
    appendFileSync(join(events, `${opened.id}.jsonl`), `${JSON.stringify(line)}\n`);
  };
  const within = createMesa(
    'default',
    testDeps(home, { run: scripted.run, newId, env: { MESA_SESSION_ID: 'zzzzzzzz' } }),
  );
  return { home, mesa, within, window, id: opened.id, hook };
}

const bash = { tool_name: 'Bash', tool_input: { command: 'touch beacon.txt' } };

test('a permission prompt is read with Allow and Deny, and allow presses 1 with a receipt', async () => {
  const { home, mesa, window, id, hook } = await setUp();
  hook('2026-09-24T11:59:00.000Z', 'PermissionRequest', bash);
  hook('2026-09-24T11:59:06.000Z', 'Notification', { notification_type: 'permission_prompt' });
  window.screen = claudePane('bash');
  const pending = await mesa.sessions.prompt(id);
  expect(pending).toMatchObject({
    status: 'pending',
    session: id,
    kind: 'permission',
    tool: 'Bash',
    summary: 'touch beacon.txt',
    options: [
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Deny' },
    ],
    freeText: false,
  });
  if (pending.status !== 'pending') throw new Error('not pending');
  const { result, receipt } = await mesa.sessions.answer(
    id,
    { option: 'allow', prompt: pending.id },
    'app',
  );
  expect(result).toMatchObject({
    answered: true,
    prompt: pending.id,
    option: 'allow',
    answer: 'Allow',
  });
  expect(window.keys).toEqual(['1']);
  expect(receipt).not.toBeNull();
  const [kept] = listReceipts(join(home, 'vault'));
  expect(kept?.receipt).toMatchObject({
    kind: 'answer',
    session: id,
    inputs: { session: id, via: 'app', option: 'allow', prompt: pending.id },
    outputs: {
      prompt: pending.id,
      kind: 'permission',
      summary: 'touch beacon.txt',
      answer: 'Allow',
    },
  });
});

test('deny presses Esc; a Codex approval answers with y', async () => {
  const claude = await setUp();
  claude.hook('2026-09-24T11:59:00.000Z', 'PermissionRequest', bash);
  claude.window.screen = claudePane('bash');
  await claude.mesa.sessions.answer(claude.id, { option: 'deny' });
  expect(claude.window.keys).toEqual(['Escape']);

  const codex = await setUp('codex');
  codex.window.screen = codexPane('waiting-approval');
  expect(await codex.mesa.sessions.prompt(codex.id)).toMatchObject({
    kind: 'permission',
    summary: 'touch lantern.txt',
  });
  await codex.mesa.sessions.answer(codex.id, { option: 'allow' });
  expect(codex.window.keys).toEqual(['y']);
});

test('a question is answered by its option, or typed where it takes a typed answer', async () => {
  const { mesa, window, id, hook } = await setUp();
  hook('2026-09-24T11:59:00.000Z', 'PermissionRequest', {
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          question: 'Do you prefer red or blue?',
          options: [{ label: 'Red' }, { label: 'Blue' }],
          multiSelect: false,
        },
      ],
    },
  });
  window.screen = claudePane('question');
  expect(await mesa.sessions.prompt(id)).toMatchObject({
    kind: 'question',
    summary: 'Do you prefer red or blue?',
    options: [
      { id: '1', label: 'Red' },
      { id: '2', label: 'Blue' },
    ],
    freeText: true,
  });
  const picked = await mesa.sessions.answer(id, { option: '2' });
  expect(picked.result).toMatchObject({ option: '2', answer: 'Blue' });
  expect(window.keys).toEqual(['2']);
  window.keys.splice(0);
  const typed = await mesa.sessions.answer(id, { text: 'teal, honestly' });
  expect(typed.result.answer).toBe('teal, honestly');
  expect(window.keys).toEqual(['3', 'teal, honestly', 'Enter']);
  await expect(mesa.sessions.answer(id, { option: '9' })).rejects.toThrow(
    'no option 9 on this prompt; choose one of: 1, 2',
  );
});

test('a stale answer is refused and types nothing: answered in the pane, or another prompt now', async () => {
  const { mesa, window, id, hook } = await setUp();
  hook('2026-09-24T11:59:00.000Z', 'PermissionRequest', bash);
  window.screen = claudePane('bash');
  const first = await mesa.sessions.prompt(id);
  if (first.status !== 'pending') throw new Error('not pending');
  // Answered in the pane: the dialog is gone.
  window.screen = `${claudePane('bash')}\n\n⏺ Ran touch beacon.txt\n❯ `;
  await expect(mesa.sessions.answer(id, { option: 'allow', prompt: first.id })).rejects.toThrow(
    `stale answer: session ${id} waits on no prompt Mesa can answer now`,
  );
  // The next prompt, asking the same: a new hook event, so a new id.
  hook('2026-09-24T11:59:30.000Z', 'PermissionRequest', bash);
  window.screen = claudePane('bash');
  await expect(mesa.sessions.answer(id, { option: 'allow', prompt: first.id })).rejects.toThrow(
    `stale answer: session ${id} now waits on another prompt (see mesa prompt ${id})`,
  );
  expect(window.keys).toEqual([]);
});

test('an agent caller is refused; an unqualified prompt is unsupported; no prompt is a usage error', async () => {
  const { mesa, within, window, id, hook } = await setUp();
  hook('2026-09-24T11:59:00.000Z', 'PermissionRequest', bash);
  window.screen = claudePane('bash');
  await expect(within.sessions.answer(id, { option: 'allow' })).rejects.toThrow(
    `only a person answers a prompt; answer it there (mesa attach ${id})`,
  );
  expect(window.keys).toEqual([]);
  // Folder trust: a dialog no reader qualifies.
  window.screen = claudePane('folder-trust');
  expect(await mesa.sessions.prompt(id)).toEqual({
    status: 'unsupported',
    session: id,
    reason: `Mesa cannot answer this prompt; answer it in the pane (mesa attach ${id})`,
  });
  window.screen = '❯ ';
  await expect(mesa.sessions.prompt(id)).rejects.toThrow(
    `session ${id} is not waiting on a prompt`,
  );
});
