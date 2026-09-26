import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

const NOTE =
  '## Verified\n- 7 ADRs: `ls docs/adr | wc -l` printed 7\n## Assumed\n## Left out on purpose\n## Blocked\n';

/** A profile with lantern-cove, claude, a fake tmux, and a note file in the home. */
async function handoffWorld(failing?: string) {
  const world = cli.withTmux({ failing });
  await cli.withProject();
  const note = join(cli.home, 'note.md');
  writeFileSync(note, NOTE);
  const window = (id: string) => world.windows.find((w) => w.window === `claude-${id}`);
  const open = async (...flags: string[]) =>
    (await mesa('open', 'lantern-cove', ...flags, '--json')).json.data;
  const show = async (id: string) => (await mesa('show', id, '--json')).json.data;
  return { world, note, window, open, show };
}

test('handoff starts a successor with the goal and the note, then stops the session', async () => {
  const { note, window, open, show } = await handoffWorld();
  const a = await open('--goal', 'Count the files in docs/adr');
  const out = await mesa('handoff', a.id, '--note', note, '--json');
  expect(out.code).toBe(0);
  const { from, to, note: kept } = out.json.data;
  expect(from).toBe(a.id);
  expect(kept).toBe(join(cli.home, `.mesa/default/handoffs/${to}.md`));
  expect(readFileSync(kept, 'utf8')).toBe(NOTE);
  const b = await show(to);
  const goal = `Count the files in docs/adr\n\nRead the handoff note at ${kept} first.`;
  expect(b).toMatchObject({
    project: 'lantern-cove',
    agent: 'claude',
    parent: a.id,
    handoffFrom: a.id,
    goal,
  });
  expect(b.events).toEqual([{ type: 'handoff', at: expect.any(String), from: a.id, note: kept }]);
  // The successor's command line: its own session id, then the goal as one shell word.
  expect(window(to)?.launch).toBe(`claude --session-id ${b.agentSessionId} '${goal}'`);
  // Stopped from outside its window: at once.
  expect(window(a.id)).toBeUndefined();
  const old = await show(a.id);
  expect(old.endedAt).toEqual(expect.any(String));
  expect(old.events).toContainEqual({ type: 'handoff', at: expect.any(String), to, note: kept });
  // A second handoff, from the successor, keeps one note line: the newest.
  const c = (await mesa('handoff', to, '--note', note, '--json')).json.data;
  expect((await show(c.to)).goal).toBe(
    `Count the files in docs/adr\n\nRead the handoff note at ${c.note} first.`,
  );
  const receipts = (await mesa('receipts', '--json', '--limit', '20')).json.data;
  expect(
    receipts.find((r: { summary: string }) => r.summary.startsWith(`Handed off session ${a.id}`)),
  ).toMatchObject({
    receipt: { type: 'session', session: a.id },
  });
});

test('a session handing itself off is stopped by the tmux server a moment later', async () => {
  const { world, note, window, open } = await handoffWorld();
  const a = await open('--goal', 'Count the files');
  cli.env = { MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' };
  const out = await mesa('handoff', a.id, '--note', note);
  cli.env = {};
  expect(out.stdout).toContain(`${a.id} stops in a moment`);
  // Still running: its own stop would have killed this mesa half-way.
  expect(window(a.id)).toBeDefined();
  expect(world.ranLater).toEqual([
    `sleep 2; '/usr/local/bin/mesa' --profile 'default' stop ${a.id} >/dev/null 2>&1 || :`,
  ]);
});

test('--keep leaves the session running; no goal is usage, a missing note not_found', async () => {
  const { world, note, window, open, show } = await handoffWorld();
  const a = await open('--goal', 'Count the files');
  const kept = await mesa('handoff', a.id, '--note', note, '--keep', '--json');
  expect(kept.code).toBe(0);
  expect(window(a.id)).toBeDefined();
  expect((await show(a.id)).endedAt).toBeUndefined();
  expect(world.ranLater).toEqual([]);

  const bare = await open();
  const windows = world.windows.length;
  expect(await mesa('handoff', bare.id, '--note', note)).toMatchObject({ code: 2 });
  expect(await mesa('handoff', a.id, '--note', join(cli.home, 'nope.md'))).toMatchObject({
    code: 3,
  });
  expect(await mesa('handoff', a.id)).toMatchObject({ code: 2 });
  // Refused before anything was written: no successor, no window.
  expect(world.windows).toHaveLength(windows);
});

test('a stop that fails after the successor runs is a warning, never a failed handoff', async () => {
  const { world, note, open } = await handoffWorld('send-keys');
  const a = await open('--goal', 'Count the files');
  const out = await mesa('handoff', a.id, '--note', note, '--json');
  expect(out.code).toBe(0);
  expect(out.json.data.warning).toContain(`session ${a.id} not stopped`);
  expect(out.json.data.warning).toContain(`mesa stop ${a.id}`);
  // One successor: a retry is not needed, and would start a second.
  expect(world.windows.map((w) => w.window)).toEqual([
    `claude-${a.id}`,
    `claude-${out.json.data.to}`,
  ]);
});
