import { homedir } from 'node:os';
import { expect, test } from 'vitest';
import { envRunner } from '../lib/process.js';
import { keychainStore, type SecretStore } from '../lib/secret-store.js';
import { loadConfig } from '../profile/config.js';
import { profilePaths } from '../profile/paths.js';
import { assistedSession, plantRelevanceVault, relevancePrompts } from '../testing/index.js';
import type { ScopedContext } from './context.js';
import { turnAdvice } from './delivery.js';
import type { SystemOneProvider } from './systemone.js';

// The relevance spike's live harness (#692, docs/spikes/relevance-abstention.md): the per-turn
// path (scoped context, an automatic evaluation, turnAdvice) per invented prompt per model, over
// the invented relevance vault. Skipped unless MESA_LIVE_RELEVANCE names the models, such as
// `clef,jev`. The keys are read, never written, from the default profile's Keychain items, and
// CLEF's account ID from its config; only counts, latency and cost are printed.

const LIVE = (process.env.MESA_LIVE_RELEVANCE ?? '')
  .split(',')
  .filter((m): m is SystemOneProvider => m === 'jev' || m === 'clef');

/** The Keychain, read only. */
function readOnly(store: SecretStore): SecretStore {
  const refuse = async (): Promise<never> => {
    throw new Error('the live relevance harness never writes the Keychain');
  };
  return { get: store.get, set: refuse, delete: refuse };
}

// Skipped, the test still lists one model, as vitest fails a file with no test.
test.skipIf(!LIVE.length).each(LIVE.length ? LIVE : ['clef'])(
  'live per-turn relevance over the invented vault: %s',
  async (model) => {
    const { mesa, put } = await assistedSession({
      model: 'none',
      experimental: true,
      deps: {
        http: fetch,
        secretStore: readOnly(keychainStore(envRunner(process.env))),
        clock: () => new Date(),
      },
    });
    if (model === 'clef') {
      const real = profilePaths(homedir(), 'default').config;
      const account = loadConfig(real).decisions.cloudflareAccount;
      if (!account) throw new Error('the default profile has no Cloudflare account ID');
      mesa.config.set('decisions.cloudflareAccount', JSON.stringify(account));
    }
    await mesa.decisions.use(model);
    plantRelevanceVault(put);
    const prompts = relevancePrompts();
    const groups = {
      offTopic: prompts.offTopic.map((prompt) => ({ prompt, note: undefined })),
      meta: prompts.meta.map((prompt) => ({ prompt, note: undefined })),
      onTopic: prompts.onTopic,
    };
    const report: Record<string, unknown> = { model };
    for (const [group, cases] of Object.entries(groups)) {
      const tally = { n: 0, noted: 0, right: 0, asked: 0, latencyMs: 0, costUsd: 0 };
      const reasons: Record<string, number> = {};
      for (const { prompt, note } of cases) {
        const context = (await mesa.decisions.evaluate(
          { site: 'relevance', query: prompt },
          { mode: 'automatic' },
        )) as ScopedContext;
        const { evaluation } = context;
        tally.n++;
        // A call was made when an answer came, or a call failed after taking time.
        if (evaluation.status !== 'unavailable' || evaluation.latencyMs > 0) tally.asked++;
        tally.latencyMs += evaluation.latencyMs;
        tally.costUsd += evaluation.costUsd ?? 0;
        if (evaluation.status === 'unavailable') {
          const why = evaluation.reason ?? 'unknown';
          reasons[why] = (reasons[why] ?? 0) + 1;
        }
        if (turnAdvice(context)) {
          tally.noted++;
          if (note && evaluation.answer === `note:${note}`) tally.right++;
        }
      }
      report[group] = { ...tally, unavailable: reasons };
    }
    process.stdout.write(`${JSON.stringify(report)}\n`);
    expect(report).toBeDefined();
  },
  120_000,
);
