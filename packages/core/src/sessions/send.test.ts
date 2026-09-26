import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts.js';
import { fakeTmux, scriptedRunner, sequentialIds, tempDir, testDeps } from '../testing.js';
import { sessionStore } from './store.js';

/** A profile with its vault laid out and one claude session open in a fake tmux. */
async function setUp() {
  const home = tempDir();
  const world = fakeTmux();
  const scripted = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' });
  const newId = sequentialIds();
  const mesa = createMesa('default', testDeps(home, { run: scripted.run, newId }));
  /** Mesa as an agent inside a window sees it: that window's session and profile in its env. */
  const within = (env: Record<string, string>) =>
    createMesa('default', testDeps(home, { run: scripted.run, newId, env }));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  mesa.projects.register(join(home, 'src/lantern-cove'), true);
  const { result: opened } = await mesa.sessions.open('lantern-cove');
  const window = world.windows[0];
  if (!window) throw new Error('no window opened');
  return { home, mesa, within, world, window, opened, calls: scripted.calls };
}

test('send types the prompt, records a send event, and writes an action receipt', async () => {
  const { home, mesa, window, opened } = await setUp();
  const prompt = `say hello ${'and more '.repeat(12)}`;
  const { result, receipt } = await mesa.sessions.send(opened.id, prompt);
  expect(result).toMatchObject({ sent: true, session: opened.id, chars: prompt.length });
  expect(window.typed).toEqual([prompt]);

  const [row] = await mesa.sessions.list();
  expect(row?.managed && row.events).toEqual([
    { type: 'send', at: '2026-09-24T12:00:00.000Z', chars: prompt.length },
  ]);
  const [latest] = listReceipts(join(home, 'vault'), 1);
  expect(latest?.receipt).toMatchObject({
    id: receipt?.id,
    type: 'action',
    status: 'ok',
    session: opened.id,
    project: 'lantern-cove',
    inputs: { session: opened.id, prompt: prompt.slice(0, 80), force: false },
    outputs: { chars: prompt.length },
  });
});

test('a multi-line prompt goes as one literal chunk, then one Enter', async () => {
  const { mesa, window, opened, calls } = await setUp();
  const prompt = 'first line\nsecond line\nthird';
  await mesa.sessions.send(opened.id, prompt);
  expect(window.typed).toEqual([prompt]);
  const keys = calls
    .filter((c) => c.args[4] === 'send-keys')
    // After `send-keys -t <target>`.
    .map((c) => c.args.slice(c.args.indexOf('send-keys') + 3));
  expect(keys).toEqual([['-l', '--', prompt], ['Enter']]);
});

test('an exited or vanished session is not_found; a shell is refused unless --force', async () => {
  const { mesa, world, window, opened } = await setUp();
  window.running = 'zsh'; // the agent is gone and its pane runs a shell
  await expect(mesa.sessions.send(opened.id, 'hi')).rejects.toMatchObject({
    code: 'usage',
    message: `session ${opened.id} runs zsh, not its agent; --force sends anyway`,
  });
  expect(window.typed).toEqual([]);
  await mesa.sessions.send(opened.id, 'echo forced', { force: true });
  expect(window.typed).toEqual(['echo forced']);

  window.dead = true;
  await expect(mesa.sessions.send(opened.id, 'hi', { force: true })).rejects.toMatchObject({
    code: 'not_found',
    message: 'session ended; use mesa resume',
  });
  world.windows.splice(0);
  await expect(mesa.sessions.send(opened.id, 'hi')).rejects.toMatchObject({ code: 'not_found' });
  await expect(mesa.sessions.send(opened.id, '  ')).rejects.toMatchObject({ code: 'usage' });
});

test('a session waiting on a person is refused, so Enter never answers its prompt', async () => {
  const { home, mesa, window, opened } = await setUp();
  const store = sessionStore({ dir: join(home, '.mesa/default/sessions'), newId: () => 'x' });
  const at = '2026-09-24T12:00:00.000Z';
  store.update(opened.id, {
    lastState: { state: 'waiting-permission', confidence: 0.95, at, source: 'hook' },
  });
  await expect(mesa.sessions.send(opened.id, 'yes')).rejects.toMatchObject({
    code: 'usage',
    message: `session ${opened.id} is waiting-permission; answer it there (mesa attach ${opened.id}), or --force`,
  });
  expect(window.typed).toEqual([]);
});

test('the receipt keeps 80 characters of the prompt, in its inputs and command, keys redacted', async () => {
  const home = tempDir();
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  const prompt = `use sk-live-1234 then ${'x'.repeat(100)}`;
  const mesa = createMesa('default', testDeps(home, { run, argv: ['send', 'SESSION', prompt] }));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mesa.config.set('keys.jev', 'sk-live-1234');
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  mesa.projects.register(join(home, 'src/lantern-cove'), true);
  const { result } = await mesa.sessions.open('lantern-cove');
  await mesa.sessions.send(result.id, prompt);
  const [latest] = listReceipts(join(home, 'vault'), 1);
  // Redacted first, then cut: a key that crosses character 80 never leaves a piece behind.
  const short = `use *** then ${'x'.repeat(67)}`;
  expect(latest?.receipt.inputs.prompt).toBe(short);
  expect(latest?.receipt.command).toBe(`mesa send SESSION ${JSON.stringify(short)}`);
});

test('a session sends to another: a header names the sender and how to reply; both records log it', async () => {
  const { home, mesa, world, opened: a } = await setUp();
  const { result: b } = await mesa.sessions.open('lantern-cove');
  const { result } = await mesa.sessions.send(b.id, 'Reply to A with the word pong', {
    from: a.id,
  });
  expect(result).toEqual({
    sent: true,
    session: b.id,
    project: 'lantern-cove',
    from: a.id,
    chars: 29,
  });
  const typed = world.windows.find((w) => w.window === `claude-${b.id}`)?.typed;
  expect(typed).toEqual([
    `[mesa] from session ${a.id} (lantern-cove). Reply with: mesa send ${a.id} "<reply>"\nReply to A with the word pong`,
  ]);
  const rows = await mesa.sessions.list();
  const events = (id: string) => {
    const row = rows.find((r) => r.id === id);
    return row?.managed ? row.events : undefined;
  };
  expect(events(b.id)).toEqual([
    { type: 'send', at: '2026-09-24T12:00:00.000Z', chars: 29, from: a.id },
  ]);
  expect(events(a.id)).toEqual([
    { type: 'sent', at: '2026-09-24T12:00:00.000Z', chars: 29, to: b.id },
  ]);
  const [latest] = listReceipts(join(home, 'vault'), 1);
  expect(latest?.receipt.inputs).toMatchObject({ session: b.id, from: a.id });
});

test('the sender defaults to the window it runs in; unknown or self is refused; none sends as before', async () => {
  const { mesa, within, world, opened: a } = await setUp();
  const { result: b } = await mesa.sessions.open('lantern-cove');
  const typedIn = (id: string) => world.windows.find((w) => w.window === `claude-${id}`)?.typed;

  const inA = within({ MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' });
  expect((await inA.sessions.send(b.id, 'hello')).result.from).toBe(a.id);
  expect(typedIn(b.id)?.at(-1)).toMatch(new RegExp(`^\\[mesa\\] from session ${a.id} `));

  await expect(inA.sessions.send(a.id, 'to me')).rejects.toMatchObject({
    code: 'usage',
    message: `session ${a.id} cannot send to itself`,
  });
  await expect(mesa.sessions.send(b.id, 'hi', { from: 'zzzzzzzz' })).rejects.toMatchObject({
    code: 'not_found',
    message: 'no session zzzzzzzz to send from; see mesa sessions',
  });
  await expect(mesa.sessions.send(b.id, 'hi', { from: b.id })).rejects.toMatchObject({
    code: 'usage',
  });

  // No sender: another profile's window, or none at all, types the text unchanged.
  for (const m of [within({ MESA_SESSION_ID: a.id, MESA_PROFILE: 'work' }), mesa]) {
    const { result } = await m.sessions.send(b.id, 'plain text');
    expect(result.from).toBeNull();
    expect(typedIn(b.id)?.at(-1)).toBe('plain text');
  }
});

test('another session cannot force a prompt into a wait; only a person answers it', async () => {
  const { home, mesa, world, opened: a } = await setUp();
  const { result: b } = await mesa.sessions.open('lantern-cove');
  const store = sessionStore({ dir: join(home, '.mesa/default/sessions'), newId: () => 'x' });
  const at = '2026-09-24T12:00:00.000Z';
  store.update(b.id, {
    lastState: { state: 'waiting-permission', confidence: 0.95, at, source: 'hook' },
  });
  await expect(mesa.sessions.send(b.id, 'yes', { from: a.id, force: true })).rejects.toMatchObject({
    code: 'usage',
    message: `session ${b.id} is waiting-permission; a person answers it there (mesa attach ${b.id})`,
  });
  expect(world.windows.find((w) => w.window === `claude-${b.id}`)?.typed).toEqual([]);
  // A person may still force it.
  await mesa.sessions.send(b.id, 'yes', { force: true });
});

test('--no-from sends as a person; an ended, empty, or doubled sender is refused', async () => {
  const { home, mesa, within, world, opened: a } = await setUp();
  const { result: b } = await mesa.sessions.open('lantern-cove');
  const inA = within({ MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' });
  const { result } = await inA.sessions.send(b.id, 'from the owner', { noFrom: true });
  expect(result.from).toBeNull();
  expect(world.windows.find((w) => w.window === `claude-${b.id}`)?.typed.at(-1)).toBe(
    'from the owner',
  );
  const refused = (opts: object, message: string) =>
    expect(mesa.sessions.send(b.id, 'hi', opts)).rejects.toMatchObject({ code: 'usage', message });
  await refused({ from: a.id, noFrom: true }, 'pass --from or --no-from, not both');
  await refused({ from: '' }, '--from needs a session id');
  const store = sessionStore({ dir: join(home, '.mesa/default/sessions'), newId: () => 'x' });
  store.update(a.id, { endedAt: '2026-09-24T12:00:00.000Z' });
  await refused({ from: a.id }, `session ${a.id} has ended, so a reply to it would go nowhere`);
});

test('a closing ; is typed as it is; a sender removed while typing still sends', async () => {
  const home = tempDir();
  let removeWhileTyping: (() => void) | undefined;
  const world = fakeTmux({ onKeys: () => removeWhileTyping?.() });
  const run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  const mesa = createMesa('default', testDeps(home, { run }));
  mesa.init({ vault: 'vault' });
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  mesa.projects.register(join(home, 'src/lantern-cove'), true);
  const { result: a } = await mesa.sessions.open('lantern-cove');
  const { result: b } = await mesa.sessions.open('lantern-cove');
  await mesa.sessions.send(b.id, 'plain;');
  expect(world.windows.find((w) => w.window === `claude-${b.id}`)?.typed).toEqual(['plain;']);

  const store = sessionStore({ dir: join(home, '.mesa/default/sessions'), newId: () => 'x' });
  removeWhileTyping = () => store.remove(a.id);
  const { result } = await mesa.sessions.send(b.id, 'still arrives', { from: a.id });
  expect(result.from).toBe(a.id);
  expect(store.get(b.id).events.at(-1)).toMatchObject({ type: 'send', from: a.id });
});

test('a record update waits for its lock and, while another holds it, is refused', () => {
  const dir = join(tempDir(), 'sessions');
  const store = sessionStore({ dir, newId: sequentialIds() });
  const record = store.create(() => ({
    kind: 'interactive',
    project: 'lantern-cove',
    agent: 'claude',
    tmux: { socket: 'mesa-default', session: 'lantern-cove', window: 'claude-x' },
    startedAt: '2026-09-24T12:00:00.000Z',
    lastState: { state: 'idle', confidence: 0.6, at: '2026-09-24T12:00:00.000Z', source: 'mesa' },
  }));
  // A function patch sees the record as it is now.
  store.update(record.id, { lastOutput: 'first' });
  const seen = store.update(record.id, (current) => ({ lastOutput: `${current.lastOutput} then` }));
  expect(seen.lastOutput).toBe('first then');
  // Another process holds the lock (its token is not ours).
  writeFileSync(join(dir, `${record.id}.lock`), 'another holder');
  expect(() => store.update(record.id, { lastOutput: 'blocked' })).toThrow(
    expect.objectContaining({ code: 'locked' }),
  );
  expect(store.get(record.id).lastOutput).toBe('first then');
});
