// pnpm decisions:concurrency: ADR-0019's concurrency and safety gate against the hosted model
// (#465). N invented live Claude sessions on kelp-ledger (records only: no window, no agent) each
// run their turn hook at once, `mesa hook claude` with a UserPromptSubmit payload, as Claude Code
// runs it, timed from spawn to exit. First every session turned off (the hook's fixed cost: node
// and Mesa starting), then assisted, each turn a new prompt, so every assisted turn is a live ask.
//
//   --profile <name>   a throwaway profile whose Decision model has its key (the lead: p11-live)
//   --sessions 1|4|8   concurrent sessions (default 4)
//   --turns 5          turns per session in each phase
//   --out <file>       also write the results as JSON
//
// It prints the hook wall time p50/p95 off and assisted, the added latency, every failure with its
// reason, and cross-session cache hits: an assisted turn answered from a ready answer, though no
// session ever sent that prompt before, which can only have come from elsewhere. The gate: hook
// wall p95 at most 1,500 ms (PER_TURN_MS counts from the hook process's start), no hook killed or
// failed, zero hits, and at least one answer (else the run measured nothing). Exits 1 otherwise.
// Automatic advice needs decisions.experimental until relevance passes the paired gate; it is
// set for the run and put back, with the planted records, their files and the notes.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PER_TURN_MS } from '../../packages/core/dist/decisions/models.js';
import { profilePaths } from '../../packages/core/dist/profile/paths.js';
import { sessionStore } from '../../packages/core/dist/sessions/record/store.js';
import { notes, PROJECT, TASKS } from './paired/harness.mjs';

const { values } = parseArgs({
  options: {
    profile: { type: 'string' },
    sessions: { type: 'string', default: '4' },
    turns: { type: 'string', default: '5' },
    out: { type: 'string' },
  },
});
const usage = (message) => {
  console.error(message);
  process.exit(2);
};
if (!values.profile) usage('--profile <name>: a throwaway profile with a Decision model');
const n = Number(values.sessions);
const turns = Number(values.turns);
if (![1, 4, 8].includes(n)) usage('--sessions: 1, 4 or 8');
if (!(turns >= 1)) usage('--turns: 1 or more');

const CLI = new URL('../../packages/cli/dist/mesa.js', import.meta.url).pathname;
if (!existsSync(CLI)) usage(`${CLI} is missing: pnpm --filter @mesa/cli build`);
const paths = profilePaths(homedir(), values.profile);

/** Runs the CLI with `env` added and `stdin`: its exit, output and wall time in ms. */
function cli(args, { env = {}, stdin = '', timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(process.execPath, [CLI, '--profile', values.profile, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    // Claude Code kills a hook at its 5 s timeout; so does this.
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, ms: performance.now() - started });
    });
    child.stdin.end(stdin);
  });
}
const json = async (...args) => {
  const run = await cli([...args, '--json']);
  const envelope = JSON.parse(run.stdout || '{}');
  if (!envelope.ok) throw new Error(`mesa ${args.join(' ')}: ${envelope.error?.message}`);
  return envelope.data;
};

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const store = sessionStore({
  dir: paths.sessions,
  newId: () => Array.from(randomBytes(8), (b) => ALPHABET[b % 32]).join(''),
  lock: {
    processId: process.pid,
    processAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return error.code === 'EPERM';
      }
    },
    clock: () => new Date(),
  },
});

const quantile = (xs, q) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : 0;
};
const stats = (xs) => ({
  n: xs.length,
  p50: Math.round(quantile(xs, 0.5)),
  p95: Math.round(quantile(xs, 0.95)),
  max: Math.round(Math.max(0, ...xs)),
});

const planted = [];
const written = [];
const undo = [];
try {
  const config = await json('config');
  if (config.decisions.model === 'none') usage('the profile has no Decision model: add a key');
  await json('config', 'set', 'decisions.experimental', 'true');
  const before = config.decisions.experimental ?? false;
  undo.push(() => cli(['config', 'set', 'decisions.experimental', String(before)]));
  const decisionsDir = join(config.vault, 'wiki', 'decisions');
  mkdirSync(decisionsDir, { recursive: true });
  for (const note of notes()) {
    const file = join(decisionsDir, note.name);
    if (existsSync(file)) continue;
    writeFileSync(file, note.text);
    written.push(file);
  }
  const now = new Date().toISOString();
  for (let i = 0; i < n; i++) {
    const agentSessionId = randomUUID();
    const record = store.create((id) => ({
      kind: 'interactive',
      project: PROJECT,
      agent: 'claude',
      agentSessionId,
      tmux: { socket: `mesa-${values.profile}`, session: PROJECT, window: `claude-${id}` },
      startedAt: now,
      lastState: { state: 'working', confidence: 0.95, at: now, source: 'mesa' },
      vaultMounted: true,
      decisionsMounted: true,
    }));
    planted.push(record);
  }
  /** Every session's turn `t` at once, its hook as Claude Code runs it. */
  const turn = (t) =>
    Promise.all(
      planted.map((s) =>
        cli(['hook', 'claude'], {
          env: { MESA_SESSION_ID: s.id, MESA_PROFILE: values.profile },
          stdin: JSON.stringify({
            session_id: s.agentSessionId,
            hook_event_name: 'UserPromptSubmit',
            // A new prompt every turn: never a ready answer of this session's own.
            prompt: `${TASKS[t % TASKS.length].prompt} (turn ${t + 1})`,
          }),
          timeoutMs: 5_000,
        }),
      ),
    );
  const phase = async (offset) => {
    const runs = [];
    for (let t = 0; t < turns; t++) runs.push(...(await turn(offset + t)));
    return runs;
  };
  for (const s of planted) await json('decisions', 'off', '--session', s.id);
  const off = await phase(0);
  for (const s of planted) await json('decisions', 'on', '--session', s.id);
  const assisted = await phase(turns);

  const uses = planted.flatMap((s) => {
    const file = join(paths.decisions, `${s.id}.json`);
    const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { use: [] };
    return state.use.map((u) => ({ session: s.id, ...u }));
  });
  const reasons = {};
  for (const u of uses.filter((u) => u.status === 'unavailable'))
    reasons[u.reason] = (reasons[u.reason] ?? 0) + 1;
  const killed = [...off, ...assisted].filter((r) => r.signal || r.code !== 0);
  const report = {
    profile: values.profile,
    model: config.decisions.model,
    sessions: n,
    turns,
    deadlineMs: PER_TURN_MS,
    hookMs: { off: stats(off.map((r) => r.ms)), assisted: stats(assisted.map((r) => r.ms)) },
    advised: assisted.filter((r) => r.stdout.includes('additionalContext')).length,
    statuses: Object.fromEntries(
      ['accepted', 'abstained', 'unavailable'].map((s) => [
        s,
        uses.filter((u) => u.status === s).length,
      ]),
    ),
    failures: reasons,
    hooksFailed: killed.map((r) => r.signal ?? `exit ${r.code}: ${r.stderr.trim().slice(0, 200)}`),
    crossSessionCacheHits: uses.filter((u) => u.cached).length,
  };
  report.addedMs = {
    p50: report.hookMs.assisted.p50 - report.hookMs.off.p50,
    p95: report.hookMs.assisted.p95 - report.hookMs.off.p95,
  };
  // No answer at all (a key that does not work, no network) is a failed run, not a measurement.
  const answered = report.statuses.accepted + report.statuses.abstained;
  report.gate =
    answered > 0 &&
    report.hookMs.assisted.p95 <= PER_TURN_MS &&
    report.crossSessionCacheHits === 0 &&
    killed.length === 0;
  const h = report.hookMs;
  console.log(
    `${n} sessions x ${turns} turns, model ${report.model}: hook off p50 ${h.off.p50} / p95 ${h.off.p95} ms; assisted p50 ${h.assisted.p50} / p95 ${h.assisted.p95} / max ${h.assisted.max} ms; added p50 ${report.addedMs.p50} / p95 ${report.addedMs.p95} ms (deadline ${PER_TURN_MS} ms)`,
  );
  console.log(
    `advice sent ${report.advised}/${assisted.length}; ${JSON.stringify(report.statuses)}; hooks killed or failed ${killed.length}`,
  );
  for (const [reason, count] of Object.entries(reasons))
    console.log(`  unavailable x${count}: ${reason}`);
  if (!answered) console.log('no assisted turn was answered: this run measures nothing');
  console.log(
    `cross-session cache hits: ${report.crossSessionCacheHits}; gate ${report.gate ? 'PASS' : 'FAIL'}`,
  );
  process.exitCode = report.gate ? 0 : 1;
  if (values.out) writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
} finally {
  for (const s of planted) {
    store.remove(s.id);
    rmSync(join(paths.decisions, `${s.id}.json`), { force: true });
    rmSync(join(paths.events, `${s.id}.jsonl`), { force: true });
  }
  for (const file of written) rmSync(file, { force: true });
  for (const step of undo) await step();
}
