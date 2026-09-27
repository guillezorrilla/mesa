import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  claudeResult,
  codexResult,
  finishesRun,
  plantOutputLog,
  testStore,
} from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

const UUID = '00000000-0000-4000-8000-000000000001';

/** lantern-cove registered, and session-summary enabled for the profile. */
async function withSkill() {
  await cli.withProject();
  await mesa('config', 'set', 'skills', '[mesa, mesa-handoff, session-summary]');
}

test('run prints the result, its session, and cost; --json the result; sessions says it is a run', async () => {
  const world = cli.withTmux({ onOpen: finishesRun({ output: claudeResult('success') }) });
  await withSkill();

  const { json, code } = await mesa(
    'run',
    'session-summary',
    '--project',
    'lantern-cove',
    '--json',
    '--',
    '--since',
    'yesterday',
  );
  expect(code).toBe(0);
  const id = json.data.session;
  expect(json).toEqual({
    ok: true,
    data: {
      session: id,
      ok: true,
      output: expect.stringMatching(/^The session had no work to summarise/),
      agentSessionId: UUID,
      costUsd: 0.2621986,
      durationMs: 19113,
      receipt: { id: expect.stringMatching(/^01TEST/), path: expect.stringContaining('-skill-') },
    },
  });
  // The words after `--` are the skill's, flags or not.
  expect(world.windows).toEqual([]);
  expect(testStore(cli.home).get(id).goal).toBe('/session-summary --since yesterday');

  const plain = await mesa('run', 'session-summary', '--project', 'lantern-cove');
  const second = testStore(cli.home)
    .list()
    .find((r) => r.id !== id)?.id;
  // The agent session id is the one claude's result names (the fixture's).
  expect(plain.stdout.split('\n').slice(-2)).toEqual([
    `done: session ${second}, agent session ${UUID}, 19s (list price $0.2622)`,
    '',
  ]);

  const board = await mesa('sessions', '--all');
  expect(board.stdout.split('\n')[0]).toMatch(
    new RegExp(`^${id} +lantern-cove +claude \\(run\\) +done +100%`),
  );
  const rows = (await mesa('sessions', '--all', '--json')).json.data;
  expect(rows.map((r: { kind: string }) => r.kind)).toEqual(['run', 'run']);
});

test('a run that is not ok exits 1 with the reason; past --timeout it fails with timeout', async () => {
  cli.withTmux({ onOpen: finishesRun({ output: claudeResult('not-logged-in'), status: 1 }) });
  await withSkill();
  const failed = await mesa('run', 'session-summary', '--project', 'lantern-cove');
  expect(failed.code).toBe(1);
  expect(failed.stdout).toMatch(
    /\nfailed \(Not logged in · Please run \/login\): session [0-9a-z]{8}, agent session /,
  );

  // A claude that never exits.
  const world = cli.withTmux();
  const timedOut = await mesa(
    'run',
    'session-summary',
    '--project',
    'lantern-cove',
    '--timeout',
    '2',
  );
  expect(timedOut.code).toBe(9);
  expect(timedOut.stderr).toMatch(
    /^session [0-9a-z]{8} ran \/session-summary past its 2 s timeout: its window was closed and the session marked failed\n$/,
  );
  expect(world.windows).toEqual([]);
});

test('run refuses a bad timeout, a missing --project, and a skill not enabled before it starts', async () => {
  const world = cli.withTmux();
  await cli.withProject();
  const run = (...rest: string[]) => mesa('run', 'session-summary', ...rest);
  expect(await run('--project', 'lantern-cove', '--timeout', 'soon')).toMatchObject({
    code: 2,
    stderr: '--timeout must be a whole number, not soon\n',
  });
  expect(await run()).toMatchObject({ code: 2, stderr: expect.stringContaining('--project') });
  expect((await run('--project', 'lantern-cove')).stderr).toMatch(
    /^skill session-summary is not enabled/,
  );
  expect(world.windows).toEqual([]);
});

test('in a strict project, run --json with no terminal is guardrail_blocked, exit 5, opening nothing; --yes runs it', async () => {
  const world = cli.withTmux({ onOpen: finishesRun({ output: claudeResult('success') }) });
  const dir = await cli.withProject();
  writeFileSync(
    join(dir, 'mesa.yaml'),
    'name: lantern-cove\nguardrail: strict\nskills: [session-summary]\n',
  );
  const run = (...more: string[]) =>
    mesa('run', 'session-summary', '--project', 'lantern-cove', '--json', ...more);

  const asked = await run();
  expect(asked.code).toBe(5);
  expect(asked.json.error).toMatchObject({
    code: 'guardrail_blocked',
    details: { verdict: 'ask', reason: 'project lantern-cove has guardrail: strict' },
  });
  expect(world.windows).toEqual([]);
  expect(testStore(cli.home).list()).toEqual([]);
  const [blocked] = (await mesa('receipts', '--json', '--limit', '1')).json.data;
  expect(blocked.receipt).toMatchObject({ type: 'skill', status: 'blocked' });

  const destructive = await run('--', 'rm', '-rf', '/');
  expect(destructive).toMatchObject({
    code: 5,
    json: { error: { details: { verdict: 'block' } } },
  });
  expect(testStore(cli.home).list()).toEqual([]);

  const yes = await run('--yes');
  expect(yes.code).toBe(0);
  expect(yes.json.data).toMatchObject({ ok: true, override: 'yes' });
  const shown = await mesa('receipts', 'show', yes.json.data.receipt.id, '--json');
  expect(shown.json.data.receipt.outputs).toMatchObject({ override: 'yes' });
  expect(testStore(cli.home).list()).toHaveLength(1);
});

test('run session-summary --session writes the agent summary, linked to its receipt', async () => {
  cli.withTmux({ onOpen: finishesRun({ output: claudeResult('success') }) });
  await withSkill();
  const opened = (await mesa('open', 'lantern-cove', '--json')).json.data;
  plantOutputLog(cli.home, opened.id, '\x1b[32mAll three lantern checks pass.\x1b[0m\n');
  const { json, code } = await mesa('run', 'session-summary', '--session', opened.id, '--json');
  expect(code).toBe(0);
  expect(json.data.note).toBe(`wiki/sessions/${opened.id}.md`);
  expect(readFileSync(join(cli.home, 'vault', json.data.note), 'utf8')).toContain(
    json.data.output.trim(),
  );
  const receipt = (await mesa('receipts', 'show', json.data.receipt.id, '--json')).json.data
    .receipt;
  expect(receipt).toMatchObject({
    type: 'skill',
    status: 'ok',
    inputs: { session: opened.id },
    outputs: { note: json.data.note },
  });
});

test('project-brief is listed and runs through the public CLI with a linked project note', async () => {
  const brief =
    '## Purpose\nTrack lanterns.\n\n## Stack\nTypeScript.\n\n## How to run\nRun mesa.\n\n## Open threads\nAdd alerts.';
  cli.withTmux({
    onOpen: finishesRun({
      output: JSON.stringify({ ...JSON.parse(claudeResult('success')), result: brief }),
    }),
  });
  const dir = await cli.withProject();
  await mesa('config', 'set', 'skills', '[project-brief]');
  expect((await mesa('skills', 'list', 'lantern-cove', '--json')).json.data).toContainEqual(
    expect.objectContaining({ name: 'project-brief', source: 'mesa', enabled: true }),
  );
  const { json, code } = await mesa('run', 'project-brief', '--project', 'lantern-cove', '--json');
  expect(code).toBe(0);
  expect(json.data.note).toBe('projects/lantern-cove.md');
  expect(readFileSync(join(cli.home, 'vault', json.data.note), 'utf8')).toContain(brief);
  expect(
    (await mesa('receipts', 'show', json.data.receipt.id, '--json')).json.data.receipt,
  ).toMatchObject({ type: 'skill', status: 'ok', outputs: { note: json.data.note } });
  expect(readFileSync(join(cli.home, 'vault', json.data.note), 'utf8')).toContain(`repo: ${dir}`);
});

test('run --agent codex prints its JSON result and tokens, and sessions --all records its native thread', async () => {
  cli.withTmux({ onOpen: finishesRun({ output: codexResult('skill-stdin') }) });
  await withSkill();
  const ran = await mesa(
    'run',
    'session-summary',
    '--project',
    'lantern-cove',
    '--agent',
    'codex',
    '--json',
  );
  expect(ran.code).toBe(0);
  expect(ran.json.data).toMatchObject({
    ok: true,
    output: 'LANTERN_SKILL_OK TIDE_STDIN_731',
    agentSessionId: '00000000-0000-4000-8000-000000000002',
    durationMs: 0,
    usage: { input_tokens: 14851, output_tokens: 16 },
  });
  expect(ran.json.data).not.toHaveProperty('costUsd');
  const rows = (await mesa('sessions', '--all', '--json')).json.data;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: 'run',
    agent: 'codex',
    agentSessionId: ran.json.data.agentSessionId,
  });
});
