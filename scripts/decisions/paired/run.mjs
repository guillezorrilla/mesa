// pnpm decisions:paired: ADR-0019's paired coding workflows (#465). Each of the six invented
// kelp-ledger tasks runs as a real Mesa skill run (headless Claude Code, `mesa run paired-task`)
// in every arm, 2 repetitions each, in a seeded random order, with the same main model (sonnet,
// from the project's .claude/settings.json), the same permissions (edits accepted, Bash limited to
// node, ls and cat) and the same ten notes in the profile's vault; only `mesa decisions use`
// differs: none (off), jev or clef. Advice reaches the run through the product path, Claude
// Code's UserPromptSubmit hook, so Mesa's global hooks must be installed first. With `--agent
// codex` each run is `codex exec` instead (Codex's default model, its workspace-write sandbox
// with no approvals, as Mesa runs it), advised by Codex's UserPromptSubmit hook, which Codex must
// have trusted (start codex once in a Mesa window; use a temporary CODEX_HOME).
//
//   --profile <name>     a throwaway profile with the keys, never an everyday one; required
//   --agent claude       claude or codex: the agent every arm runs
//   --hooks-installed    say Mesa's hooks are installed (mesa hooks install, after a backup)
//   --arms off,jev,clef  the arms (default all three; off is the baseline and always runs)
//   --reps 2             runs per task per arm
//   --seed <n>           the order's seed (default random; always printed)
//   --tasks a,b          only these tasks (fewer than 6 gives no verdict)
//   --timeout 900        seconds each run may take
//   --out <file>         the results file (default paired-<seed>.json in the current folder)
//   --keep               keep the run sessions, the notes and the project registered
//   --dry-run            no Mesa and no agent: a stub writes a reference or naive solution,
//                        to exercise the order, the hidden tests, the records and the verdict
//
// The profile's run permissions and decisions.experimental are set for the runs (automatic advice
// needs the opt-in until a site passes this gate) and put back afterwards.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  PAIRED_GATE,
  pairedArm,
  pairedVerdict,
} from '../../../packages/core/dist/decisions/evaluation/paired.js';
import { fail, must, needCli, profileCli, Refused, usage } from '../lib.mjs';
import { freshProject, hiddenTest, notes, PROJECT, solve, TASKS } from './harness.mjs';

const { values } = parseArgs({
  options: {
    profile: { type: 'string' },
    agent: { type: 'string', default: 'claude' },
    'hooks-installed': { type: 'boolean', default: false },
    arms: { type: 'string', default: 'off,jev,clef' },
    reps: { type: 'string', default: String(PAIRED_GATE.repetitions) },
    seed: { type: 'string' },
    tasks: { type: 'string' },
    timeout: { type: 'string', default: '900' },
    out: { type: 'string' },
    keep: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});
const dry = values['dry-run'];
const agent = values.agent;
if (!['claude', 'codex'].includes(agent)) usage('--agent: claude or codex');
const arms = ['off', ...values.arms.split(',').filter((a) => a !== 'off')];
if (arms.some((a) => !['off', 'jev', 'clef'].includes(a))) usage('--arms: off, jev and clef');
const reps = Number(values.reps);
const seed = values.seed === undefined ? Math.floor(Math.random() * 2 ** 31) : Number(values.seed);
const timeout = Number(values.timeout);
const tasks = values.tasks ? TASKS.filter((t) => values.tasks.split(',').includes(t.id)) : TASKS;
if (!tasks.length) usage(`--tasks: some of ${TASKS.map((t) => t.id).join(', ')}`);
const MODEL = { off: 'none', jev: 'jev', clef: 'clef' };
// Bash for node, ls and cat only; edits are accepted by the permission mode.
const ALLOWED = ['Bash(node:*)', 'Bash(ls:*)', 'Bash(cat:*)'];

/** A seeded generator (mulberry32), so the order and the dry run repeat for a seed. */
function random(state) {
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const draw = random(seed);
const order = arms.flatMap((arm) =>
  tasks.flatMap((task) => Array.from({ length: reps }, (_, i) => ({ arm, task, rep: i + 1 }))),
);
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(draw() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}

const { paths, mesa, set } = profileCli(values.profile, (timeout + 120) * 1000);
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

const work = mkdtempSync(join(tmpdir(), 'paired-'));
const projectDir = join(work, PROJECT);
const restore = [];
let vaultDir;

/** Checks the profile and sets it up for the runs; what to put back goes on `restore`. */
function setUp() {
  if (!values.profile) fail('--profile <name>: a throwaway profile with the keys');
  if (!values['hooks-installed'])
    fail(
      "Mesa's hooks must be installed: advice reaches a headless run only through the agent's UserPromptSubmit hook. Back up ~/.claude/settings.json, run mesa --profile <name> hooks install, then pass --hooks-installed (restore the backup afterwards).",
    );
  needCli(fail);
  const hooks = must(mesa('hooks', 'status', '--json'), 'hooks status');
  const turnHook = agent === 'codex' ? hooks.codex : hooks;
  if (!turnHook?.events?.UserPromptSubmit)
    fail(`${agent}'s UserPromptSubmit hook is not installed: mesa hooks install`);
  if (agent === 'codex' && !hooks.codex.trusted?.UserPromptSubmit)
    fail("Codex has not trusted Mesa's UserPromptSubmit hook: start codex once in a Mesa window");
  const keys = must(mesa('decisions', 'key', 'list', '--json'), 'key list').keys;
  const has = (provider) => keys.some((k) => k.provider === provider && k.set);
  if (arms.includes('jev') && !has('typesafe')) fail('jev arm: no TypeSafe key in this profile');
  if (arms.includes('clef') && !has('cloudflare')) fail('clef arm: no Cloudflare key');
  const config = must(mesa('config', '--json'), 'config');
  vaultDir = config.vault;
  // One at a time: a refused set leaves the ones before it to put back.
  restore.push(set('run.permissionMode', 'acceptEdits', config.run.permissionMode));
  restore.push(set('run.allowedTools', ALLOWED, config.run.allowedTools));
  restore.push(set('decisions.experimental', true, config.decisions.experimental ?? false));
  restore.push(() => mesa('decisions', 'use', config.decisions.model, '--json'));
  freshProject(projectDir, agent);
  // A kelp-ledger left registered at an older run's folder is moved to this one.
  if (!mesa('register', projectDir, '--json').ok) {
    mesa('unregister', PROJECT, '--json');
    must(mesa('register', projectDir, '--json'), 'register');
  }
  if (!values.keep) restore.push(() => mesa('unregister', PROJECT, '--json'));
  mkdirSync(join(vaultDir, 'wiki', 'decisions'), { recursive: true });
  for (const note of notes()) {
    const file = join(vaultDir, 'wiki', 'decisions', note.name);
    writeFileSync(file, note.text);
    if (!values.keep) restore.push(() => rmSync(file, { force: true }));
  }
}

/** What a run's session used of the Decision model, from its decisions file. */
function decisionsOf(id) {
  const state = readJson(join(paths.decisions, `${id}.json`)) ?? { use: [] };
  const calls = state.use.filter((u) => !u.cached && (u.model || u.latencyMs > 0));
  return {
    calls: calls.length,
    inputTokens: calls.reduce((sum, u) => sum + (u.inputTokens ?? 0), 0),
    usd: calls.reduce((sum, u) => sum + (u.costUsd ?? 0), 0),
    statuses: state.use.map((u) => (u.reason ? `${u.status}: ${u.reason}` : u.status)),
    adviceDelivered: Boolean(state.seen?.advice),
  };
}

/**
 * The main model's turns and tokens: Claude's from the result JSON it saved, Codex's from the
 * run's usage (its turn.completed counts; Codex reports no turns).
 */
function mainUsage(id, data) {
  if (agent === 'codex') {
    const u = data?.usage;
    return {
      mainTokens: u && {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheRead: u.cached_input_tokens,
        reasoning: u.reasoning_output_tokens,
      },
    };
  }
  const claude = readJson(join(paths.runs, `${id}.json`));
  return {
    turns: claude?.num_turns,
    mainTokens: claude?.usage && {
      input: claude.usage.input_tokens,
      output: claude.usage.output_tokens,
      cacheRead: claude.usage.cache_read_input_tokens,
      cacheWrite: claude.usage.cache_creation_input_tokens,
    },
  };
}

/** One run on a fresh copy of the project, then its hidden test: what it recorded. */
function record(run) {
  if (dry) {
    // The stub agent: assistance makes a correct solution likelier, by a fixed seeded draw.
    freshProject(projectDir, agent);
    const success = draw() < (run.arm === 'off' ? 0.25 : 0.75);
    solve(projectDir, run.task, success ? 'reference' : 'naive');
    const test = hiddenTest(projectDir, run.task);
    return {
      wallMs: Math.round(8_000 + draw() * 12_000),
      success: test.passed,
      session: 'dry-run',
      ok: true,
      decisions: { calls: run.arm === 'off' ? 0 : 1, inputTokens: 0, usd: 0, statuses: [] },
    };
  }
  freshProject(projectDir, agent);
  must(mesa('decisions', 'use', MODEL[run.arm], '--json'), `decisions use ${MODEL[run.arm]}`);
  const started = performance.now();
  // The task is the skill's arguments, after `--`: the agent owns its words.
  const ran = mesa(
    'run',
    'paired-task',
    '--project',
    PROJECT,
    '--agent',
    agent,
    '--timeout',
    `${timeout}`,
    '--json',
    '--',
    run.task.prompt,
  );
  const wallMs = Math.round(performance.now() - started);
  const test = hiddenTest(projectDir, run.task);
  const data = ran.ok ? ran.data : undefined;
  const id = data?.session;
  const row = {
    wallMs,
    success: test.passed,
    session: id,
    ok: data?.ok ?? false,
    ...(data?.ok ? {} : { reason: data?.reason ?? ran.error?.message }),
    agentMs: data?.durationMs,
    mainUsd: data?.costUsd,
    ...(id ? mainUsage(id, data) : {}),
    decisions: id ? decisionsOf(id) : undefined,
  };
  if (id && !values.keep) mesa('rm', id, '--force', '--json');
  return row;
}

const results = [];
const agentVersion = dry
  ? undefined
  : spawnSync(agent, ['--version'], { encoding: 'utf8' }).stdout?.trim();
const putBack = () => {
  for (const undo of restore.splice(0).reverse()) undo();
  rmSync(work, { recursive: true, force: true });
};
// Interrupted, the profile is still put back.
process.once('SIGINT', () => {
  putBack();
  process.exit(130);
});
try {
  if (!dry) setUp();
  console.log(
    `seed ${seed}: ${order.length} ${agent} runs, arms ${arms.join(', ')}, ${tasks.length} tasks, ${reps} each${dry ? ' (dry run)' : ''}`,
  );
  for (const [i, run] of order.entries()) {
    const row = { arm: run.arm, task: run.task.id, rep: run.rep, ...record(run) };
    results.push(row);
    console.log(
      `${String(i + 1).padStart(3)} ${row.arm.padEnd(4)} ${row.task.padEnd(15)} rep ${row.rep} ${row.success ? 'solved' : 'failed'} ${(row.wallMs / 1000).toFixed(1)} s${row.decisions?.adviceDelivered ? ' advice' : ''}${row.reason ? ` (${row.reason})` : ''}`,
    );
  }
} catch (error) {
  if (!(error instanceof Refused)) throw error;
  console.error(error.message);
  process.exitCode = 2;
} finally {
  putBack();
}
if (process.exitCode) process.exit();

const summary = Object.fromEntries(
  arms.map((a) => [a, pairedArm(results.filter((r) => r.arm === a))]),
);
const verdicts = Object.fromEntries(
  arms.filter((a) => a !== 'off').map((a) => [a, pairedVerdict(results, a)]),
);
const out = values.out ?? `paired-${seed}.json`;
writeFileSync(
  out,
  `${JSON.stringify({ seed, dryRun: dry, profile: values.profile, agent, agentVersion, mainModel: agent === 'claude' ? 'sonnet' : 'codex default', arms, reps, gate: PAIRED_GATE, summary, verdicts, runs: results }, null, 2)}\n`,
);
const secs = (ms) => (ms === null ? 'unbounded' : `${(ms / 1000).toFixed(1)} s`);
for (const [arm, s] of Object.entries(summary))
  console.log(
    `${arm.padEnd(4)} ${s.successes}/${s.runs} solved, ${secs(s.msPerSuccess)} per solved task`,
  );
// What measured.ts takes once the run is accepted: the arms only, as relevance is the site the
// automatic advice exercised; it reads the verdict, and PAIRED_PASSED, from them.
const measured = ({ runs, successes, wallMs }) =>
  `{ runs: ${runs}, successes: ${successes}, wallMs: ${wallMs} }`;
console.log(`measured.ts OFF: ${measured(summary.off)}`);
for (const [arm, v] of Object.entries(verdicts)) {
  const stub = dry ? ' [dry run: a stub agent, not a measurement]' : '';
  console.log(`paired gate ${arm}: ${v.pass ? 'PASS' : 'FAIL'} (${v.reason})${stub}`);
  console.log(
    `  measured.ts PAIRED_ARMS: ${arm}: { relevance: { on: ${measured(v.on)}, off: OFF } },`,
  );
}
console.log(`results: ${out}`);
