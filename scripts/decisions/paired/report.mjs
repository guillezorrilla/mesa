// What a paired run (ADR-0019) records and reports, for either site it measures: a session's use
// of the Decision model, then the arms, the frozen gate's verdict per arm, the results file and
// the lines measured.ts takes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PAIRED_GATE,
  pairedArm,
  pairedVerdict,
} from '../../../packages/core/dist/decisions/evaluation/paired.js';

/** A JSON file's contents, or undefined when it is missing or unreadable. */
export const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

/** What session `id` used of the Decision model, from its decisions file in `dir`. */
export function decisionsOf(dir, id) {
  const state = readJson(join(dir, `${id}.json`)) ?? { use: [] };
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
 * Writes the results of `runs` to `out` (with `header` and each arm's `extra` summary, if any)
 * and prints each arm, the gate's verdict for every arm against `off`, and the arms as measured.ts
 * takes them, under `site`.
 */
export function report({ site, seed, dry, header, arms, reps, runs, out, extra = () => ({}) }) {
  const summary = Object.fromEntries(
    arms.map((a) => {
      const mine = runs.filter((r) => r.arm === a);
      return [a, { ...pairedArm(mine), ...extra(mine) }];
    }),
  );
  const verdicts = Object.fromEntries(
    arms.filter((a) => a !== 'off').map((a) => [a, pairedVerdict(runs, a)]),
  );
  writeFileSync(
    out,
    `${JSON.stringify({ site, seed, dryRun: dry, ...header, arms, reps, gate: PAIRED_GATE, summary, verdicts, runs }, null, 2)}\n`,
  );
  const secs = (ms) => (ms === null ? 'unbounded' : `${(ms / 1000).toFixed(1)} s`);
  for (const [arm, s] of Object.entries(summary))
    console.log(
      `${arm.padEnd(4)} ${s.successes}/${s.runs} solved, ${secs(s.msPerSuccess)} per solved task`,
    );
  // What measured.ts takes once the run is accepted: the arms only, under the site the run
  // exercised; it reads the verdict, and PAIRED_PASSED, from them.
  const measured = ({ runs, successes, wallMs }) =>
    `{ runs: ${runs}, successes: ${successes}, wallMs: ${wallMs} }`;
  console.log(`measured.ts OFF: ${measured(summary.off)}`);
  for (const [arm, v] of Object.entries(verdicts)) {
    const stub = dry ? ' [dry run: a stub agent, not a measurement]' : '';
    console.log(`paired gate ${arm}: ${v.pass ? 'PASS' : 'FAIL'} (${v.reason})${stub}`);
    console.log(
      `  measured.ts PAIRED_ARMS: ${arm}: { ${site}: { on: ${measured(v.on)}, off: OFF } },`,
    );
  }
  console.log(`results: ${out}`);
  return { summary, verdicts };
}
