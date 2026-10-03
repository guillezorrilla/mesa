// pnpm decisions:evaluate: scores a decisions backend on the invented corpus (ADR-0019).
//   --backend rules|strands   rules (the default) needs nothing; strands needs a running server
//   --dataset calibration|heldout
//   --url http://127.0.0.1:8099   the strands server
//   --json                    the full report; otherwise a table per site
import { parseArgs } from 'node:util';
import { readCorpus } from '../../packages/core/dist/decisions/corpus.js';
import { meetsGate, report, runCases } from '../../packages/core/dist/decisions/evaluation.js';
import { strandsBackend } from '../../packages/core/dist/decisions/strands.js';

const { values } = parseArgs({
  options: {
    backend: { type: 'string', default: 'rules' },
    dataset: { type: 'string', default: 'heldout' },
    url: { type: 'string', default: 'http://127.0.0.1:8099' },
    json: { type: 'boolean', default: false },
  },
});
if (!['rules', 'strands'].includes(values.backend)) throw new Error('--backend: rules or strands');
if (!['calibration', 'heldout'].includes(values.dataset))
  throw new Error('--dataset: calibration or heldout');

const cases = readCorpus(
  new URL(`../../packages/core/src/decisions/corpus/${values.dataset}.jsonl`, import.meta.url)
    .pathname,
);
const clock = () => new Date(performance.timeOrigin + performance.now());
const backend =
  values.backend === 'strands'
    ? strandsBackend({ http: fetch, url: values.url, deadlineMs: 60_000 })
    : undefined;
const results = await runCases({ backend, clock }, cases);
const out = report(values.backend, values.dataset, results);
const baseline =
  values.backend === 'rules'
    ? undefined
    : report('rules', values.dataset, await runCases({ clock }, cases));
for (const [site, s] of Object.entries(out.sites))
  s.gate = meetsGate(site, s, baseline?.sites[site]);

if (values.json) {
  console.log(JSON.stringify({ ...out, baseline: baseline?.sites }, null, 2));
} else {
  const pct = (x) => (x === null ? '  -  ' : `${(100 * x).toFixed(1)}%`);
  for (const [site, s] of Object.entries(out.sites)) {
    console.log(
      `${site.padEnd(12)} n=${s.n} accepted=${s.accepted} coverage=${pct(s.coverage)} selective=${pct(s.selectiveAccuracy)} accuracy=${pct(s.accuracy)} unavailable=${s.unavailable} p50=${s.latencyMs.p50.toFixed(0)}ms p95=${s.latencyMs.p95.toFixed(0)}ms gate=${s.gate ? 'pass' : 'fail'}`,
    );
  }
}
