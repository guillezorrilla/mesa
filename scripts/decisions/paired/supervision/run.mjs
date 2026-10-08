// pnpm decisions:paired --site supervision: Board placement's paired workflows (#677, ADR-0019).
// Each of the six kelp-ledger tasks runs as an interactive Codex session in a Mesa window (`mesa
// open`), in every arm, with a simulated person (person.mjs) who acts only on what the Board says.
// Each task stops once partway for that person (material.mjs): a question, or a command Codex asks
// to run. A task is solved when its hidden test passes on a copy of the project, within its budget.
//
// Codex, because placement is asked only for a session no hook and no listing speaks for: Claude
// Code's listing (`claude agents`) gives every live session's state, so a Claude row never reaches
// the screen, and its hooks are global. Codex's listing gives no state, and here its hooks are
// silent: it runs with a temporary CODEX_HOME (codex-home.mjs) that has no hooks.json. Nothing is
// installed and no global file is written; the real ~/.codex is only read, for the login.
//
// Arms: off is `decisions use none`, the rules alone; jev and clef choose that model, with
// decisions.experimental on so supervision runs automatically before it is proven. The rest is the
// same: Codex's default model, on-request approvals in its workspace-write sandbox, no notes in the
// vault. The profile's settings are put back afterwards, and the tmux server this run started (so
// that its windows have this CODEX_HOME) is stopped; one already running refuses the run.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexScreenState } from '../../../../packages/core/dist/agents/codex/screen.js';
import { fail, must, needCli, profileCli, Refused, usage } from '../../lib.mjs';
import { PROJECT, solve } from '../harness.mjs';
import { decisionsOf, report } from '../report.mjs';
import { writeCodexHome } from './codex-home.mjs';
import { answer, prompt, solvedOnCopy, supervisionProject } from './material.mjs';
import { superviseRun } from './person.mjs';
import { placingUsage, supervisionSummary } from './records.mjs';

const MODEL = { off: 'none', jev: 'jev', clef: 'clef' };
/** The screens where Codex has stopped for a person: a dialog, or a turn that ended. */
const STOPPED = new Set(['waiting-permission', 'waiting-question', 'idle']);

export async function supervise({ values, agent, arms, reps, seed, budgetS, order, draw }) {
  if (agent !== 'codex')
    usage(
      "--site supervision runs codex: Claude Code's listing always says a live session's state, so the Board never asks a model to place a Claude session",
    );
  if (values['hooks-installed'])
    usage('--site supervision runs with the hooks silent: no --hooks-installed');
  const dry = values['dry-run'];
  const { paths, mesa, mesaAsync, set } = profileCli(values.profile, 60_000);
  const work = realpathSync(mkdtempSync(join(tmpdir(), 'paired-supervision-')));
  const projectDir = join(work, PROJECT);
  const restore = [];
  const tmux = (...args) =>
    spawnSync('tmux', ['-L', paths.tmuxSocket, ...args], { encoding: 'utf8', timeout: 10_000 });

  /** Checks the profile and sets it up for the runs; what to put back goes on `restore`. */
  function setUp() {
    if (!values.profile) fail('--profile <name>: a throwaway profile with the keys');
    needCli(fail);
    if (tmux('ls').status === 0)
      fail(
        `tmux server ${paths.tmuxSocket} is running: its windows would not get this run's CODEX_HOME; stop it first`,
      );
    const codexHome = join(work, 'codex-home');
    writeCodexHome(codexHome, { home: homedir(), projectDir });
    process.env.CODEX_HOME = codexHome;
    restore.push(() => tmux('kill-server'));
    const hooks = must(mesa('hooks', 'status', '--json'), 'hooks status');
    if (hooks.codex?.installed) fail(`Mesa's hooks are in ${codexHome}: they must stay silent`);
    const keys = must(mesa('decisions', 'key', 'list', '--json'), 'key list').keys;
    const has = (provider) => keys.some((k) => k.provider === provider && k.set);
    if (arms.includes('jev') && !has('typesafe')) fail('jev arm: no TypeSafe key in this profile');
    if (arms.includes('clef') && !has('cloudflare')) fail('clef arm: no Cloudflare key');
    const config = must(mesa('config', '--json'), 'config');
    const notesDir = join(config.vault, 'wiki', 'decisions');
    if (existsSync(notesDir) && readdirSync(notesDir).some((n) => n.startsWith('kelp-')))
      fail(
        `${notesDir} holds kelp-ledger notes: the person's answers would be in the agent's reach`,
      );
    // One at a time: a refused set leaves the ones before it to put back.
    const codex = { approvalPolicy: 'on-request', sandbox: 'workspace-write' };
    restore.push(set('agents.codex', codex, config.agents.codex));
    restore.push(set('decisions.experimental', true, config.decisions.experimental ?? false));
    restore.push(() => mesa('decisions', 'use', config.decisions.model, '--json'));
    supervisionProject(projectDir);
    if (!mesa('register', projectDir, '--json').ok) {
      mesa('unregister', PROJECT, '--json');
      must(mesa('register', projectDir, '--json'), 'register');
    }
    if (!values.keep) restore.push(() => mesa('unregister', PROJECT, '--json'));
  }

  /** One live run: the session, the person beside it, then what it used. */
  async function live(run) {
    supervisionProject(projectDir);
    must(mesa('decisions', 'use', MODEL[run.arm], '--json'), `decisions use ${MODEL[run.arm]}`);
    const started = performance.now();
    const opened = must(
      mesa(
        'open',
        PROJECT,
        '--agent',
        'codex',
        '--no-parent',
        '--goal',
        prompt(run.task),
        '--json',
      ),
      'open',
    );
    const openMs = performance.now() - started;
    const { id } = opened;
    const target = `${opened.tmux.session}:${opened.tmux.window}`;
    const placed = [];
    let checked;
    let solved = false;
    const result = await superviseRun({
      budgetMs: budgetS * 1000 - openMs,
      clock: {
        now: () => performance.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
      look: async () => {
        const rows = await mesaAsync('sessions', '--json');
        const row = rows.ok ? rows.data.find((r) => r.id === id) : undefined;
        return row && { state: row.lastState.state, pending: Boolean(row.supervision?.pending) };
      },
      place: async () => {
        const res = await mesaAsync('decisions', 'place', '--json');
        if (res.ok) placed.push(...res.data.placed.filter((p) => p.id === id));
      },
      truth: async () => {
        const dead = tmux('display-message', '-p', '-t', target, '#{pane_dead}').stdout.trim();
        const screen = codexScreenState(tmux('capture-pane', '-p', '-t', target).stdout ?? '');
        const stopped = STOPPED.has(screen);
        if (stopped) {
          const text = readFileSync(join(projectDir, run.task.file), 'utf8');
          if (text !== checked) {
            checked = text;
            solved = solvedOnCopy(projectDir, run.task);
          }
        }
        return { screen, stopped, solved: stopped && solved, dead: dead === '1' };
      },
      act: async (action) => {
        if (action === 'approve') tmux('send-keys', '-t', target, 'Enter');
        else await mesaAsync('send', id, answer(run.task), '--force', '--no-from', '--json');
      },
    });
    const decisions = decisionsOf(paths.decisions, id);
    if (!values.keep) mesa('rm', id, '--force', '--json');
    const provider = run.arm === 'off' ? undefined : run.arm;
    return {
      ...result,
      wallMs: Math.round(openMs + result.wallMs),
      session: id,
      placement: placingUsage(placed, provider),
      decisions,
    };
  }

  /**
   * One dry run on a virtual clock: a stub agent stops once, waits for the person, then writes
   * the reference solution. The stub Board reads a permission dialog right and a question as
   * idle, as the rules do; with a model, a placing call reads the question right 3 times in 4.
   */
  async function stub(run) {
    supervisionProject(projectDir);
    const { stop } = run.task.supervision;
    const stopAt = 10_000 + draw() * 30_000;
    const workMs = 15_000 + draw() * 30_000;
    const reads = run.arm !== 'off' && draw() < 0.75;
    let now = 0;
    let resumedAt;
    let placedRight = false;
    let written = false;
    const done = () => resumedAt !== undefined && now >= resumedAt + workMs;
    const screen = () =>
      now < stopAt || (resumedAt !== undefined && !done())
        ? 'working'
        : resumedAt === undefined && stop === 'permission'
          ? 'waiting-permission'
          : 'idle';
    let calls = 0;
    const result = await superviseRun({
      budgetMs: budgetS * 1000,
      clock: {
        now: () => now,
        sleep: async (ms) => {
          now += ms;
        },
      },
      look: async () => ({
        state:
          placedRight && resumedAt === undefined && screen() === 'idle'
            ? 'waiting-question'
            : screen(),
        pending: run.arm !== 'off' && now >= stopAt && resumedAt === undefined && !placedRight,
      }),
      place: async () => {
        calls++;
        if (reads && stop === 'question') placedRight = true;
      },
      truth: async () => {
        if (done() && !written) {
          solve(projectDir, run.task, 'reference');
          written = true;
        }
        const s = screen();
        const stopped = s !== 'working';
        return {
          screen: s,
          stopped,
          solved: stopped && written && solvedOnCopy(projectDir, run.task),
        };
      },
      act: async () => {
        resumedAt ??= now;
      },
    });
    return {
      ...result,
      session: 'dry-run',
      placement: {
        calls,
        answered: calls,
        accepted: 0,
        dropped: 0,
        refused: 0,
        inputTokens: 0,
        usd: 0,
      },
    };
  }

  const results = [];
  const agentVersion = dry
    ? undefined
    : spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout?.trim();
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
      `seed ${seed}: ${order.length} codex runs with a simulated person, arms ${arms.join(', ')}, ${order.length / arms.length / reps} tasks, ${reps} each, ${budgetS} s budget${dry ? ' (dry run)' : ''}`,
    );
    for (const [i, run] of order.entries()) {
      const row = {
        arm: run.arm,
        task: run.task.id,
        rep: run.rep,
        stop: run.task.supervision.stop,
        ...(dry ? await stub(run) : await live(run)),
      };
      results.push(row);
      const waits = row.episodes
        .map((e) =>
          e.timeToNoticeMs === null ? 'unnoticed' : `${(e.timeToNoticeMs / 1000).toFixed(0)} s`,
        )
        .join(', ');
      console.log(
        `${String(i + 1).padStart(3)} ${row.arm.padEnd(4)} ${row.task.padEnd(15)} rep ${row.rep} ${row.success ? 'solved' : 'failed'} ${(row.wallMs / 1000).toFixed(1)} s, waits noticed: ${waits || 'none'}${row.ended ? ` (${row.ended})` : ''}`,
      );
    }
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    console.error(error.message);
    process.exitCode = 2;
  } finally {
    putBack();
  }
  if (process.exitCode) return;
  report({
    site: 'supervision',
    seed,
    dry,
    header: { profile: values.profile, agent, agentVersion, mainModel: 'codex default', budgetS },
    arms,
    reps,
    runs: results,
    out: values.out ?? `paired-supervision-${seed}.json`,
    extra: supervisionSummary,
  });
}
