import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('doctor reports { healthy, checks } and exits 3 when unhealthy', async () => {
  const healthy = await mesa('doctor', '--json');
  expect(healthy.code).toBe(0);
  expect(healthy.json.data.healthy).toBe(true);
  expect(healthy.json.data.checks.map((c: { name: string }) => c.name)).toEqual([
    'tmux',
    'claude',
    'codex',
    'agy',
    'obsidian',
    'profile dir',
    'claude hooks',
    'tmux hooks',
    ...[
      'SessionStart',
      'UserPromptSubmit',
      'PermissionRequest',
      'PostToolUse',
      'Interrupt',
      'SubagentStart',
      'SubagentStop',
      'Stop',
      'SessionEnd',
    ].map((event) => `codex hooks ${event}`),
    'antigravity hooks',
    'antigravity vault',
  ]);

  cli.run = scriptedRunner({}, { missing: ['tmux', 'claude', 'codex', 'agy'] }).run;
  const sick = await mesa('doctor');
  expect(sick.code).toBe(3);
  expect(sick.stdout).toMatch(/^FAIL {2}tmux/);
  expect(sick.stdout).toMatch(/\nFAIL {2}claude/);
  expect(sick.stdout).toContain('doctor: tmux and at least one agent');
});

test('decide answers the questions on stdin with rules alone; doctor says rules only', async () => {
  // Before init there is nothing configured: rules answer.
  cli.stdin = JSON.stringify({ questions: [{ kind: 'Noul', id: 'x', statement: 'It holds' }] });
  expect((await mesa('decide')).stdout).toBe(
    'x  Noul  false  p 0.50\nbackend rules\nwarning: no receipt: the profile has no vault yet\n',
  );
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  cli.stdin = JSON.stringify({
    state: { anything: true },
    questions: [
      { kind: 'Choice', id: 'route', options: ['ingest', 'ask'] },
      { kind: 'Score', id: 'urgency', levels: ['low', 'medium', 'high'] },
      { kind: 'Noul', id: 'destructive', statement: 'The prompt deletes files' },
    ],
  });
  // No rules know these questions, so they are even and unsure; still no model is asked.
  const scripted = scriptedRunner({ claude: () => '[]' });
  cli.run = scripted.run;
  expect((await mesa('decide')).stdout).toBe(
    [
      'route        Choice  ingest  confidence 0.50',
      'urgency      Score   0.50    confidence 0.33',
      'destructive  Noul    false   p 0.50',
      'backend rules',
      '',
    ].join('\n'),
  );
  const { json } = await mesa('decide', '--json');
  expect(json.data).toMatchObject({
    backend: 'rules',
    at: '2026-09-24T12:00:00.000Z',
    latencyMs: 0,
  });
  expect(json.data).not.toHaveProperty('costUsd');
  const receipt = (await mesa('receipts', 'show', json.data.receipt.id, '--json')).json.data
    .receipt;
  expect(receipt).toMatchObject({
    type: 'decision',
    status: 'ok',
    inputs: { state: { anything: true } },
    decisions: [
      { question: 'route', probabilities: { ingest: 0.5, ask: 0.5 }, backend: 'rules' },
      { question: 'urgency', backend: 'rules' },
      { question: 'destructive', answer: false, probabilities: 0.5, backend: 'rules' },
    ],
  });
  expect(receipt).not.toHaveProperty('cost');

  cli.stdin = 'not json';
  expect(await mesa('decide')).toMatchObject({
    code: 2,
    stderr: expect.stringContaining('stdin is not JSON'),
  });
  cli.stdin = JSON.stringify({ questions: [{ kind: 'Choice', id: 'a', options: ['only'] }] });
  expect(await mesa('decide')).toMatchObject({
    code: 2,
    stderr: expect.stringContaining('invalid questions: 0.options'),
  });

  // Doctor names the rules, and probes claude only for its version: never claude -p.
  const { json: report } = await mesa('doctor', '--json');
  expect(report.data.checks).toContainEqual({
    name: 'decisions',
    ok: true,
    status: 'ok',
    version: 'rules',
    hint: 'rules only',
  });
  expect(scripted.calls.filter((c) => c.file === 'claude' && c.args[0] === '-p')).toEqual([]);
});

test('doctor reports Claude settings that do not read as a warning, not a failure', async () => {
  mkdirSync(join(cli.home, '.claude'), { recursive: true });
  writeFileSync(join(cli.home, '.claude/settings.json'), '{ "hooks": ');
  const doctor = await mesa('doctor', '--json');
  expect(doctor.json.ok).toBe(true);
  expect(
    doctor.json.data.checks.find((c: { name: string }) => c.name === 'claude hooks'),
  ).toMatchObject({
    status: 'warn',
    hint: expect.stringMatching(/^cannot read Claude Code's settings: /),
  });
});

test('doctor warns while a Codex app-server daemon runs in CODEX_HOME', async () => {
  const codexHome = join(cli.home, 'codex-home');
  cli.env = { CODEX_HOME: codexHome };
  expect((await mesa('doctor')).stdout).not.toContain('codex daemon');
  mkdirSync(join(codexHome, 'app-server-control'), { recursive: true });
  writeFileSync(join(codexHome, 'app-server-control/app-server-control.sock'), '');
  const warned = await mesa('doctor');
  expect(warned.code).toBe(0);
  expect(warned.stdout).toMatch(/\nwarn {2}codex daemon .* a Codex app-server daemon runs/);
});

test('doctor leaves a never-initialised profile unwritten and warns when the inbox does not read', async () => {
  for (let run = 0; run < 2; run++) {
    const { json } = await mesa('doctor', '--json');
    expect(json.data.checks).toContainEqual(
      expect.objectContaining({ name: 'profile dir', status: 'warn' }),
    );
  }
  expect(existsSync(cli.paths.root)).toBe(false);

  await mesa('init', '--vault', 'vault');
  writeFileSync(cli.paths.notifications, '{ "read": ');
  const doctor = await mesa('doctor', '--json');
  expect(doctor.code).toBe(0);
  expect(doctor.json.data.checks.find((c: { name: string }) => c.name === 'inbox')).toMatchObject({
    status: 'warn',
    hint: expect.stringContaining('inbox state is not valid JSON'),
  });
});

test('doctor install runs Homebrew and prints { name, installed }; a missing one names install', async () => {
  const runner = scriptedRunner({}, { missing: ['tmux'] });
  cli.run = runner.run;
  const tmux = (await mesa('doctor', '--json')).json.data.checks[0];
  expect(tmux).toMatchObject({ name: 'tmux', install: 'brew install tmux' });

  const installed = await mesa('doctor', 'install', 'tmux', '--json');
  expect(installed.code).toBe(0);
  expect(installed.json.data).toEqual({ name: 'tmux', installed: true });
  expect(runner.calls.at(-1)).toMatchObject({ file: 'brew', args: ['install', 'tmux'] });

  expect((await mesa('doctor', 'install', 'nope', '--json')).code).toBe(2);
  cli.run = scriptedRunner({}, { missing: ['brew'] }).run;
  const noBrew = await mesa('doctor', 'install', 'claude', '--json');
  expect(noBrew.code).toBe(3);
  expect(noBrew.json.error.message).toContain('https://brew.sh');
});
