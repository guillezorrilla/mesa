// pnpm vault:capture-model: replays the `vault-capture` skill on several models over the same real
// capture inputs (#1057, docs/spikes/capture-model.md). For each session it builds the input a
// capture would read now (captureInput: the messages newer than its last capture), then runs the
// launch a capture gets (the lean flags, mesa-vault with its write tools disallowed) once per model.
// Nothing lands: the run's JSON is only read. Its inputs are the person's conversations, so --out
// must be a folder outside the repo; only the aggregates of --report belong in a spike.
//
//   --sessions a,b       the sessions to replay (required)
//   --out <dir>          where inputs, runs.json and the report go, outside the repo (required)
//   --profile default    the profile the sessions are in; it is only read
//   --models haiku,sonnet
//   --report <grades>    no runs: the aggregates per model from <out>/runs.json and a grades file,
//                        {"<session>:<model>": {"items": ["keep" | "drop" | "dup", ...], "missed": n}};
//                        a run whose output did not read may carry its retry: `firstError`, the
//                        retry's items, and both runs' cost and time
//
// Two differences from a real run, the same for every model: the repo's skills/vault-capture is
// linked into a scratch folder the run starts in, with the project added (--add-dir, its CLAUDE.md
// read too), since a project's own stale link to the skill library would win over the repo's
// skill; and mesa-vault binds to a live session of the same project, as a real run's vault server
// binds to the run's own record on that project.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AGENTS } from '../../packages/core/dist/agents/agents.js';
import { launchMounts } from '../../packages/core/dist/agents/mesa-mount.js';
import { createContext } from '../../packages/core/dist/context.js';
import { WINDOW_VARS } from '../../packages/core/dist/lib/window-vars.js';
import { readRegistry } from '../../packages/core/dist/projects/registry.js';
import { VAULT_CAPTURE } from '../../packages/core/dist/skills/library.js';
import { captureInput } from '../../packages/core/dist/vault/capture/input.js';
import { captureItems } from '../../packages/core/dist/vault/capture/items.js';
import { CLI, needCli, usage } from '../decisions/lib.mjs';

const { values } = parseArgs({
  options: {
    sessions: { type: 'string' },
    out: { type: 'string' },
    profile: { type: 'string', default: 'default' },
    models: { type: 'string', default: 'haiku,sonnet' },
    report: { type: 'string' },
  },
});
const REPO = new URL('../..', import.meta.url).pathname;
if (!values.out) usage('--out <dir>: a folder outside the repo');
const out = resolve(values.out);
if (`${out}/`.startsWith(REPO))
  usage('--out must be outside the repo: its inputs are real conversations');
const models = values.models.split(',');
const runsFile = join(out, 'runs.json');

if (values.report) {
  report(
    JSON.parse(readFileSync(runsFile, 'utf8')),
    JSON.parse(readFileSync(values.report, 'utf8')),
  );
  process.exit(0);
}
if (!values.sessions) usage('--sessions a,b: the sessions to replay');
needCli(usage);

const ctx = createContext(values.profile, {
  home: homedir(),
  env: process.env,
  run: () => {
    throw new Error('no commands');
  },
  sleep: async () => {},
  self: [process.execPath, CLI],
});
const { config } = ctx.open();
const projects = new Map(readRegistry(ctx.paths.registry).map((p) => [p.name, p.path]));
const records = ctx.store.list();
const mounts = launchMounts([process.execPath, CLI], { decisions: false });

// The scratch folder each run starts in, holding only the repo's skill.
const cwd = join(out, 'cwd');
rmSync(cwd, { recursive: true, force: true });
mkdirSync(join(cwd, '.claude', 'skills'), { recursive: true });
symlinkSync(join(REPO, 'skills', VAULT_CAPTURE), join(cwd, '.claude', 'skills', VAULT_CAPTURE));
mkdirSync(join(out, 'inputs'), { recursive: true, mode: 0o700 });

const runs = [];
for (const id of values.sessions.split(',')) {
  const about = ctx.store.get(id);
  const input = captureInput(ctx, about, about.capture?.through);
  if (!input) usage(`session ${id} has no message newer than its last capture`);
  writeFileSync(join(out, 'inputs', `${id}.txt`), input.text, { mode: 0o600 });
  const live = records.find(
    (r) => r.project === about.project && r.kind === 'interactive' && !r.endedAt,
  );
  if (!live) usage(`no live session on ${about.project} for mesa-vault to bind to`);
  const env = { ...process.env, CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' };
  for (const name of WINDOW_VARS) delete env[name];
  Object.assign(env, { MESA_SESSION_ID: live.id, MESA_PROFILE: values.profile });
  for (const model of models) {
    const may = { ...config.run, readOnlyVault: true, lean: { model, mcp: 'vault' } };
    const launch = AGENTS.claude.headless
      .command(randomUUID(), `/${VAULT_CAPTURE}`, may, cwd, mounts)
      .replace(
        /^claude -p /,
        `claude --add-dir '${projects.get(about.project)}' --no-session-persistence -p `,
      );
    const started = Date.now();
    const done = spawnSync('/bin/sh', ['-c', launch], {
      cwd,
      env,
      input: input.text,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 64 << 20,
    });
    const row = { session: id, model, messages: input.count, ms: Date.now() - started };
    try {
      const result = JSON.parse(done.stdout);
      Object.assign(row, {
        cost: result.total_cost_usd,
        turns: result.num_turns,
        result: result.result,
      });
      row.items = captureItems(result.result ?? '');
    } catch (error) {
      row.error = String(error instanceof Error ? error.message : error).slice(0, 300);
    }
    runs.push(row);
    console.error(
      `${id} ${model}: ${row.items ? `${row.items.length} items` : row.error} in ${row.ms} ms`,
    );
    writeFileSync(runsFile, JSON.stringify(runs, null, 2), { mode: 0o600 });
  }
}

/** The aggregates per model, the only part of a run that may leave this machine. */
function report(runs, grades) {
  const rows = models.map((model) => {
    const mine = runs.filter((r) => r.model === model);
    const count = (g) =>
      mine.reduce(
        (n, r) =>
          n + (grades[`${r.session}:${r.model}`]?.items ?? []).filter((x) => x === g).length,
        0,
      );
    const sum = (f) => mine.reduce((n, r) => n + (f(r) ?? 0), 0);
    return [
      model,
      mine.length,
      sum((r) => r.items?.length),
      count('keep'),
      count('drop'),
      count('dup'),
      sum((r) => grades[`${r.session}:${r.model}`]?.missed),
      `$${(sum((r) => r.cost) / mine.length).toFixed(3)}`,
      `${Math.round(sum((r) => r.ms) / mine.length / 1000)} s`,
      mine.filter((r) => r.error || r.firstError).length,
    ];
  });
  const head = [
    'Model',
    'Runs',
    'Items',
    'Kept, pass the bar',
    'Wrongly kept, should drop',
    'Wrongly kept, duplicate',
    'Decisions missed',
    'Cost per run',
    'Time per run',
    'Unreadable first tries',
  ];
  const line = (cells) => `| ${cells.join(' | ')} |`;
  console.log([line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n'));
}
