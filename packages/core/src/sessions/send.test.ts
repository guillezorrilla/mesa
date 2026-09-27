import { spawn } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { profilePaths } from '../profile/paths.js';
import { listReceipts } from '../receipts/store.js';
import {
  CLAUDE_VERSION,
  fakeTmux,
  projectProfile,
  scriptedRunner,
  sequentialIds,
  staleLock,
  tempDir,
  testDeps,
  testStore,
} from '../testing/index.js';
import { sessionStore } from './store.js';

/** A profile with its vault laid out and one claude session open in a fake tmux. */
async function setUp() {
  const world = fakeTmux();
  const scripted = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION });
  const newId = sequentialIds();
  const { home, mesa } = projectProfile(scripted.run, { newId });
  /** Mesa as an agent inside a window sees it: that window's session and profile in its env. */
  const within = (env: Record<string, string>) =>
    createMesa('default', testDeps(home, { run: scripted.run, newId, env }));
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
    // The guardrail's allow, with its probabilities.
    decisions: [
      { question: 'verdict', kind: 'Choice', answer: 'allow', backend: 'rules' },
      { question: 'secret-or-destructive', kind: 'Noul', answer: false, probabilities: 0.05 },
    ],
  });
  expect(latest?.receipt.outputs).not.toHaveProperty('override');
});

test('a destructive prompt is blocked with its decision in a blocked receipt; --force sends it, noted', async () => {
  const { home, mesa, window, opened } = await setUp();
  await expect(mesa.sessions.send(opened.id, 'run rm -rf /')).rejects.toMatchObject({
    code: 'guardrail_blocked',
    message:
      'blocked: the text holds a destructive command (rm -rf); pass --force to send it anyway',
    details: { verdict: 'block' },
  });
  expect(window.typed).toEqual([]);
  const [blocked] = listReceipts(join(home, 'vault'), 1);
  expect(blocked?.receipt).toMatchObject({
    status: 'blocked',
    inputs: { session: opened.id, prompt: 'run rm -rf /', force: false },
    outputs: { error: { code: 'guardrail_blocked' } },
    // To 6 decimals: the rules' 0.95, without the float noise of normalising.
    decisions: [
      { question: 'verdict', kind: 'Choice', answer: 'block', confidence: 0.95, backend: 'rules' },
      { question: 'secret-or-destructive', kind: 'Noul', answer: true, probabilities: 0.95 },
    ],
  });

  const { result } = await mesa.sessions.send(opened.id, 'run rm -rf /', { force: true });
  expect(result.override).toBe('force');
  expect(window.typed).toEqual(['run rm -rf /']);
  const [forced] = listReceipts(join(home, 'vault'), 1);
  expect(forced?.receipt).toMatchObject({
    status: 'ok',
    outputs: { override: 'force' },
    decisions: [{ question: 'verdict', answer: 'block' }, { answer: true }],
  });
});

test('a strict project asks: --yes, a person yes, or --force sends; without one, or on a no, it is blocked', async () => {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const { home, mesa } = projectProfile(run, {
    mesaYaml: 'name: lantern-cove\nguardrail: strict\n',
  });
  const { result: opened } = await mesa.sessions.open('lantern-cove');
  const latest = () => listReceipts(join(home, 'vault'), 1)[0]?.receipt;
  await expect(mesa.sessions.send(opened.id, 'hello')).rejects.toMatchObject({
    code: 'guardrail_blocked',
    message:
      'the guardrail asks first: project lantern-cove has guardrail: strict; pass --yes to send it',
    details: { verdict: 'ask' },
  });
  expect(latest()).toMatchObject({ status: 'blocked', decisions: [{ answer: 'ask' }, {}] });

  const asked: string[] = [];
  const confirm = (yes: boolean) => async (question: string) => {
    asked.push(question);
    return yes;
  };
  await expect(
    mesa.sessions.send(opened.id, 'hello', { confirm: confirm(false) }),
  ).rejects.toMatchObject({
    code: 'guardrail_blocked',
    message: expect.stringMatching(/^declined/),
  });
  const said = await mesa.sessions.send(opened.id, 'one', { confirm: confirm(true) });
  expect(said.result.override).toBe('confirmed');
  expect(asked).toEqual([
    'Project lantern-cove has guardrail: strict. Send it?',
    'Project lantern-cove has guardrail: strict. Send it?',
  ]);
  const yes = await mesa.sessions.send(opened.id, 'two', { yes: true });
  expect(yes.result.override).toBe('yes');
  expect(latest()).toMatchObject({ inputs: { yes: true }, outputs: { override: 'yes' } });
  await mesa.sessions.send(opened.id, 'three', { force: true });
  expect(latest()?.outputs).toMatchObject({ override: 'force' });
  expect(world.windows[0]?.typed).toEqual(['one', 'two', 'three']);
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
  const store = testStore(home);
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
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const prompt = `use sk-live-1234 then ${'x'.repeat(100)}`;
  const { home, mesa } = projectProfile(run, { argv: ['send', 'SESSION', prompt] });
  mesa.config.set('keys.jev', 'sk-live-1234');
  const { result } = await mesa.sessions.open('lantern-cove');
  // A prompt holding one of the profile's keys is blocked, and its receipt redacts it too.
  await expect(mesa.sessions.send(result.id, prompt)).rejects.toMatchObject({
    code: 'guardrail_blocked',
  });
  expect(world.windows[0]?.typed).toEqual([]);
  const [latest] = listReceipts(join(home, 'vault'), 1);
  expect(latest?.receipt.status).toBe('blocked');
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
  const store = testStore(home);
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
  const store = testStore(home);
  store.update(a.id, { endedAt: '2026-09-24T12:00:00.000Z' });
  await refused({ from: a.id }, `session ${a.id} has ended, so a reply to it would go nowhere`);
});

test('a closing ; is typed as it is; a sender removed while typing still sends', async () => {
  let removeWhileTyping: (() => void) | undefined;
  const world = fakeTmux({ onKeys: () => removeWhileTyping?.() });
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const { home, mesa } = projectProfile(run);
  const { result: a } = await mesa.sessions.open('lantern-cove');
  const { result: b } = await mesa.sessions.open('lantern-cove');
  await mesa.sessions.send(b.id, 'plain;');
  expect(world.windows.find((w) => w.window === `claude-${b.id}`)?.typed).toEqual(['plain;']);

  const store = testStore(home);
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

test('an agent in a window cannot force a wait even with --no-from; an ended window sends as none', async () => {
  const { home, mesa, within, opened: a } = await setUp();
  const { result: b } = await mesa.sessions.open('lantern-cove');
  const store = testStore(home);
  const at = '2026-09-24T12:00:00.000Z';
  store.update(b.id, {
    lastState: { state: 'waiting-question', confidence: 0.95, at, source: 'hook' },
  });
  const inA = within({ MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' });
  await expect(inA.sessions.send(b.id, 'yes', { noFrom: true, force: true })).rejects.toMatchObject(
    { code: 'usage', message: expect.stringContaining('a person answers it') },
  );

  store.update(b.id, { lastState: { state: 'idle', confidence: 0.95, at, source: 'hook' } });
  store.update(a.id, { endedAt: at });
  expect((await inA.sessions.send(b.id, 'hello')).result.from).toBeNull();
});

test('events are best effort once the prompt is typed: a locked receiver warns and skips the sent', async () => {
  const { home, mesa, opened: a } = await setUp();
  const { result: b } = await mesa.sessions.open('lantern-cove');
  const dir = profilePaths(home, 'default').sessions;
  const lock = staleLock(home, b.id);
  const { result, receipt } = await mesa.sessions.send(b.id, 'typed anyway', { from: a.id });
  expect(result).toMatchObject({ sent: true, from: a.id });
  expect(result.warning).toBe(
    `the prompt was typed, but no send event on ${b.id} (its record is locked by another mesa process); no sent event on ${a.id}; do not send it again`,
  );
  expect(receipt).not.toBeNull();
  rmSync(lock);
  const store = sessionStore({ dir, newId: () => 'x' });
  // No `sent` on the sender without its `send` on the receiver.
  expect(store.get(b.id).events).toEqual([]);
  expect(store.get(a.id).events).toEqual([]);
});

test('--no-from is kept in the receipt', async () => {
  const { home, mesa, opened } = await setUp();
  await mesa.sessions.send(opened.id, 'as a person', { noFrom: true });
  const [latest] = listReceipts(join(home, 'vault'), 1);
  expect(latest?.receipt.inputs).toMatchObject({ noFrom: true });
  expect(latest?.receipt.outputs).toMatchObject({ from: null });
});

test('a function patch runs under the lock; an update waits while another process holds it', async () => {
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
  const lock = join(dir, `${record.id}.lock`);
  let held = false;
  store.update(record.id, () => {
    held = existsSync(lock);
    return {};
  });
  expect(held).toBe(true);
  expect(existsSync(lock)).toBe(false);

  // Another process holds it for about 100 ms, then lets go: the update waits and lands.
  writeFileSync(lock, 'another process');
  const release = spawn('sh', ['-c', `sleep 0.1; rm ${lock}`]);
  await new Promise((resolve) => release.on('spawn', resolve));
  expect(store.update(record.id, { lastOutput: 'waited' }).lastOutput).toBe('waited');
  await new Promise((resolve) => release.on('exit', resolve));
  // Removing waits for it too, and refuses while another holds it.
  writeFileSync(lock, 'another process');
  expect(() => store.remove(record.id)).toThrow(expect.objectContaining({ code: 'locked' }));
  rmSync(lock);
  store.remove(record.id);
  expect(store.find(record.id)).toBeUndefined();
});

test('any error writing events after typing is a warning, and any Mesa window counts as an agent', async () => {
  const { home, mesa, within, opened: a } = await setUp();
  const { result: b } = await mesa.sessions.open('lantern-cove');
  const dir = profilePaths(home, 'default').sessions;
  // A sessions folder this process cannot write (as a sandboxed agent may see it).
  chmodSync(dir, 0o500);
  try {
    const { result } = await mesa.sessions.send(b.id, 'typed anyway');
    expect(result.warning).toMatch(/^the prompt was typed, but no send event on \w+ \(EACCES/);
  } finally {
    chmodSync(dir, 0o700);
  }
  // Another profile's window: no sender, but still an agent that may not force a wait.
  const store = sessionStore({ dir, newId: () => 'x' });
  const at = '2026-09-24T12:00:00.000Z';
  store.update(b.id, {
    lastState: { state: 'waiting-permission', confidence: 0.95, at, source: 'hook' },
  });
  const elsewhere = within({ MESA_SESSION_ID: a.id, MESA_PROFILE: 'work' });
  await expect(elsewhere.sessions.send(b.id, 'yes', { force: true })).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('a person answers it'),
  });
});

test('a config.yaml that does not read still lets a prompt through: only the receipt is lost', async () => {
  const { home, mesa, window, opened } = await setUp();
  const config = profilePaths(home, 'default').config;
  writeFileSync(config, `${readFileSync(config, 'utf8')}surprise: 1\n`);
  const { result } = await mesa.sessions.send(opened.id, 'still here');
  expect(result.sent).toBe(true);
  expect(window.typed).toEqual(['still here']);
});
