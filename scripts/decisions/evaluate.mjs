// pnpm decisions:evaluate: scores a decisions backend on the invented corpus (ADR-0019).
//   --backend rules|jev|clef   rules (the default) needs nothing; jev reads TYPESAFE_API_KEY;
//                              clef reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
//   --model clef|clef-flash    the CLEF size (default: the one Mesa ships)
//   --dataset calibration|heldout
//   --json                     the full report; otherwise a table per site
// On calibration it also prints the thresholds ADR-0019's rule fits (`fit`); copy them into
// ACCEPT_AT and commit before any held-out run. Each request may take 60 s: this measures
// quality, not the per-turn deadline. Keys are read from the environment and never printed.
import { parseArgs } from 'node:util';
import { readCorpus } from '../../packages/core/dist/decisions/evaluation/corpus.js';
import {
  fitAcceptAt,
  meetsGate,
  report,
  runCases,
} from '../../packages/core/dist/decisions/evaluation/evaluation.js';
import { ACCEPT_AT } from '../../packages/core/dist/decisions/sites.js';
import {
  SYSTEM_ONE_MODELS,
  systemOneBackend,
} from '../../packages/core/dist/decisions/systemone.js';

const { values } = parseArgs({
  options: {
    backend: { type: 'string', default: 'rules' },
    model: { type: 'string' },
    dataset: { type: 'string', default: 'heldout' },
    json: { type: 'boolean', default: false },
  },
});
const fail = (message) => {
  console.error(message);
  process.exit(2);
};
if (!['rules', 'jev', 'clef'].includes(values.backend)) fail('--backend: rules, jev or clef');
if (values.model && (values.backend !== 'clef' || !['clef', 'clef-flash'].includes(values.model)))
  fail('--model: clef or clef-flash, with --backend clef');
if (!['calibration', 'heldout'].includes(values.dataset)) fail('--dataset: calibration or heldout');

const env = (name) => process.env[name] || fail(`${name} is not set`);
const backend =
  values.backend === 'rules'
    ? undefined
    : systemOneBackend({
        provider: values.backend,
        http: fetch,
        key: env(values.backend === 'jev' ? 'TYPESAFE_API_KEY' : 'CLOUDFLARE_API_TOKEN'),
        ...(values.backend === 'clef' ? { accountId: env('CLOUDFLARE_ACCOUNT_ID') } : {}),
        model: values.model ?? SYSTEM_ONE_MODELS[values.backend],
        deadlineMs: 60_000,
      });

const cases = readCorpus(
  new URL(
    `../../packages/core/src/decisions/evaluation/corpus/${values.dataset}.jsonl`,
    import.meta.url,
  ).pathname,
);
const clock = () => new Date(performance.timeOrigin + performance.now());
const acceptAt = backend && ACCEPT_AT[values.backend];
const results = await runCases({ model: backend && { backend, acceptAt }, clock }, cases);
// No answer at all (a key that does not work, no network) is a failed run, not a report.
if (results.every((r) => 'unavailable' in r)) {
  console.error(`no case was answered: ${results[0]?.unavailable}`);
  process.exit(1);
}
const out = report(values.backend, values.dataset, results, acceptAt);
const baseline =
  values.backend === 'rules'
    ? undefined
    : report('rules', values.dataset, await runCases({ clock }, cases));
for (const [site, s] of Object.entries(out.sites))
  s.gate = meetsGate(site, s, baseline?.sites[site]);
const fit = backend && values.dataset === 'calibration' ? fitAcceptAt(results) : undefined;

if (values.json) {
  console.log(
    JSON.stringify({ ...out, ...(fit ? { fit } : {}), baseline: baseline?.sites }, null, 2),
  );
} else {
  const pct = (x) => (x === null ? '  -  ' : `${(100 * x).toFixed(1)}%`);
  for (const [site, s] of Object.entries(out.sites)) {
    console.log(
      `${site.padEnd(12)} n=${s.n} accepted=${s.accepted} coverage=${pct(s.coverage)} selective=${pct(s.selectiveAccuracy)} accuracy=${pct(s.accuracy)} unavailable=${s.unavailable} p50=${s.latencyMs.p50.toFixed(0)}ms p95=${s.latencyMs.p95.toFixed(0)}ms gate=${s.gate ? 'pass' : 'fail'}`,
    );
  }
  if (fit) console.log(`fit: ${JSON.stringify(fit)}`);
}
