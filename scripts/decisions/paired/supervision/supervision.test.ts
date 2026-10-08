import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { convention, TASKS } from '../harness.mjs';
import { writeCodexHome } from './codex-home.mjs';
import { answer, prompt, supervisionProject } from './material.mjs';
import { personAction, REACT_MS, superviseRun } from './person.mjs';
import { placingUsage, supervisionSummary } from './records.mjs';

test('the person approves a permission wait, answers a question wait, and leaves the rest', () => {
  expect(personAction('waiting-permission', undefined, 0)).toBe('approve');
  expect(personAction('waiting-question', undefined, 0)).toBe('answer');
  for (const state of ['working', 'idle', 'done', 'failed', undefined])
    expect(personAction(state, undefined, 0)).toBeUndefined();
});

test('the person acts once per wait, again only when the Board still shows it 20 s later', () => {
  const last = { state: 'waiting-question', atMs: 1_000 };
  expect(personAction('waiting-question', last, 1_000 + REACT_MS - 1)).toBeUndefined();
  expect(personAction('waiting-question', last, 1_000 + REACT_MS)).toBe('answer');
  expect(personAction('waiting-permission', last, 2_000)).toBe('approve');
});

/**
 * A scripted run on a virtual clock: `screens` and `board` give what the screen and the Board show
 * from each time on (ms); the task is solved once the screen shows `solvedAt`.
 */
function scripted({
  screens,
  board,
  solvedAt = Number.POSITIVE_INFINITY,
  budgetMs = 60_000,
  pending = () => false,
}: {
  screens: [number, string][];
  board: [number, string][];
  solvedAt?: number;
  budgetMs?: number;
  pending?: (now: number) => boolean;
}) {
  let now = 0;
  const at = (steps: [number, string][]) => steps.filter(([t]) => t <= now).at(-1)?.[1];
  const acts: string[] = [];
  let places = 0;
  let inFlight = 0;
  let overlapped = false;
  const run = superviseRun({
    budgetMs,
    clock: {
      now: () => now,
      sleep: async (ms: number) => {
        now += ms;
      },
    },
    look: async () => ({ state: at(board), pending: pending(now) }),
    place: async () => {
      places++;
      if (inFlight++) overlapped = true;
      // A slow call: two looks pass before it answers.
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
    },
    truth: async () => {
      const screen = at(screens);
      const stopped = screen !== 'working';
      return { screen, stopped, solved: stopped && now >= solvedAt };
    },
    act: async (action: string) => void acts.push(`${now}:${action}`),
  });
  return { run, acts, places: () => places, overlapped: () => overlapped };
}

test('a permission wait the Board shows at once is noticed on that look, approved once, and the run ends solved', async () => {
  const s = scripted({
    screens: [
      [0, 'working'],
      [10_000, 'waiting-permission'],
      [16_000, 'working'],
      [30_000, 'idle'],
    ],
    board: [
      [0, 'working'],
      [10_000, 'waiting-permission'],
      [16_000, 'working'],
      [30_000, 'idle'],
    ],
    solvedAt: 30_000,
  });
  const result = await s.run;
  expect(result).toMatchObject({ success: true, wallMs: 30_000, looks: 16 });
  expect(result.episodes).toEqual([
    {
      startMs: 10_000,
      endMs: 16_000,
      screen: 'waiting-permission',
      board: ['waiting-permission'],
      noticedMs: 10_000,
      timeToNoticeMs: 0,
    },
  ]);
  expect(s.acts).toEqual(['10000:approve']);
});

test('a question the Board shows as idle is never noticed: no act, and the budget is spent', async () => {
  const s = scripted({
    screens: [
      [0, 'working'],
      [8_000, 'idle'],
    ],
    board: [
      [0, 'working'],
      [8_000, 'idle'],
    ],
    budgetMs: 20_000,
  });
  const result = await s.run;
  expect(result).toMatchObject({ success: false, wallMs: 20_000, acts: [] });
  expect(result.episodes).toEqual([
    {
      startMs: 8_000,
      endMs: 20_000,
      screen: 'idle',
      board: ['idle'],
      noticedMs: null,
      timeToNoticeMs: null,
    },
  ]);
});

test('a question placed later is noticed when the Board first shows it, and answered', async () => {
  const s = scripted({
    screens: [
      [0, 'working'],
      [8_000, 'idle'],
      [14_000, 'working'],
      [20_000, 'idle'],
    ],
    board: [
      [0, 'working'],
      [8_000, 'idle'],
      [12_000, 'waiting-question'],
      [14_000, 'working'],
      [20_000, 'idle'],
    ],
    solvedAt: 20_000,
  });
  const result = await s.run;
  expect(result.success).toBe(true);
  expect(result.episodes[0]).toMatchObject({ noticedMs: 12_000, timeToNoticeMs: 4_000 });
  expect(s.acts).toEqual(['12000:answer']);
});

test('a stop seen on one look only, unseen by the Board, is not a wait', async () => {
  const s = scripted({
    screens: [
      [0, 'working'],
      [4_000, 'idle'],
      [6_000, 'working'],
      [10_000, 'idle'],
    ],
    board: [[0, 'working']],
    solvedAt: 10_000,
  });
  const result = await s.run;
  expect(result.episodes).toEqual([]);
  expect(result.success).toBe(true);
});

test('a row that wants placing gets one placing call at a time, beside the looks', async () => {
  const s = scripted({
    screens: [[0, 'working']],
    board: [[0, 'working']],
    budgetMs: 10_000,
    pending: () => true,
  });
  await s.run;
  expect(s.places()).toBeGreaterThan(0);
  expect(s.overlapped()).toBe(false);
});

test('placing calls are counted from what mesa decisions place reports, refusals and dropped replies apart', () => {
  const saved = (ask: object, placed?: object) => ({ id: 'a', key: 'k', saved: { ask, placed } });
  const use = placingUsage(
    [
      saved({ model: 'clef', latencyMs: 600, inputTokens: 500, margin: 0.9 }, { state: 'idle' }),
      saved({ model: 'clef', latencyMs: 700, inputTokens: 1_500, fallbackReason: 'abstained' }),
      saved({ model: 'clef', fallbackReason: 'budget reached: 60 asks in the last hour' }),
      { id: 'a', key: 'k2', dropped: 'the screen changed' },
    ],
    'clef',
  );
  expect(use).toEqual({
    calls: 3,
    answered: 2,
    accepted: 1,
    dropped: 1,
    refused: 1,
    inputTokens: 2_000,
    usd: (2_000 * 0.24) / 1e6,
  });
  expect(placingUsage([], undefined).usd).toBe(0);
});

test("an arm's summary has its waits, how fast they were noticed, and its model use", () => {
  const run = (times: (number | null)[], acts = 0) => ({
    episodes: times.map((t) => ({ timeToNoticeMs: t })),
    acts: Array.from({ length: acts }, () => ({ agentStopped: false })),
    placement: { calls: 2, inputTokens: 1_000, usd: 0.001 },
    decisions: { calls: 1, inputTokens: 300, usd: 0.0002 },
  });
  const summary = supervisionSummary([run([0, null]), run([4_000, 2_000], 1)]);
  expect(summary).toMatchObject({
    episodes: 4,
    unnoticed: 1,
    medianTimeToNoticeMs: 2_000,
    actsOnWorkingAgent: 1,
    modelCalls: 6,
    inputTokens: 2_600,
  });
  expect(summary.usd).toBeCloseTo(0.0024, 10);
});

/** Every file under `dir` but .git, as text. */
const tree = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => name !== '.git')
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? tree(path) : [readFileSync(path, 'utf8')];
    });

test('six tasks each stop once for a person: a question whose answer is nowhere in the project, or a policy only running gives', () => {
  const work = mkdtempSync(join(tmpdir(), 'paired-supervision-'));
  try {
    supervisionProject(work);
    expect(TASKS.length).toBeGreaterThanOrEqual(6);
    const files = tree(work).join('\n');
    for (const task of TASKS) {
      const { stop, topic } = task.supervision;
      expect(['question', 'permission']).toContain(stop);
      // The convention is in no file: a question's answer is the person's, a policy is encoded.
      expect(files).not.toContain(convention(task));
      if (stop === 'question') {
        expect(answer(task)).toBe(convention(task));
        expect(prompt(task)).toContain('ask me');
      } else {
        expect(prompt(task)).toContain(`node scripts/policy.mjs ${topic}`);
        const printed = spawnSync(process.execPath, ['scripts/policy.mjs', topic], {
          cwd: work,
          encoding: 'utf8',
        });
        expect(printed.stdout.trim()).toBe(convention(task));
      }
    }
    expect(TASKS.filter((t) => t.supervision.stop === 'question').length).toBe(3);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("the temporary CODEX_HOME has the login, no hooks, the project trusted, the policy rule, and the person's skills off", () => {
  const work = mkdtempSync(join(tmpdir(), 'paired-codex-home-'));
  try {
    // An invented home: a login, one skill, and one in a synced folder.
    const home = join(work, 'home');
    mkdirSync(join(home, '.codex'), { recursive: true });
    writeFileSync(join(home, '.codex', 'auth.json'), '{"invented":true}');
    for (const skill of ['tide-notes', 'synced/abc/kelp-voice']) {
      mkdirSync(join(home, '.agents', 'skills', skill), { recursive: true });
      writeFileSync(join(home, '.agents', 'skills', skill, 'SKILL.md'), '---\nname: x\n---\n');
    }
    const dir = join(work, 'codex-home');
    writeCodexHome(dir, { home, projectDir: '/invented/kelp-ledger' });
    expect(readFileSync(join(dir, 'auth.json'), 'utf8')).toBe('{"invented":true}');
    expect(statSync(join(dir, 'auth.json')).mode & 0o777).toBe(0o600);
    expect(existsSync(join(dir, 'hooks.json'))).toBe(false);
    const config = readFileSync(join(dir, 'config.toml'), 'utf8');
    expect(config).toContain('[projects."/invented/kelp-ledger"]\ntrust_level = "trusted"');
    expect(config).toContain('apps = false\nplugins = false');
    for (const skill of ['tide-notes', 'synced/abc/kelp-voice'])
      expect(config).toContain(
        `path = ${JSON.stringify(join(home, '.agents', 'skills', skill, 'SKILL.md'))}\nenabled = false`,
      );
    expect(readFileSync(join(dir, 'rules', 'default.rules'), 'utf8')).toBe(
      'prefix_rule(pattern=["node","scripts/policy.mjs"], decision="prompt")\n',
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
